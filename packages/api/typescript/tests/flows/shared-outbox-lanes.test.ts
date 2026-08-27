// SHARED-OUTBOX LANES — the executable proof of decision (d), over a real shared SQLite file.
//
// WHAT IS AT STAKE. `shared_outbox` has THREE producers and, after this phase, three claimants:
// `api` (this daemon's LibSqlOutboxDispatcher), `gateway` (the Go dispatcher), `integration`
// (the gateway's egress, consumed by SqlExternalMediator). Before the lane predicate, the TS
// dispatcher claimed EVERY unprocessed row — it stole the gateway's rows, found no TS handler,
// and tombstoned them. Silent data loss, and the console stuck on DISCONNECTED with a full
// outbox. That is the bug these cases exist to keep dead.
//
// WHY A REAL FILE AND NOT `mock` DI. The lane predicate, the lease, the poison sweep and the
// owner-skip are all SQL. A mocked outbox asserts the shape of the test, not the behaviour of the
// dispatcher, so this flow runs against a file-backed LibSqlDriver — the same driver the daemon
// boots with.
//
// TIME IS MOVED BY REWINDING ROWS, NOT BY SLEEPING. "Advance the clock 31s" is expressed as
// `lease_until -= 31s`, which is exactly the state the clock would produce and is instant and
// deterministic. Same trick LibSqlCommandQueue.test.ts uses for `run_at`.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { eq, sql } from 'drizzle-orm'
import * as schema from '@codm/contracts/db'
import { outbox } from '@codm/contracts/db'
import { migrationsDir } from '@codm/contracts/db/migrations'
import { ProductConfig } from '@shared/config/ProductConfig'
import {
	LibSqlDomainEventRepository,
	LibSqlOutboxDispatcher,
	InternalMediator,
	LibSqlDriver,
	MockLoggingService,
	SqlExternalMediator,
	type BaseEvent,
	type EventCallback,
	type Handler,
	type Unsubscribe,
} from '@codm/core-typescript'

const API_EVENT = 'thread.message.appended'
const GATEWAY_EVENT = 'channel.message.received'
const INGRESS_EVENT = 'integration.channel_message.received'
const UNHANDLED_INGRESS_EVENT = 'integration.channel.connected'
const OWNER = 'owner-lanes'
const LEASE_MS = 30_000

/**
 * A controllable InternalMediator. The `api` lane's dispatcher hands every claimed domain event
 * here, so this is the seam that decides whether a row "succeeds" or "fails".
 */
class ScriptedInternalMediator extends InternalMediator {
	readonly delivered: string[] = []
	failNames = new Set<string>()

	register(): void {}
	async execute(): Promise<never> {
		throw new Error('not used')
	}
	async publish(event: BaseEvent): Promise<void> {
		await this.dispatch(event)
	}
	async dispatch(event: BaseEvent): Promise<void> {
		const key = String((event as unknown as { entityId?: string }).entityId ?? event.name)
		if (this.failNames.has(key)) throw new Error(`scripted failure for ${key}`)
		this.delivered.push(key)
	}
	removeAllListeners(): void {}
	registerCallback(_callback: EventCallback): Unsubscribe {
		return () => {}
	}
}

