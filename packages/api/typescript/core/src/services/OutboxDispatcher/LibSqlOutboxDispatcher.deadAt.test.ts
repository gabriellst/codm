// LibSqlOutboxDispatcher — death is stamped as death, not as `processed_at`.
//
// `processed_at` used to carry two incompatible meanings: "delivered successfully" and "gave up
// after MAX_ATTEMPTS". Both code paths wrote the SAME column. Measured in production
// (2026-08-27): 55,082 rows, all "processed" — two of them actually dead, invisible for two weeks
// because whoever investigates filters `processed_at IS NULL` and finds nothing. `dead_at` (T1)
// gives death its own column; this file pins the TS lane actually WRITING it (T2).
//
// Real file-backed LibSqlDriver, not `mock` DI — the poison sweep, the dead-letter branch and the
// claim predicate are all SQL. A mocked outbox would assert the shape of the test, not the
// dispatcher's behaviour. Same reasoning `tests/flows/shared-outbox-lanes.test.ts` documents.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import * as schema from '@codm/contracts/db'
import { outbox } from '@codm/contracts/db'
import { migrationsDir } from '@codm/contracts/db/migrations'
import { LibSqlDriver } from '../../db/libsql/drivers/LibSqlDriver'
import { LibSqlOutboxDispatcher, MAX_ATTEMPTS } from './LibSqlOutboxDispatcher'
import { EventEmitter2Mediator, MockExternalMediator } from '../Mediator'
import { MockLoggingService } from '../Logging/MockLoggingService'
import type { Handler } from '../../types/Handler'
import { removeTempDirWhenFree } from '../../utils/removeTempDirWhenFree'

const OWNER = 'owner-deadat'
const EVENT_NAME = 'thread.message.appended'

describe('LibSqlOutboxDispatcher — dead_at', () => {
	let dir: string
	let driver: LibSqlDriver
	let internal: EventEmitter2Mediator
	let dispatcher: LibSqlOutboxDispatcher

	/** A minimal Handler double — same shape `shared-outbox-lanes.test.ts` uses to script outcomes. */
	const makeHandler = (name: string, execute: () => Promise<void>): Handler =>
		({
			name,
			events: [name],
			bindContainer() {
				return this
			},
			execute,
		}) as unknown as Handler

	const seed = async (id: string, over: Partial<typeof outbox.$inferInsert> = {}) => {
		await driver.transaction(tx =>
			tx.insert(outbox).values({
				id,
				name: EVENT_NAME,
				entityId: id,
				ownerId: OWNER,
				source: 'api',
				payload: { name: EVENT_NAME, id, entityId: id, time: new Date().toISOString(), payload: {} },
				...over,
			}),
		)
	}

	const row = async (id: string) => (await driver.db.select().from(outbox).where(eq(outbox.id, id)))[0]

	beforeAll(async () => {
		dir = mkdtempSync(join(tmpdir(), 'libsql-outbox-deadat-test-'))
		driver = new LibSqlDriver({ schema, migrationsDir, dbPath: join(dir, 'test.db') })
		await driver.runMigrations()
	})

	afterAll(() => {
		removeTempDirWhenFree(dir)
	})

	beforeEach(async () => {
		await driver.reset()
		internal = new EventEmitter2Mediator()
		dispatcher = new LibSqlOutboxDispatcher(driver, internal, new MockExternalMediator(), new MockLoggingService())
	})

	it('AC-2 — exhausting MAX_ATTEMPTS in finalize dead-letters via dead_at, not processed_at', async () => {
		await internal.register(
			makeHandler(EVENT_NAME, async () => {
				throw new Error('handler always fails')
			}),
		)
		// The claim charges the Nth attempt, so seeding attempts = MAX_ATTEMPTS - 1 makes THIS claim
		// the one that reaches the ceiling and dead-letters inside the SAME finalize call.
		const id = 'ac2-exhausted'
		await seed(id, { attempts: MAX_ATTEMPTS - 1 })

		await dispatcher.flush()

		const after = await row(id)
		expect(after?.deadAt).toBeInstanceOf(Date)
		expect(after?.processedAt).toBeNull()
		expect(after?.lastError).toContain('handler always fails')
		expect(after?.claimedBy).toBeNull()
	})

	it('AC-3 — a row collected by the poison sweep dead-letters via dead_at, not processed_at', async () => {
		const id = 'ac3-poisoned'
		await seed(id, { attempts: MAX_ATTEMPTS, leaseUntil: new Date(Date.now() - 60_000) })

		await dispatcher.flush()

		const after = await row(id)
		expect(after?.deadAt).toBeInstanceOf(Date)
		expect(after?.processedAt).toBeNull()
		expect(after?.lastError).toContain('poison')
		expect(after?.claimedBy).toBeNull()
	})

	it('AC-5 — a dead row is never reclaimed: attempts and claimed_by are frozen once dead', async () => {
		const id = 'ac5-frozen'
		await seed(id, { attempts: MAX_ATTEMPTS, leaseUntil: new Date(Date.now() - 60_000) })

		await dispatcher.flush() // poison sweep kills it
		const afterFirst = await row(id)
		expect(afterFirst?.deadAt).toBeInstanceOf(Date)

		await dispatcher.flush() // must be a no-op for this row — the claim predicate excludes dead_at
		const afterSecond = await row(id)
		expect(afterSecond?.attempts).toBe(afterFirst?.attempts)
		expect(afterSecond?.claimedBy).toBeNull()
		expect(afterSecond?.deadAt?.getTime()).toBe(afterFirst?.deadAt?.getTime())
	})

	it('AC-6 — success keeps processed_at and leaves dead_at NULL, even carrying a stale last_error', async () => {
		await internal.register(makeHandler(EVENT_NAME, async () => {}))
		const id = 'ac6-success-with-stale-error'
		// A prior failed attempt already wrote `last_error`. Success must NOT be inferred from
		// `last_error IS NULL` — that is exactly the proxy this change replaces with a real column.
		await seed(id, { attempts: 2, lastError: 'a previous transient failure' })

		await dispatcher.flush()

		const after = await row(id)
		expect(after?.processedAt).toBeInstanceOf(Date)
		expect(after?.deadAt).toBeNull()
		// Out of scope for this Task: the success path does not clear `last_error`.
		expect(after?.lastError).toBe('a previous transient failure')
	})
})
