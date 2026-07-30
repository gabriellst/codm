import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenIssue } from '@test/support'
import { OPERATOR_ID } from '@auth/operator'
import { compareIdentity } from '@codm/core-typescript'
import { AgentName } from '@agent/enums'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import type { AgentRunIdentity } from '@agent/types/AgentRunIdentity'
import { GetIssueStatusController } from './GetIssueStatus'

/**
 * AC-T2.3 — an `orchestration` tool CANNOT reach another thread's issue (§7.2.1).
 *
 * This is the security property the pivot creates the need for, and it is worth stating plainly why a
 * test has to exist at all. An `orchestration` identity deliberately carries NO `issueId`: the
 * orchestrator is keyed by thread and has no issue to be confined to. And `compareIdentity` reads the
 * keys the IDENTITY carries — an identity without `issueId` compares no `issueId`, so the absence is a
 * property of the DATA rather than a skip branch in a walker. Either way the generic comparison that
 * protects every `issue-handling` tool provides exactly nothing here, and every `orchestration` tool
 * that accepts an `issueId` has to confine itself.
 *
 * The first test proves the hole is real (the generic comparison waves the cross-thread call through).
 * The second proves the handler closes it. Without the first, the second looks like belt-and-braces;
 * together they show the check is load-bearing.
 */
describe('AC-T2.3 — GetIssueStatus refuses an issue belonging to another thread', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	const THREAD_A = '019e4d24-6524-7041-9e1c-8108180cdd0a'
	const THREAD_B = '019e4d24-6524-7041-9e1c-8108180cdd0b'

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const orchestrationIdentity = (): AgentRunIdentity => ({
		ownerId: OPERATOR_ID,
		threadId: THREAD_A,
		// No `issueId` — that is the whole point of a thread-confined token.
		agentName: AgentName.ORCHESTRATOR,
		scope: McpScope.orchestration,
		expiresAt: new Date(Date.now() + 60_000),
	})

	it('the GENERIC comparison does not catch it — an axis the identity lacks is an axis it cannot gate', () => {
		const issueOfAnotherThread = '019e4d24-6524-7041-9e1c-8108180cddff'

		// The call names its OWN thread (so the threadId axis agrees) and somebody else's issue. The
		// identity carries no `issueId`, so there is nothing to compare it against and NOTHING is
		// reported.
		const mismatches = compareIdentity(orchestrationIdentity(), { threadId: THREAD_A, issueId: issueOfAnotherThread })

		expect(mismatches).toEqual([])
	})

	it('the HANDLER catches it — same issue, wrong thread, refused', async () => {
		const controller = testBed.resolve(GetIssueStatusController)
		const foreign = await givenIssue(testBed, { threadId: THREAD_B, key: 'foreign-issue' })

		await expect(
			controller.handle({
				ctx: { ownerId: OPERATOR_ID },
				params: { threadId: THREAD_A, issueId: foreign.id.value },
			} as Parameters<GetIssueStatusController['handle']>[0]),
		).rejects.toThrow(/no such issue on this thread/)
	})

	it('the same read SUCCEEDS from the thread that owns the issue — the check is not "refuse everything"', async () => {
		const controller = testBed.resolve(GetIssueStatusController)
		const own = await givenIssue(testBed, { threadId: THREAD_A, key: 'own-issue' })

		const response = await controller.handle({
			ctx: { ownerId: OPERATOR_ID },
			params: { threadId: THREAD_A, issueId: own.id.value },
		} as Parameters<GetIssueStatusController['handle']>[0])

		expect(response.data.key).toBe('own-issue')
	})
})