describe('shared_outbox lanes (api / gateway / integration) over one file', () => {
	let dir: string
	let driver: LibSqlDriver
	let internal: ScriptedInternalMediator
	let external: SqlExternalMediator
	let dispatcher: LibSqlOutboxDispatcher

	const makeHandler = (name: string) => {
		const calls: unknown[] = []
		const handler = {
			name,
			events: [name],
			bindContainer() {
				return handler
			},
			async execute(input: unknown) {
				calls.push(input)
			},
		} as unknown as Handler
		return { handler, calls }
	}

	/**
	 * Insert a row DIRECTLY, the way the OTHER process would. That is the point: the gateway's rows
	 * are not written by anything in this runtime, so seeding them by hand is the faithful shape.
	 */
	const seed = async (over: Partial<typeof outbox.$inferInsert> = {}): Promise<string> => {
		const id = (over.id as string) ?? crypto.randomUUID()
		await driver.transaction(tx =>
			tx.insert(outbox).values({
				id,
				name: API_EVENT,
				entityId: id,
				ownerId: OWNER,
				source: 'api',
				payload: { name: API_EVENT, id, entityId: id, time: new Date().toISOString(), payload: {} },
				// `over.id` is already folded into `id` above, so the spread cannot diverge from the
				// value this helper returns.
				...over,
			}),
		)
		return id
	}

	const row = async (id: string) => (await driver.db.select().from(outbox).where(eq(outbox.id, id)))[0]

	/** "31 seconds pass" — the lease expires where it sits. */
	const expireLeases = async () =>
		driver.transaction(tx =>
			tx.run(sql`UPDATE ${outbox} SET lease_until = lease_until - ${LEASE_MS + 1_000} WHERE lease_until IS NOT NULL`),
		)

	beforeAll(async () => {
		dir = mkdtempSync(join(tmpdir(), 'codm-outbox-lanes-'))
		driver = new LibSqlDriver({ schema, migrationsDir, dbPath: join(dir, ProductConfig.env.CODM_DB_FILE_NAME) })
		await driver.runMigrations()
	})

	afterAll(() => {
		rmSync(dir, { recursive: true, force: true })
	})

	beforeEach(async () => {
		await driver.reset()
		internal = new ScriptedInternalMediator()
		external = new SqlExternalMediator(driver, new LibSqlDomainEventRepository(driver))
		dispatcher = new LibSqlOutboxDispatcher(driver, internal, external, new MockLoggingService())
	})

	it('1 — NO THEFT: the api dispatcher leaves the gateway lane completely untouched', async () => {
		const mine = await seed()
		const theirs = await seed({ source: 'gateway', name: GATEWAY_EVENT })

		await dispatcher.flush()

		expect((await row(mine))?.processedAt).toBeInstanceOf(Date)

		// The whole bug in one assertion: the gateway's row must still be there, unclaimed, uncharged.
		// (Not deleted, either — the Go re-persist is INSERT ... ON CONFLICT DO NOTHING, so a deleted
		// id is a re-insertable id.)
		const stolen = await row(theirs)
		expect({
			exists: stolen !== undefined,
			processedAt: stolen?.processedAt ?? null,
			claimedBy: stolen?.claimedBy ?? null,
			attempts: stolen?.attempts,
		}).toEqual({ exists: true, processedAt: null, claimedBy: null, attempts: 0 })
	})

	it('2 — INGRESS: the integration lane arrives with RFC3339 payload dates REVIVED, and terminates', async () => {
		const { handler, calls } = makeHandler(INGRESS_EVENT)
		await external.register(handler)

		// The Go wire envelope: nested { id, ownerId, time, name, payload } with an RFC3339 field.
		const id = await seed({
			source: 'integration',
			name: INGRESS_EVENT,
			payload: {
				id: crypto.randomUUID(),
				ownerId: OWNER,
				time: '2026-07-26T10:11:12Z',
				name: INGRESS_EVENT,
				payload: { receivedAt: '2026-07-26T10:11:12Z', text: 'hi' },
			},
		})

		expect(await external.drainOnce()).toBe(1)
		expect(calls).toHaveLength(1)

		const envelope = calls[0] as { payload: { receivedAt: unknown; text: unknown } }
		// A STRING here is rejected by every downstream z.date() — which is the failure mode that
		// leaves the console DISCONNECTED with a full outbox, i.e. the symptom wearing a new hat.
		expect(envelope.payload.receivedAt).toBeInstanceOf(Date)
		expect((envelope.payload.receivedAt as Date).toISOString()).toBe('2026-07-26T10:11:12.000Z')
		expect(envelope.payload.text).toBe('hi')

		// AND the row TERMINATED. Without this, a successful ingress would be re-claimed on every
		// lease expiry forever, re-running the handler, and nothing above would notice.
		const after = await row(id)
		expect({ processed: after?.processedAt instanceof Date, claimedBy: after?.claimedBy ?? null }).toEqual({
			processed: true,
			claimedBy: null,
		})
	})

	it('3 — NAME FILTER: an integration row with no registered handler is not claimed', async () => {
		const { handler } = makeHandler(INGRESS_EVENT)
		await external.register(handler)
		const unhandled = await seed({ source: 'integration', name: UNHANDLED_INGRESS_EVENT })

		expect(await external.drainOnce()).toBe(0)

		const after = await row(unhandled)
		// Not even the attempt is charged: claiming what cannot be delivered burns the retry budget
		// and eventually dead-letters the gateway's traffic.
		expect({ attempts: after?.attempts, claimedBy: after?.claimedBy ?? null }).toEqual({ attempts: 0, claimedBy: null })
	})

	it('4 — TOMBSTONE, NOT DELETE: a succeeded api row survives with processed_at set', async () => {
		const id = await seed()

		await dispatcher.flush()

		const after = await row(id)
		expect({ exists: after !== undefined, processed: after?.processedAt instanceof Date, claimedBy: after?.claimedBy ?? null }).toEqual({
			exists: true,
			processed: true,
			claimedBy: null,
		})
	})

	it('5 — LEASE SURVIVES A CRASH: a claim that never finalized comes back when the lease expires', async () => {
		const id = await seed()

		// A crash is exactly "claimed, never finalized". Driving the real claim and then dropping the
		// batch on the floor reproduces that state through production code rather than describing it.
		await (dispatcher as unknown as { claimBatch(): Promise<unknown[]> }).claimBatch()

		const claimed = await row(id)
		expect({ claimed: claimed?.claimedBy !== null, attempts: claimed?.attempts, processed: claimed?.processedAt }).toEqual({
			claimed: true,
			attempts: 1,
			processed: null,
		})

		// Still leased ⇒ invisible to the next cycle.
		await dispatcher.flush()
		expect(internal.delivered).toEqual([])

		await expireLeases()
		await dispatcher.flush()
		expect(internal.delivered).toEqual([id])
	})

	it('6 — RETRY KEEPS THE LEASE: a failed handler records the error and stays leased (that IS the backoff)', async () => {
		const id = await seed()
		internal.failNames.add(id)

		await dispatcher.flush()

		const after = await row(id)
		expect({
			attempts: after?.attempts,
			hasError: (after?.lastError ?? '').includes('scripted failure'),
			leaseInFuture: (after?.leaseUntil?.getTime() ?? 0) > Date.now(),
			processedAt: after?.processedAt ?? null,
		}).toEqual({ attempts: 1, hasError: true, leaseInFuture: true, processedAt: null })
	})

	it('7 — DEAD-LETTER: the 5th failure terminates the row via dead_at, NOT processed_at', async () => {
		const id = await seed({ attempts: 4 }) // the claim charges the 5th
		internal.failNames.add(id)

		await dispatcher.flush()

		const after = await row(id)
		// dead_at is its own tombstone — processed_at means "delivered", and this row never was.
		expect({
			attempts: after?.attempts,
			dead: after?.deadAt instanceof Date,
			processedAt: after?.processedAt ?? null,
			claimedBy: after?.claimedBy ?? null,
		}).toEqual({
			attempts: 5,
			dead: true,
			processedAt: null,
			claimedBy: null,
		})
	})

	it("8 — OWNER ORDER WITHIN ONE CLAIM BATCH: a failed predecessor's successor keeps the SAME lease and cannot overtake it", async () => {
		// The guarantee being pinned is INTRA-BATCH, and the title says so on purpose. Across batches
		// it does NOT hold — a successor beyond BATCH_SIZE, or one written by a handler DURING the
		// flush, carries no lease and can be claimed while its predecessor serves its 30s backoff.
		// A case called "owner ordering" would sell a global promise the dispatcher does not make.
		const base = Date.now() - 10_000
		const first = await seed({ id: 'aaaa-first', createdAt: new Date(base) })
		const second = await seed({ id: 'bbbb-second', createdAt: new Date(base + 1_000) })
		internal.failNames.add(first)

		await dispatcher.flush()

		expect(internal.delivered).toEqual([]) // the successor must NOT have been delivered

		const a = await row(first)
		const b = await row(second)
		expect({
			attempts: a?.attempts,
			leaseInFuture: (a?.leaseUntil?.getTime() ?? 0) > Date.now(),
			processedAt: a?.processedAt ?? null,
		}).toEqual({
			attempts: 1,
			leaseInFuture: true,
			processedAt: null,
		})
		// THE CORE OF THE CORRECTION: the skipped successor still carries the failed predecessor's
		// token and lease. Releasing it would make B claimable on the very next cycle — delivering a
		// later event of the same owner before the retry of the earlier one.
		expect({ claimedBy: b?.claimedBy, leaseUntil: b?.leaseUntil?.getTime(), processedAt: b?.processedAt ?? null }).toEqual({
			claimedBy: a?.claimedBy,
			leaseUntil: a?.leaseUntil?.getTime(),
			processedAt: null,
		})

		// An immediate cycle delivers NEITHER — both are leased.
		await dispatcher.flush()
		expect(internal.delivered).toEqual([])

		// After the lease expires and the handler recovers: the predecessor goes FIRST.
		internal.failNames.clear()
		await expireLeases()
		await dispatcher.flush()
		expect(internal.delivered).toEqual([first, second])
	})

	it('9 — CRASH-LOOP HAS A CEILING: 5 claims without finalize stop the row, and the poison sweep terminates it', async () => {
		const id = await seed()
		const claim = (dispatcher as unknown as { claimBatch(): Promise<unknown[]> }).claimBatch.bind(dispatcher)

		// Five cycles that claim and never finalize — the shape of a process that dies mid-dispatch.
		// `attempts` counts executions STARTED, so this is what stops an unbreakable crash loop.
		for (let cycle = 0; cycle < 5; cycle++) {
			expect(await claim()).toHaveLength(1)
			await expireLeases()
		}
		expect((await row(id))?.attempts).toBe(5)

		// Budget burnt: no further claim, no matter how much time passes.
		expect(await claim()).toHaveLength(0)
		await expireLeases()
		expect(await claim()).toHaveLength(0)

		// …and it does not sit there invisible: neither claimable (ceiling) nor terminal (never
		// finalized). The poison sweep at the head of the claim is what collects it — via dead_at,
		// NOT processed_at, so it never gets mistaken for a delivered event.
		const swept = await row(id)
		expect({
			attempts: swept?.attempts,
			dead: swept?.deadAt instanceof Date,
			processedAt: swept?.processedAt ?? null,
			claimedBy: swept?.claimedBy ?? null,
			poisoned: (swept?.lastError ?? '').includes('poison'),
		}).toEqual({ attempts: 5, dead: true, processedAt: null, claimedBy: null, poisoned: true })
	})

	it('9b — CONTRAST: a handler that THROWS charges attempts once per cycle, never twice', async () => {
		// The bug this catches is charging at claim AND at finalize, which halves the retry budget
		// silently. Two full failing cycles must read 2, not 4.
		const id = await seed()
		internal.failNames.add(id)

		await dispatcher.flush()
		expect((await row(id))?.attempts).toBe(1)

		await expireLeases()
		await dispatcher.flush()
		expect((await row(id))?.attempts).toBe(2)
	})
})
