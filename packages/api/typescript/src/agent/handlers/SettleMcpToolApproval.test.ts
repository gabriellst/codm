import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenIssue, givenThread } from '@test/support'
import { StopResolution, McpApprovalDecision } from '@codm/contracts-typescript/wire/enums'
import { ThreadStopResolvedEvent } from '@codm/contracts-typescript/wire/events'
import { McpToolApprovalRepository } from '../repositories/McpToolApprovalRepository'
import { RequestMcpToolApproval } from '../usecases/RequestMcpToolApproval'
import { SettleMcpToolApproval } from './SettleMcpToolApproval'

/**
 * `SettleMcpToolApproval` is the `agent`-side subscriber of `integration.thread.stop_resolved` — the
 * ONLY way the owner's answer crosses from `thread` into `agent` (which must not import `thread`). In
 * production the outbox delivers this on its own; under the `TestBed` in `integration` mode no
 * dispatcher is standing (the same reason documented in `RequestMcpToolApproval.test.ts` and
 * `ReconcileStalledIssues.test.ts`), so these tests drive the handler directly with the event the real
 * bridge would have published.
 */
describe('SettleMcpToolApproval', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	const ownerId = '019e4d24-6524-7041-9e1c-8108180cdd02'

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	async function givenPendingApproval() {
		const thread = await givenThread(testBed, { ownerId })
		const issue = await givenIssue(testBed, { ownerId, threadId: thread.id.value })
		const { stopId } = await testBed.resolve(RequestMcpToolApproval).execute({
			ownerId,
			issueId: issue.id.value,
			threadId: issue.threadId,
			serverKey: 'shell',
			toolName: 'run',
			args: { cmd: 'ls' },
		})
		return { thread, issue, stopId }
	}

	it('APPROVE flips the pending row to APPROVED', async () => {
		const { issue, stopId } = await givenPendingApproval()

		await testBed.resolve(SettleMcpToolApproval).handle(
			new ThreadStopResolvedEvent({
				ownerId,
				payload: { stopId, issueId: issue.id.value, threadId: issue.threadId, resolution: StopResolution.APPROVE },
			}) as never,
		)

		const settled = await testBed.resolve(McpToolApprovalRepository).findByStopId(stopId)
		expect(settled?.decision).toBe(McpApprovalDecision.APPROVED)
		expect(settled?.isPending).toBe(false)
		expect(settled?.grantsExecution).toBe(true)
		expect(settled?.settledAt).toBeDefined()
	})

	it('DENY flips the pending row to DENIED and never grants execution', async () => {
		const { issue, stopId } = await givenPendingApproval()

		await testBed.resolve(SettleMcpToolApproval).handle(
			new ThreadStopResolvedEvent({
				ownerId,
				payload: { stopId, issueId: issue.id.value, threadId: issue.threadId, resolution: StopResolution.DENY },
			}) as never,
		)

		const settled = await testBed.resolve(McpToolApprovalRepository).findByStopId(stopId)
		expect(settled?.decision).toBe(McpApprovalDecision.DENIED)
		expect(settled?.grantsExecution).toBe(false)
	})

	it('a resolution that is neither APPROVE nor DENY (TAKE_OVER) leaves the approval PENDING', async () => {
		const { issue, stopId } = await givenPendingApproval()

		await testBed.resolve(SettleMcpToolApproval).handle(
			new ThreadStopResolvedEvent({
				ownerId,
				payload: { stopId, issueId: issue.id.value, threadId: issue.threadId, resolution: StopResolution.TAKE_OVER },
			}) as never,
		)

		const untouched = await testBed.resolve(McpToolApprovalRepository).findByStopId(stopId)
		expect(untouched?.isPending).toBe(true)
		expect(untouched?.decision).toBeUndefined()
	})

	it('an unknown stopId (a resolved stop unrelated to MCP — the ordinary case) is a no-op, not an error', async () => {
		await expect(
			testBed.resolve(SettleMcpToolApproval).handle(
				new ThreadStopResolvedEvent({
					ownerId,
					payload: {
						stopId: '019e4d24-6524-7041-9e1c-8108180cddff',
						threadId: '019e4d24-6524-7041-9e1c-8108180cdd03',
						resolution: StopResolution.APPROVE,
					},
				}) as never,
			),
		).resolves.toBeUndefined()
	})

	it('redelivering the same resolution (at-least-once outbox) is idempotent, not a thrown MCP_APPROVAL_ALREADY_SETTLED', async () => {
		const { issue, stopId } = await givenPendingApproval()
		const event = new ThreadStopResolvedEvent({
			ownerId,
			payload: { stopId, issueId: issue.id.value, threadId: issue.threadId, resolution: StopResolution.APPROVE },
		})

		await testBed.resolve(SettleMcpToolApproval).handle(event as never)
		await expect(testBed.resolve(SettleMcpToolApproval).handle(event as never)).resolves.toBeUndefined()

		const settled = await testBed.resolve(McpToolApprovalRepository).findByStopId(stopId)
		expect(settled?.decision).toBe(McpApprovalDecision.APPROVED)
	})

	it('a decision already DENIED does not flip to APPROVED on a later, different redelivered resolution', async () => {
		const { issue, stopId } = await givenPendingApproval()

		await testBed.resolve(SettleMcpToolApproval).handle(
			new ThreadStopResolvedEvent({
				ownerId,
				payload: { stopId, issueId: issue.id.value, threadId: issue.threadId, resolution: StopResolution.DENY },
			}) as never,
		)
		await testBed.resolve(SettleMcpToolApproval).handle(
			new ThreadStopResolvedEvent({
				ownerId,
				payload: { stopId, issueId: issue.id.value, threadId: issue.threadId, resolution: StopResolution.APPROVE },
			}) as never,
		)

		const settled = await testBed.resolve(McpToolApprovalRepository).findByStopId(stopId)
		expect(settled?.decision).toBe(McpApprovalDecision.DENIED)
	})
})
