import { afterAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { TestBed, givenIssue, givenThread, givenWorkspace } from '@test/support'
import { OutboxDispatcher } from '@codm/core-typescript'
import { MailboxItemKind, MailboxTargetKind, ProviderKind, StopKind, StopResolution } from '@codm/contracts-typescript/wire/enums'
import { ThreadStopRaisedEvent } from '@codm/contracts-typescript/wire/events'
import { OPERATOR_ID } from '@auth/operator'
import { SteerIssueTurnController } from '@agent/controllers/SteerIssueTurn'
import { RecordStopFromExecution } from '@thread/handlers/RecordStopFromExecution'
import { ResumeIssueOnStopResolved } from '@thread/handlers/ResumeIssueOnStopResolved'
import { ThreadStopResolvedEvent } from '@thread/events/ThreadStopResolvedEvent'
import { ResolveStop } from '@thread/usecases/ResolveStop'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { IssueRepository } from '@issue/repositories/IssueRepository'
import { OpenIssuesReader } from '@thread/services'
import { MailboxRepository } from '@agent/repositories'

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

/**
 * THE FEATURE (spec 2026-07-31) — resolving a stop puts the issue back to work, on the SAME CLI
 * session, carrying what the operator answered.
 *
 * The diagnostic above settled Decision 3: the issue never left the steer seam, so nothing had to be
 * repaired there. What was actually missing is here — a subscriber on `thread.stop_resolved`, and a
 * dispatcher that hands the resumed turn the cursor its own session was written under.
 */
describe('Flow (integration): a resolved stop puts the issue back to work', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeEach(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
		await testBed.reset()
		// The internal handler under test is registered the way every flow spec registers one — TestBed
		// wires DI, `BoundedContext.create` (the daemon's boot) wires the mediator, and a test is neither.
		await testBed.spy.register(testBed.resolve(ResumeIssueOnStopResolved))
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	async function givenStoppedIssue(kind: StopKind = StopKind.HUMAN_REQUESTED, detail = 'Full or partial refund over 90 days?') {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const thread = await givenThread(testBed, {
			ownerId: OPERATOR_ID,
			workspaceId: workspace.id.value,
			providers: [ProviderKind.CLAUDE_CODE],
		})
		const issue = await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value, key: 'refund-window' })
		const stopId = uuidv7()
		await testBed.resolve(RecordStopFromExecution).handle(
			new ThreadStopRaisedEvent({
				ownerId: OPERATOR_ID,
				payload: { stopId, issueId: issue.id.value, threadId: thread.id.value, kind, detail },
			}) as never,
		)
		return { workspace, thread, issue, stopId }
	}

	/** Resolve through the real use case and let the real outbox carry the fact to the handler. */
	async function resolveStop(stopId: string, resolution: StopResolution) {
		await testBed.resolve(ResolveStop).execute({ ownerId: OPERATOR_ID, stopId, resolution })
		await testBed.resolve(OutboxDispatcher).flush()
	}

	const claimAll = async () => {
		const mailbox = testBed.resolve(MailboxRepository)
		const claimed = []
		for (;;) {
			const item = await mailbox.claimNext('resume-test', 60_000)
			if (!item) return claimed
			claimed.push(item)
			await mailbox.complete(item.id)
		}
	}

	it('AC-1 — a resolved stop queues a turn for the issue', async () => {
		const { issue, stopId } = await givenStoppedIssue()

		await resolveStop(stopId, StopResolution.REVIEW_AND_SEND)

		const queued = (await claimAll()).filter(item => item.targetKind === MailboxTargetKind.ISSUE)
		expect(queued).toHaveLength(1)
		expect(queued[0]?.kind).toBe(MailboxItemKind.STEER)
		expect(queued[0]?.targetId).toBe(issue.id.value)
	})

	it('AC-1 — TAKE_OVER queues NOTHING: the work is the human’s now', async () => {
		const { stopId } = await givenStoppedIssue()

		await resolveStop(stopId, StopResolution.TAKE_OVER)

		expect((await claimAll()).filter(item => item.targetKind === MailboxTargetKind.ISSUE)).toHaveLength(0)
	})

	it('AC-5 — the resume prompt says what was asked and how it was answered', async () => {
		const { stopId } = await givenStoppedIssue(StopKind.APPROVAL_NEEDED, 'May I delete the legacy coupons table?')

		await resolveStop(stopId, StopResolution.APPROVE)

		const queued = (await claimAll()).filter(item => item.targetKind === MailboxTargetKind.ISSUE)
		expect(queued).toHaveLength(1)
		const text = (queued[0] as { payload: { text: string } }).payload.text
		expect(text).toContain('May I delete the legacy coupons table?')
		expect(text).toContain(StopResolution.APPROVE)
	})

	it('AC-6 — the same resolution delivered twice produces ONE item', async () => {
		const { thread, issue, stopId } = await givenStoppedIssue()

		// The outbox is at-least-once, so the SAME fact reaches the handler again after a redelivery —
		// which is what a second `handle()` of one event IS at this boundary.
		const fact = new ThreadStopResolvedEvent({
			entityId: thread.id.value,
			ownerId: OPERATOR_ID,
			payload: { stopId, issueId: issue.id.value, threadId: thread.id.value, resolution: StopResolution.REVIEW_AND_SEND },
		})
		const handler = testBed.resolve(ResumeIssueOnStopResolved)
		await handler.handle(fact as never)
		await handler.handle(fact as never)

		expect((await claimAll()).filter(item => item.targetKind === MailboxTargetKind.ISSUE)).toHaveLength(1)
	})

	it('AC-6 — console and orchestrator firing together produce ONE turn', async () => {
		const { thread, issue, stopId } = await givenStoppedIssue()

		// The orchestrator answers in the conversation and steers the stopped issue with the operator's
		// words; the operator ALSO presses resolve in the console. Two paths, one issue, one turn.
		await testBed.resolve(SteerIssueTurnController).handle({
			ctx: { ownerId: OPERATOR_ID, agentIdentity: { threadId: thread.id.value, entryId: uuidv7() } },
			params: { threadId: thread.id.value, issueId: issue.id.value },
			body: { text: 'refund total' },
		} as Parameters<SteerIssueTurnController['handle']>[0])
		await resolveStop(stopId, StopResolution.REVIEW_AND_SEND)

		expect((await claimAll()).filter(item => item.targetKind === MailboxTargetKind.ISSUE)).toHaveLength(1)
	})
})
