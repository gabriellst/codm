import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { IssueStatus, StopKind, ThreadStatus } from '@codedm/contracts-typescript/wire/enums'
import { TestBed, givenThread, givenIssue, givenStop } from '@test/support'
import { OPERATOR_ID } from '@auth/operator'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { ThreadStatusDeriver } from './ThreadStatusDeriver'

/**
 * AC-12 — the precedence AND the three reads in one place.
 *
 * The bug this closes is not a wrong rule, it is two implementations of the same question: the SSE frame
 * said RUNNING while the REST read said IDLE, because each call site wrote its own "is there work" query.
 * So the cases below exercise the PRECEDENCE against real rows, which is exactly what no test could do
 * while the rule was a pure function nobody fed from a database.
 */
describe('DrizzleThreadStatusDeriver — one answer to "what is this thread doing"', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let deriver: ThreadStatusDeriver

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
		deriver = testBed.resolve(ThreadStatusDeriver)
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('nothing happening → IDLE', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

		expect(await deriver.forThread(thread.id.value)).toBe(ThreadStatus.IDLE)
	})

	it('a WORKING issue → RUNNING (the case the stored column never reported)', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value, status: IssueStatus.WORKING })

		expect(await deriver.forThread(thread.id.value)).toBe(ThreadStatus.RUNNING)
	})

	it('US-7 — an open stop beats work in flight → NEEDS_ATTENTION', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value, status: IssueStatus.WORKING })
		await givenStop(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value, kind: StopKind.APPROVAL_NEEDED })

		expect(await deriver.forThread(thread.id.value)).toBe(ThreadStatus.NEEDS_ATTENTION)
	})

	it('a THREAD-LEVEL stop (no issue) counts too — that is what decision 4 exists for', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		await givenStop(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value })

		expect(await deriver.forThread(thread.id.value)).toBe(ThreadStatus.NEEDS_ATTENTION)
	})

	it('the operator pause beats everything → PAUSED', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value, status: IssueStatus.WORKING })
		await givenStop(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value })
		thread.pause()
		await testBed.resolve(ThreadRepository).save(thread)

		expect(await deriver.forThread(thread.id.value)).toBe(ThreadStatus.PAUSED)
	})

	it('forOwner batches — three threads, three statuses, and no N+1 on the dashboard', async () => {
		const idle = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const running = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const blocked = await givenThread(testBed, { ownerId: OPERATOR_ID })
		await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: running.id.value, status: IssueStatus.WORKING })
		await givenStop(testBed, { ownerId: OPERATOR_ID, threadId: blocked.id.value })

		const statuses = await deriver.forOwner(OPERATOR_ID)

		expect(statuses.get(idle.id.value)).toBe(ThreadStatus.IDLE)
		expect(statuses.get(running.id.value)).toBe(ThreadStatus.RUNNING)
		expect(statuses.get(blocked.id.value)).toBe(ThreadStatus.NEEDS_ATTENTION)
	})

	it('derive is the SAME rule the reads apply — the enricher path cannot drift from the REST path', async () => {
		expect(deriver.derive({ paused: true, hasOpenStop: true, hasWorkingIssue: true })).toBe(ThreadStatus.PAUSED)
		expect(deriver.derive({ paused: false, hasOpenStop: true, hasWorkingIssue: true })).toBe(ThreadStatus.NEEDS_ATTENTION)
		expect(deriver.derive({ paused: false, hasOpenStop: false, hasWorkingIssue: true })).toBe(ThreadStatus.RUNNING)
		expect(deriver.derive({ paused: false, hasOpenStop: false, hasWorkingIssue: false })).toBe(ThreadStatus.IDLE)
	})
})
