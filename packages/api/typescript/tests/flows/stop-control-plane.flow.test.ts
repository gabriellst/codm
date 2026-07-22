import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { TestBed, givenIssue } from '@test/support'
import { DomainEventRepository } from '@template/core-typescript'
import { StopKind, StopResolution } from '@template/contracts-typescript/wire/enums'
import { IssueStopRaisedEvent } from '@template/contracts-typescript/wire/events'
import { OPERATOR_ID } from '@auth/operator'
import { MaterializeIssueFromExecution } from '@issue/handlers/MaterializeIssueFromExecution'
import { ResolveStop } from '@issue/usecases/ResolveStop'
import { StopRepository } from '@issue/repositories/StopRepository'
import { StopPolicyConfigRepository } from '@issue/repositories/StopPolicyConfigRepository'
import { IssueStopResolvedEvent } from '@issue/events'

/**
 * FLOW — the Needs-You control-plane saga: the terminal engine raises a stop
 * (`integration.issue.stop_raised`) → BC5 materializes it (`RaiseStop`, gated on the enabled
 * criterion) → the operator resolves it (`ResolveStop` → `integration.issue.stop_resolved`).
 * Captures the cross-context hand-off (StopRaised → stop recorded → stop_resolved).
 */
describe('Flow: stop raised → recorded → resolved', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

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

	it('materializes a stop from the execution fact, then resolves it', async () => {
		const issue = await givenIssue(testBed, { ownerId: OPERATOR_ID })
		const stopId = uuidv7()

		// 1. The terminal engine's execution fact — BC5 reacts by recording the stop (criterion enabled by default).
		await testBed.resolve(MaterializeIssueFromExecution).handle(
			new IssueStopRaisedEvent({
				ownerId: OPERATOR_ID,
				payload: { stopId, issueId: issue.id.value, threadId: issue.threadId, kind: StopKind.HUMAN_REQUESTED },
			}) as never,
		)

		const stops = testBed.resolve(StopRepository)
		expect(await stops.openByIssue(issue.id.value)).toHaveLength(1)

		// 2. The operator resolves it — REVIEW_AND_SEND is applicable to HUMAN_REQUESTED.
		await testBed.resolve(ResolveStop).execute({ ownerId: OPERATOR_ID, stopId, resolution: StopResolution.REVIEW_AND_SEND })

		expect(await stops.openByIssue(issue.id.value)).toHaveLength(0)
		const resolved = await stops.findById(stopId)
		expect(resolved?.resolution).toBe(StopResolution.REVIEW_AND_SEND)

		// The cross-context resolution fact is emitted for BC4 (thread resume / status).
		expect(await testBed.resolve(DomainEventRepository).findByType(IssueStopResolvedEvent)).toHaveLength(1)
	})

	it('a disabled criterion swallows the stop (no row recorded)', async () => {
		const issue = await givenIssue(testBed, { ownerId: OPERATOR_ID })
		// Disable the HUMAN_REQUESTED criterion for this owner.
		await testBed.resolve(StopPolicyConfigRepository).upsert(OPERATOR_ID, {
			serverErrors: true,
			blockedByClassification: true,
			humanRequested: false,
			approvalNeeded: true,
		})

		// The materializer swallows STOP_CRITERION_DISABLED — the stop is simply not recorded.
		await testBed.resolve(MaterializeIssueFromExecution).handle(
			new IssueStopRaisedEvent({
				ownerId: OPERATOR_ID,
				payload: { stopId: uuidv7(), issueId: issue.id.value, threadId: issue.threadId, kind: StopKind.HUMAN_REQUESTED },
			}) as never,
		)
		expect(await testBed.resolve(StopRepository).openByIssue(issue.id.value)).toHaveLength(0)
	})
})
