// LibSqlCommandQueue — the transactional scheduling driver, against a real SQLite file.
// The poller is never left running: each test registers handlers, stops the interval, and drives
// `tick()` deterministically. "The alarm fires" is simulated by rewinding `run_at` via SQL instead
// of sleeping — deterministic and instant.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { TestBed } from '@test/support'
import { LibSqlDatabaseDriver, MockLoggingService, LibSqlCommandQueue, type Handler, LibSqlTransaction } from '@codm/core-typescript'
import { scheduledCommands } from '@codm/contracts/db'

describe('LibSqlCommandQueue (integration)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let db: LibSqlTransaction
	let driver: LibSqlDatabaseDriver
	let queue: LibSqlCommandQueue

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'pgq-owner' })
		db = testBed.resolve(LibSqlDatabaseDriver).db
		driver = testBed.resolve(LibSqlDatabaseDriver)
	})

	beforeEach(async () => {
		await testBed.reset()
		queue = new LibSqlCommandQueue(driver, new MockLoggingService())
	})

	afterEach(async () => {
		await queue.close()
	})

	/** A fake handler recording every execution. Only the fields the queue reads are provided. */
	const makeHandler = (name: string, fn?: (input: unknown) => Promise<unknown>) => {
		const calls: unknown[] = []
		const handler = {
			name,
			concurrency: 1,
			execute: async (input: unknown) => {
				calls.push(input)
				return fn ? fn(input) : undefined
			},
		} as unknown as Handler
		return { handler, calls }
	}

	const register = async (handler: Handler) => {
		await queue.registerCommandHandler(handler)
		queue.stopPolling() // tests drive tick() deterministically — no background interval
	}

	const rowById = async (id: string) => (await db.select().from(scheduledCommands).where(eq(scheduledCommands.id, id)))[0]

	// Writes go through the driver's write seam — `db` is the READ connection.
	const rewindRunAt = async (id: string) => {
		await driver.transaction(tx =>
			tx
				.update(scheduledCommands)
				.set({ runAt: new Date(Date.now() - 1_000) })
				.where(eq(scheduledCommands.id, id)),
		)
	}

	it('executes an immediate command once and deletes the row (one-shot consumed)', async () => {
		const { handler, calls } = makeHandler('pgq_test_now')
		await register(handler)

		await queue.enqueueCommand('pgq_test_now', { hello: 'world' }, { jobId: 'job-now' })
		await queue.tick()

		expect(calls).toEqual([{ hello: 'world' }])
		expect(await rowById('job-now')).toBeUndefined() // consumed → gone
	})

	it('a delayed command does NOT run before run_at, and runs once it is due', async () => {
		const { handler, calls } = makeHandler('pgq_test_delayed')
		await register(handler)

		await queue.enqueueCommand('pgq_test_delayed', { n: 1 }, { jobId: 'job-delayed', delay: 60_000 })
		await queue.tick()
		expect(calls).toHaveLength(0) // the alarm hasn't fired
		expect(await rowById('job-delayed')).toBeDefined()

		await rewindRunAt('job-delayed') // "time passes"
		await queue.tick()
		expect(calls).toEqual([{ n: 1 }])
		expect(await rowById('job-delayed')).toBeUndefined()
	})

	it('deduplicates by jobId — enqueueing the same id twice executes once', async () => {
		const { handler, calls } = makeHandler('pgq_test_dedup')
		await register(handler)

		await queue.enqueueCommand('pgq_test_dedup', { attempt: 1 }, { jobId: 'job-dedup' })
		await queue.enqueueCommand('pgq_test_dedup', { attempt: 2 }, { jobId: 'job-dedup' }) // no-op
		await queue.tick()

		expect(calls).toEqual([{ attempt: 1 }]) // the first payload won; the second never enqueued
	})

	it('TRANSACTIONAL enqueue: a rolled-back tx drops the scheduled command (the whole point)', async () => {
		const { handler, calls } = makeHandler('pgq_test_tx')
		await register(handler)

		await db
			.transaction(async tx => {
				await queue.enqueueCommand('pgq_test_tx', {}, { jobId: 'job-tx' }, tx)
				throw new Error('domain write failed — roll everything back')
			})
			.catch(() => {})

		expect(await rowById('job-tx')).toBeUndefined() // the enqueue died with the tx
		await queue.tick()
		expect(calls).toHaveLength(0)
	})

	it('cancelCommand deletes a pending command — it never runs', async () => {
		const { handler, calls } = makeHandler('pgq_test_cancel')
		await register(handler)

		await queue.enqueueCommand('pgq_test_cancel', {}, { jobId: 'job-cancel', delay: 60_000 })
		await queue.cancelCommand('pgq_test_cancel', 'job-cancel')

		expect(await rowById('job-cancel')).toBeUndefined()
		await rewindRunAt('job-cancel') // no-op (row gone) — belt & suspenders
		await queue.tick()
		expect(calls).toHaveLength(0)
	})

	it('failure backs off exponentially, then dead-letters at max_attempts (row kept, never re-claimed)', async () => {
		const { handler, calls } = makeHandler('pgq_test_fail', async () => {
			throw new Error('boom')
		})
		await register(handler)

		await queue.enqueueCommand('pgq_test_fail', {}, { jobId: 'job-fail', attempts: 2 })

		await queue.tick() // attempt 1 → fails → backoff
		let row = await rowById('job-fail')
		expect(calls).toHaveLength(1)
		expect(row!.attempts).toBe(1)
		expect(row!.deadAt).toBeNull()
		expect(row!.runAt.getTime()).toBeGreaterThan(Date.now()) // backed off into the future

		await rewindRunAt('job-fail')
		await queue.tick() // attempt 2 → max reached → dead-letter
		row = await rowById('job-fail')
		expect(calls).toHaveLength(2)
		expect(row!.attempts).toBe(2)
		expect(row!.deadAt).toBeInstanceOf(Date)

		await rewindRunAt('job-fail')
		await queue.tick() // dead rows are never claimed again
		expect(calls).toHaveLength(2)
	})

	it('repeat.every re-arms after each run instead of deleting (the periodic sweeps)', async () => {
		const { handler, calls } = makeHandler('pgq_test_repeat')
		await register(handler)

		await queue.enqueueCommand('pgq_test_repeat', {}, { repeat: { every: 60_000 } })
		const id = 'repeat:pgq_test_repeat'
		expect(await rowById(id)).toBeDefined() // first run scheduled one interval out

		await rewindRunAt(id)
		await queue.tick()
		expect(calls).toHaveLength(1)

		const rearmed = await rowById(id)
		expect(rearmed).toBeDefined() // NOT deleted — re-armed
		expect(rearmed!.runAt.getTime()).toBeGreaterThan(Date.now())

		// Boot re-registration UPSERTS the schedule (no duplicate row).
		await queue.enqueueCommand('pgq_test_repeat', {}, { repeat: { every: 30_000 } })
		const rows = await db.select().from(scheduledCommands).where(eq(scheduledCommands.name, 'pgq_test_repeat'))
		expect(rows).toHaveLength(1)
		expect(rows[0]!.repeatEveryMs).toBe(30_000) // interval self-healed to the new config
	})

	it('boot re-registration with the SAME interval PRESERVES run_at — frequent deploys never starve the sweeps', async () => {
		const { handler, calls } = makeHandler('pgq_test_boot')
		await register(handler)
		const id = 'repeat:pgq_test_boot'

		await queue.enqueueCommand('pgq_test_boot', {}, { repeat: { every: 3_600_000 } })
		await rewindRunAt(id) // the sweep is DUE
		const dueAt = (await rowById(id))!.runAt.getTime()

		// Three back-to-back "boots" (rolling deploy / crash-loop) re-register the job. The review bug:
		// each upsert reset run_at = now + 1h → with restarts more frequent than the interval, the
		// sweep NEVER fired (no renewal, no dunning, no backstop) — silently.
		await queue.enqueueCommand('pgq_test_boot', {}, { repeat: { every: 3_600_000 } })
		await queue.enqueueCommand('pgq_test_boot', {}, { repeat: { every: 3_600_000 } })
		await queue.enqueueCommand('pgq_test_boot', {}, { repeat: { every: 3_600_000 } })

		expect((await rowById(id))!.runAt.getTime()).toBe(dueAt) // schedule untouched
		await queue.tick()
		expect(calls).toHaveLength(1) // and the due sweep RAN

		// Only an interval CHANGE re-anchors (the sandbox 60s ↔ prod 1h self-heal still holds).
		await queue.enqueueCommand('pgq_test_boot', {}, { repeat: { every: 60_000 } })
		const reanchored = await rowById(id)
		expect(reanchored!.repeatEveryMs).toBe(60_000)
		expect(reanchored!.runAt.getTime()).toBeGreaterThan(Date.now())
	})

	it('the CLAIM counts the attempt (attempts = executions STARTED) — a failure returns with attempts already counted', async () => {
		const { handler, calls } = makeHandler('pgq_test_claim_counts', async () => {
			throw new Error('boom')
		})
		await register(handler)
		await queue.enqueueCommand('pgq_test_claim_counts', {}, { jobId: 'job-claim-counts' })

		await queue.tick()
		expect(calls).toHaveLength(1)
		// The bump happened in the claim (not in finalize): 1 execution started = attempts 1.
		expect((await rowById('job-claim-counts'))!.attempts).toBe(1)
	})

	it('an EXPIRED lease is re-claimable, and the re-claim advances attempts again', async () => {
		const { handler, calls } = makeHandler('pgq_test_lease')
		await register(handler)
		await queue.enqueueCommand('pgq_test_lease', {}, { jobId: 'job-lease' })

		// Simulate a worker that claimed the row and died: leased, attempts already charged once.
		await driver.transaction(tx =>
			tx
				.update(scheduledCommands)
				.set({ attempts: 1, leaseUntil: new Date(Date.now() + 60_000) })
				.where(eq(scheduledCommands.id, 'job-lease')),
		)
		await queue.tick()
		expect(calls).toHaveLength(0) // still leased — nobody may touch it
		expect((await rowById('job-lease'))!.attempts).toBe(1)

		await driver.transaction(tx =>
			tx
				.update(scheduledCommands)
				.set({ leaseUntil: new Date(Date.now() - 1_000) })
				.where(eq(scheduledCommands.id, 'job-lease')),
		)
		await queue.tick()
		expect(calls).toHaveLength(1)
		// The row is consumed on success, so the advanced attempts value is read from the span the
		// handler saw: 1 (dead worker) + 1 (this re-claim) = 2.
		expect(await rowById('job-lease')).toBeUndefined()
	})

	it('two concurrent claim cycles never hand the same row to two executions', async () => {
		const slow = async () => {
			await new Promise(resolve => setTimeout(resolve, 20))
		}
		const { handler, calls } = makeHandler('pgq_test_race', slow)
		await register(handler)

		const other = new LibSqlCommandQueue(driver, new MockLoggingService())
		const { handler: otherHandler, calls: otherCalls } = makeHandler('pgq_test_race', slow)
		await other.registerCommandHandler(otherHandler)
		other.stopPolling()

		await queue.enqueueCommand('pgq_test_race', { n: 1 }, { jobId: 'job-race' })
		await Promise.all([queue.tick(), other.tick()])

		// The lease is written inside the claim's write transaction, so the loser sees it leased.
		expect(calls.length + otherCalls.length).toBe(1)
		await other.close()
	})

	it('hard crash (claim without finalize) is not an infinite loop: budget exhausted + expired lease → dead-letter, never re-claimed', async () => {
		const { handler, calls } = makeHandler('pgq_test_crash')
		await register(handler)
		await queue.enqueueCommand('pgq_test_crash', { payload: 'poison' }, { jobId: 'job-crash' })

		// Simulate N crashes: the claim bumped attempts per execution started, the process died before
		// finalize (lease expires, attempts stays). Final state: attempts = max, lease expired.
		await driver.transaction(tx =>
			tx
				.update(scheduledCommands)
				.set({ attempts: 3, leaseUntil: new Date(Date.now() - 1_000), runAt: new Date(Date.now() - 1_000) })
				.where(eq(scheduledCommands.id, 'job-crash')),
		)

		await queue.tick()

		// The dead-letter pass marked it (budget burned) and the claim never picks it up again.
		const row = await rowById('job-crash')
		expect(row!.deadAt).toBeInstanceOf(Date)
		expect(calls).toHaveLength(0) // never executed by THIS process — no further crash round
	})

	it('a repeatable that fails re-arms for the next interval (sweeps are self-healing, no dead-letter)', async () => {
		const { handler, calls } = makeHandler('pgq_test_repeat_fail', async () => {
			throw new Error('sweep failed')
		})
		await register(handler)

		await queue.enqueueCommand('pgq_test_repeat_fail', {}, { repeat: { every: 60_000 } })
		const id = 'repeat:pgq_test_repeat_fail'

		await rewindRunAt(id)
		await queue.tick()
		expect(calls).toHaveLength(1)

		const row = await rowById(id)
		expect(row!.deadAt).toBeNull() // never dead-letters
		expect(row!.runAt.getTime()).toBeGreaterThan(Date.now()) // waits for the next interval
	})

	it('abort() mid-batch: the in-flight item finishes, the rest release their leases and stay claimable', async () => {
		// The handler aborts the queue DURING the first execution — cooperative abort means this item
		// still completes; the batch loop then stops BEFORE the remaining claimed items run.
		const { handler, calls } = makeHandler('pgq_test_abort', async () => {
			queue.abort()
		})
		await register(handler)

		await queue.enqueueCommand('pgq_test_abort', { n: 1 }, { jobId: 'job-abort-1' })
		await queue.enqueueCommand('pgq_test_abort', { n: 2 }, { jobId: 'job-abort-2' })
		await queue.enqueueCommand('pgq_test_abort', { n: 3 }, { jobId: 'job-abort-3' })
		await queue.tick()

		// Only the in-flight item ran (and, having succeeded, was consumed).
		expect(calls).toEqual([{ n: 1 }])
		expect(await rowById('job-abort-1')).toBeUndefined()

		// The unrun remainder is still queued AND had its lease released — immediately claimable by
		// another process instead of waiting out the 60s crash-lease.
		const two = await rowById('job-abort-2')
		const three = await rowById('job-abort-3')
		expect(two).toBeDefined()
		expect(three).toBeDefined()
		expect(two!.leaseUntil).toBeNull()
		expect(three!.leaseUntil).toBeNull()

		// Aborted is one-way: no further tick runs anything, and registration can't revive the poller.
		await queue.tick()
		expect(calls).toEqual([{ n: 1 }])
	})

	it('close() is idempotent and a second driver picks up the items released by the abort', async () => {
		const first = queue
		const { handler, calls } = makeHandler('pgq_test_handoff', async () => {
			first.abort()
		})
		await register(handler)
		await queue.enqueueCommand('pgq_test_handoff', { n: 1 }, { jobId: 'job-h1' })
		await queue.enqueueCommand('pgq_test_handoff', { n: 2 }, { jobId: 'job-h2' })
		await queue.tick()
		expect(calls).toEqual([{ n: 1 }])
		await first.close()
		await first.close() // idempotent

		// A fresh instance (next deploy / another process) picks the released item up immediately.
		const second = new LibSqlCommandQueue(driver, new MockLoggingService())
		const { handler: h2, calls: calls2 } = makeHandler('pgq_test_handoff')
		await second.registerCommandHandler(h2)
		second.stopPolling()
		await second.tick()
		expect(calls2).toEqual([{ n: 2 }])
		await second.close()
	})
})
