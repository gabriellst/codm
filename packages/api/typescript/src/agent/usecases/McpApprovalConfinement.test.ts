import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenIssue } from '@test/support'
import { StopResolution } from '@codm/contracts-typescript/wire/enums'
import { ThreadStopResolvedEvent } from '@codm/contracts-typescript/wire/events'
import { SettleMcpToolApproval } from '../handlers/SettleMcpToolApproval'
import { canonicalCallHash } from '../entities/McpToolApproval'
import { McpToolApprovalRepository } from '../repositories/McpToolApprovalRepository'
import { RequestMcpToolApproval } from './RequestMcpToolApproval'

/**
 * T9 — "uma aprovação não vaza para outro run".
 *
 * T7/T8 already prove the happy path — request, approve, the SAME call passes on the next turn — with
 * a SINGLE issue. That leaves the dangerous case unprobed: an approval given once quietly becoming a
 * permanent, cross-issue "always allow". The confinement the design promises is structural — a WHERE
 * clause on `(issueId, callHash)` (`McpToolApprovalRepository.findByCall`) — not a rule a future
 * handler has to remember to apply. This suite is the isolated security probe for that clause.
 *
 * Same reason as `RequestMcpToolApproval.test.ts` / `SettleMcpToolApproval.test.ts`: the `TestBed` in
 * `integration` mode registers `MockOutboxDispatcher`, so nothing propagates cross-context on its own.
 * The owner's APPROVE is driven straight into `SettleMcpToolApproval` with the event the real
 * `thread` → `agent` bridge would have published.
 */
describe('McpApprovalConfinement', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	const ownerId = '019e4d24-6524-7041-9e1c-8108180cdd03'

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

	it('approving the call in one issue does not authorize the same call in another issue', async () => {
		const issueA = await givenIssue(testBed, { ownerId })
		const issueB = await givenIssue(testBed, { ownerId })
		const call = { serverKey: 'shell', toolName: 'run', args: { cmd: 'ls' } }

		const { stopId } = await testBed.resolve(RequestMcpToolApproval).execute({
			ownerId,
			issueId: issueA.id.value,
			threadId: issueA.threadId,
			...call,
		})
		await testBed.resolve(SettleMcpToolApproval).handle(
			new ThreadStopResolvedEvent({
				ownerId,
				payload: { stopId, issueId: issueA.id.value, threadId: issueA.threadId, resolution: StopResolution.APPROVE },
			}) as never,
		)

		const callHash = canonicalCallHash(call)

		const grantedInA = await testBed.resolve(McpToolApprovalRepository).findByCall(issueA.id.value, callHash)
		expect(grantedInA?.grantsExecution).toBe(true)

		const foundInB = await testBed.resolve(McpToolApprovalRepository).findByCall(issueB.id.value, callHash)
		expect(foundInB).toBeUndefined()
	})

	it('a different argument value in the same issue does not inherit the approval', async () => {
		const issue = await givenIssue(testBed, { ownerId })
		const approvedCall = { serverKey: 'shell', toolName: 'run', args: { cmd: 'ls' } }
		const differentCall = { serverKey: 'shell', toolName: 'run', args: { cmd: 'rm -rf build' } }

		const { stopId } = await testBed.resolve(RequestMcpToolApproval).execute({
			ownerId,
			issueId: issue.id.value,
			threadId: issue.threadId,
			...approvedCall,
		})
		await testBed.resolve(SettleMcpToolApproval).handle(
			new ThreadStopResolvedEvent({
				ownerId,
				payload: { stopId, issueId: issue.id.value, threadId: issue.threadId, resolution: StopResolution.APPROVE },
			}) as never,
		)

		const approvedHash = canonicalCallHash(approvedCall)
		const differentHash = canonicalCallHash(differentCall)
		expect(differentHash).not.toBe(approvedHash)

		const grantedForApproved = await testBed.resolve(McpToolApprovalRepository).findByCall(issue.id.value, approvedHash)
		expect(grantedForApproved?.grantsExecution).toBe(true)

		const foundForDifferent = await testBed.resolve(McpToolApprovalRepository).findByCall(issue.id.value, differentHash)
		expect(foundForDifferent).toBeUndefined()
	})
})
