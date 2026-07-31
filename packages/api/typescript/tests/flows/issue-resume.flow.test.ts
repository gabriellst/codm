import { afterAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { TestBed, givenIssue, givenThread, givenWorkspace } from '@test/support'
import { ProviderKind, StopKind } from '@codm/contracts-typescript/wire/enums'
import { ThreadStopRaisedEvent } from '@codm/contracts-typescript/wire/events'
import { OPERATOR_ID } from '@auth/operator'
import { SteerIssueTurnController } from '@agent/controllers/SteerIssueTurn'
import { RecordStopFromExecution } from '@thread/handlers/RecordStopFromExecution'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { IssueRepository } from '@issue/repositories/IssueRepository'
import { OpenIssuesReader } from '@thread/services'

/**
 * DIAGNOSTIC (spec 2026-07-31, Problem 3 / Decision 3) — what happens TODAY to an issue that stopped?
 *
 * The spec suspects the stop removes the issue from the thread's open-issue seam, which would make
 * `SteerIssueTurnController` refuse (`AGENT_RUN_SCOPE_MISMATCH`) exactly the issue that most needs
 * context. This suite pins the CURRENT behaviour before anything changes, so the answer is a test
 * output rather than a reading of the code.
 */
describe('DIAGNOSTIC: a stopped issue and the steer seam, as of HEAD', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeEach(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	async function givenStoppedIssue() {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const thread = await givenThread(testBed, {
			ownerId: OPERATOR_ID,
			workspaceId: workspace.id.value,
			providers: [ProviderKind.CLAUDE_CODE],
		})
		const issue = await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value, key: 'stopped-issue' })
		const stopId = uuidv7()

		// The REAL raise path — the terminal engine's fact, through the handler that materializes it.
		await testBed.resolve(RecordStopFromExecution).handle(
			new ThreadStopRaisedEvent({
				ownerId: OPERATOR_ID,
				payload: {
					stopId,
					issueId: issue.id.value,
					threadId: thread.id.value,
					kind: StopKind.HUMAN_REQUESTED,
					detail: 'Refund full or partial for orders older than 90 days?',
				},
			}) as never,
		)

		return { thread, issue, stopId }
	}

	it('(a) the stop does NOT move the issue out of its lifecycle state', async () => {
		const { issue } = await givenStoppedIssue()

		const reloaded = await testBed.resolve(IssueRepository).findById(issue.id.value)
		console.log('[diagnostic] issue status after stop =', reloaded?.status, '| archived =', reloaded?.archived)
		expect(reloaded?.status).toBe(issue.status)
		expect(reloaded?.archived).toBe(false)
	})

	it('(b) the stopped issue is STILL inside the thread open-issue seam', async () => {
		const { thread, issue, stopId } = await givenStoppedIssue()

		const openStops = await testBed.resolve(ThreadRepository).openStopsByIssue(issue.id.value)
		const open = await testBed.resolve(OpenIssuesReader).openIssues(thread.id.value)
		console.log(
			'[diagnostic] open stops =',
			openStops.length,
			'| openIssues =',
			open.map(i => i.key),
		)
		expect(openStops.map(s => s.stopId)).toContain(stopId)
		expect(open.map(i => i.issueId)).toContain(issue.id.value)
	})

	it('(c) a steer at the stopped issue is ACCEPTED today — not AGENT_RUN_SCOPE_MISMATCH', async () => {
		const { thread, issue } = await givenStoppedIssue()

		const response = await testBed.resolve(SteerIssueTurnController).handle({
			ctx: { ownerId: OPERATOR_ID, agentIdentity: { threadId: thread.id.value, entryId: uuidv7() } },
			params: { threadId: thread.id.value, issueId: issue.id.value },
			body: { text: 'full refund' },
		} as Parameters<SteerIssueTurnController['handle']>[0])

		console.log('[diagnostic] steer at a stopped issue →', JSON.stringify(response.data))
		expect(response.data.queued).toBe(true)
	})
})
