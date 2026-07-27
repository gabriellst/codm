// SqlExternalMediator — the shared-outbox INGRESS, i.e. the Go gateway's egress lane consumed by
// this daemon. The transport is the database file, so everything here is exercised against a real
// one: lane partitioning, the handler-name filter, the date reviver, and the full outcome table.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import * as schema from '@codedm/contracts/db'
import { outbox } from '@codedm/contracts/db'
import { migrationsDir } from '@codedm/contracts/db/migrations'
import { LibsqlDriver } from '../../db/drivers/LibsqlDriver'
import type { Handler } from '../../types/Handler'
import { SqlExternalMediator } from './SqlExternalMediator'

const EVENT = 'integration.channel_message.received'
const OTHER_EVENT = 'integration.channel.connected'

describe('SqlExternalMediator (shared-outbox ingress)', () => {
	let dir: string
	let driver: LibsqlDriver
	let mediator: SqlExternalMediator

	const makeHandler = (name: string, fn?: (input: unknown) => Promise<unknown>) => {
		const calls: unknown[] = []
		const handler = {
			name,
			events: [name],
			bindContainer() {
				return handler
			},
			async execute(input: unknown) {
				calls.push(input)
				return fn ? fn(input) : undefined
			},
		} as unknown as Handler
		return { handler, calls }
	}

	const seed = async (over: Partial<typeof outbox.$inferInsert> & { payload?: Record<string, unknown> } = {}): Promise<string> => {
		const id = crypto.randomUUID()
		await driver.transaction(tx =>
			tx.insert(outbox).values({
				id,
				name: EVENT,
				ownerId: 'owner-1',
				source: 'integration',
				payload: { name: EVENT, ownerId: 'owner-1', payload: { receivedAt: '2026-07-26T10:11:12Z', text: 'hi' } },
				...over,
			}),
		)
		return id
	}

	const row = async (id: string) => (await driver.db.select().from(outbox).where(eq(outbox.id, id)))[0]

	beforeAll(async () => {
		dir = mkdtempSync(join(tmpdir(), 'libsql-ingress-test-'))
		driver = new LibsqlDriver({ schema, migrationsDir, dbPath: join(dir, 'codedm.db') })
		await driver.runMigrations()
	})

	afterAll(() => {
		rmSync(dir, { recursive: true, force: true })
	})

	beforeEach(async () => {
		await driver.reset()
		mediator = new SqlExternalMediator(driver)
	})

	it('claims NOTHING while no external handler is registered', async () => {
		const id = await seed()
		expect(await mediator.drainOnce()).toBe(0)
		// Not even the attempt is charged — claiming what we cannot deliver would burn the budget.
		const after = await row(id)
		expect(after?.attempts).toBe(0)
		expect(after?.claimedBy).toBeNull()
	})

	it('claims ONLY the integration lane — never the api or gateway lanes', async () => {
		const { handler, calls } = makeHandler(EVENT)
		await mediator.register(handler)

		const mine = await seed()
		const apiRow = await seed({ source: 'api' })
		const gatewayRow = await seed({ source: 'gateway' })

		expect(await mediator.drainOnce()).toBe(1)
		expect(calls).toHaveLength(1)
		expect((await row(mine))?.processedAt).toBeInstanceOf(Date)
		// Untouched: another consumer owns those lanes.
		expect((await row(apiRow))?.attempts).toBe(0)
		expect((await row(gatewayRow))?.attempts).toBe(0)
		expect((await row(apiRow))?.processedAt).toBeNull()
	})

	it('claims only rows whose NAME has a registered handler', async () => {
		const { handler, calls } = makeHandler(EVENT)
		await mediator.register(handler)

		const known = await seed()
		const unknown = await seed({ name: OTHER_EVENT })

		expect(await mediator.drainOnce()).toBe(1)
		expect(calls).toHaveLength(1)
		expect((await row(known))?.processedAt).toBeInstanceOf(Date)
		expect((await row(unknown))?.attempts).toBe(0)
	})

	it('REVIVES RFC3339 dates in the payload — a string here rejects every downstream z.date()', async () => {
		const { handler, calls } = makeHandler(EVENT)
		await mediator.register(handler)
		await seed()

		await mediator.drainOnce()

		const envelope = calls[0] as { payload: { receivedAt: unknown; text: unknown } }
		expect(envelope.payload.receivedAt).toBeInstanceOf(Date)
		expect((envelope.payload.receivedAt as Date).toISOString()).toBe('2026-07-26T10:11:12.000Z')
		// A plain string must NOT be coerced.
		expect(envelope.payload.text).toBe('hi')
	})

	it('folds a FLAT Go wire envelope back into { name, ownerId, payload }', async () => {
		const { handler, calls } = makeHandler(EVENT)
		await mediator.register(handler)
		await seed({
			payload: { name: EVENT, ownerId: 'owner-1', occurredAt: '2026-07-26T10:11:12Z', remoteId: 'r-1', fromMe: false },
		})

		await mediator.drainOnce()

		const envelope = calls[0] as { name: string; ownerId: string; payload: Record<string, unknown> }
		expect(envelope.name).toBe(EVENT)
		expect(envelope.ownerId).toBe('owner-1')
		expect(envelope.payload).toEqual({ remoteId: 'r-1', fromMe: false })
	})

	it('success TOMBSTONES the row (processed_at + released token) instead of deleting it', async () => {
		const { handler } = makeHandler(EVENT)
		await mediator.register(handler)
		const id = await seed()

		await mediator.drainOnce()

		const after = await row(id)
		expect(after).toBeDefined() // the Go re-persist is INSERT … ON CONFLICT DO NOTHING: a deleted id is re-insertable
		expect(after?.processedAt).toBeInstanceOf(Date)
		expect(after?.claimedBy).toBeNull()
		expect(after?.attempts).toBe(1)
	})

	it('failure below the ceiling records last_error and KEEPS the lease (that IS the backoff)', async () => {
		const { handler } = makeHandler(EVENT, async () => {
			throw new Error('handler blew up')
		})
		await mediator.register(handler)
		const id = await seed()

		await mediator.drainOnce()

		const after = await row(id)
		expect(after?.processedAt).toBeNull() // not terminal
		expect(after?.lastError).toContain('handler blew up')
		expect(after?.attempts).toBe(1) // charged at CLAIM, not at failure
		expect(after?.leaseUntil).toBeInstanceOf(Date)
		expect(after?.claimedBy).not.toBeNull()

		// Still leased ⇒ the very next cycle must not re-deliver it.
		expect(await mediator.drainOnce()).toBe(0)
		expect((await row(id))?.attempts).toBe(1)
	})

	it('failure AT the ceiling dead-letters', async () => {
		const { handler } = makeHandler(EVENT, async () => {
			throw new Error('still broken')
		})
		await mediator.register(handler)
		const id = await seed({ attempts: 4 }) // claim bumps to 5 = MAX_ATTEMPTS

		await mediator.drainOnce()

		const after = await row(id)
		expect(after?.attempts).toBe(5)
		expect(after?.processedAt).toBeInstanceOf(Date)
		expect(after?.claimedBy).toBeNull()
		expect(after?.lastError).toContain('still broken')
	})

	it('sweeps POISON: a row that burned its budget crashing is neither claimable nor terminal', async () => {
		const { handler, calls } = makeHandler(EVENT)
		await mediator.register(handler)
		// Budget burned by claims that never finalized (the process died each time), lease expired.
		const id = await seed({ attempts: 5, leaseUntil: new Date(Date.now() - 1_000), claimedBy: 'dead-worker' })

		expect(await mediator.drainOnce()).toBe(0)
		expect(calls).toHaveLength(0)

		const after = await row(id)
		expect(after?.processedAt).toBeInstanceOf(Date)
		expect(after?.claimedBy).toBeNull()
		expect(after?.lastError).toContain('poison')
	})

	it('an EXPIRED lease is re-claimable', async () => {
		const { handler, calls } = makeHandler(EVENT)
		await mediator.register(handler)
		const id = await seed({ attempts: 1, leaseUntil: new Date(Date.now() - 1_000), claimedBy: 'dead-worker' })

		expect(await mediator.drainOnce()).toBe(1)
		expect(calls).toHaveLength(1)
		expect((await row(id))?.attempts).toBe(2)
	})

	it('the OUTBOUND path writes NO row — TS integration events already travel on the api lane', async () => {
		const { handler, calls } = makeHandler(EVENT)
		await mediator.register(handler)

		// biome-ignore lint/suspicious/noExplicitAny: minimal BaseEvent-shaped literal for the fan-out
		const event = { name: EVENT, id: crypto.randomUUID(), time: new Date().toISOString(), payload: {} } as any
		await mediator.dispatch(event)
		await mediator.publish(event)

		expect(calls.length).toBeGreaterThanOrEqual(1)
		const rows = await driver.db.select().from(outbox)
		expect(rows).toHaveLength(0) // a second row would deliver everything twice
	})
})
