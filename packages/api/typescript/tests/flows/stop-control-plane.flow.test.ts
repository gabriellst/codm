import { afterAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { TestBed, givenIssue } from '@test/support'
import { MockOutboxDispatcher } from '@codedm/core-typescript'
import { StopKind, StopResolution } from '@codedm/contracts-typescript/wire/enums'
import { IssueStopRaisedEvent } from '@codedm/contracts-typescript/wire/events'
import { OPERATOR_ID } from '@auth/operator'
import { MaterializeIssueFromExecution } from '@issue/handlers/MaterializeIssueFromExecution'
import { PublishIssueIntegrationEvents } from '@issue/handlers/PublishIssueIntegrationEvents'
import { ResolveStop } from '@issue/usecases/ResolveStop'
import { StopRepository } from '@issue/repositories/StopRepository'
import { StopPolicyConfigRepository } from '@issue/repositories/StopPolicyConfigRepository'

/**
 * FLOW (mock DI) — the Needs-You control-plane saga, asserted by the integration events CAPTURED on
 * the external mediator (mock mode's isolation): the terminal engine's `integration.issue.stop_raised`
 * → BC5 materializes it (`RaiseStop`, gated on the enabled criterion) → the operator resolves it
 * (`ResolveStop`) whose `issue.stop_resolved` fact BRIDGES to `integration.issue.stop_resolved` (BC4
 * thread resume / status). Stop-recording/gating internals stay in the RaiseStop use-case spec.
 */
describe('Flow (mock): stop raised → recorded → resolved → integration.issue.stop_resolved', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeEach(async () => {
		// Fresh container per test — mock mode has no DB reset, so isolation comes from fresh singletons.
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('mock', { testContainer, ownerId: OPERATOR_ID })
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	/** Register the BC5 bridge so a flushed `issue.stop_resolved` fact publishes its integration event. */
	async function wireBridge(): Promise<MockOutboxDispatcher> {
		await testBed.spy.register(testBed.resolve(PublishIssueIntegrationEvents))
		return testBed.resolve(MockOutboxDispatcher)
	}

	it('materializes a stop from the execution fact, then resolves it → integration.issue.stop_resolved fires', async () => {
		const outbox = await wireBridge()
		const issue = await givenIssue(testBed, { ownerId: OPERATOR_ID })
		const stopId = uuidv7()

		// 1. The terminal engine's execution fact — BC5 records the stop (criterion enabled by default).
		await testBed.resolve(MaterializeIssueFromExecution).handle(
			new IssueStopRaisedEvent({
				ownerId: OPERATOR_ID,
				// `detail` is REQUIRED on the frozen event since Fase 6 (§4.4 item (i)) — it is the agent's own
				// words, and it is what the Needs-you card renders. For HUMAN_REQUESTED it also becomes the
				// card's TITLE, which is how an `AskOperator` question reaches the operator verbatim instead
				// of the generic 'A participant asked for a human'.
				payload: {
					stopId,
					issueId: issue.id.value,
					threadId: issue.threadId,
					kind: StopKind.HUMAN_REQUESTED,
					detail: 'Should the refund be full or partial for orders older than 90 days?',
				},
			}) as never,
		)

		const stops = testBed.resolve(StopRepository)
		const open = await stops.openByIssue(issue.id.value)
		expect(open).toHaveLength(1)
		// THE TEXT SURVIVES END TO END (AC-6.10(b)/(d)). Before the additive `detail` field this was
		// hardcoded `''` at the bridge and the card was born empty; for HUMAN_REQUESTED the question is
		// also promoted to the title, so the operator reads the QUESTION, not a category name.
		expect(open[0]?.detail).toBe('Should the refund be full or partial for orders older than 90 days?')
		expect(open[0]?.title).toBe('Should the refund be full or partial for orders older than 90 days?')

		// 2. The operator resolves it — REVIEW_AND_SEND is applicable to HUMAN_REQUESTED.
		await testBed.resolve(ResolveStop).execute({ ownerId: OPERATOR_ID, stopId, resolution: StopResolution.REVIEW_AND_SEND })
		await outbox.flush()

		expect(await stops.openByIssue(issue.id.value)).toHaveLength(0)
		expect((await stops.findById(stopId))?.resolution).toBe(StopResolution.REVIEW_AND_SEND)

		// The cross-context resolution fact is PUBLISHED for BC4 (captured on the external mediator).
		expect(testBed.externalSpy.getPublishedOfType('integration.issue.stop_resolved')).toHaveLength(1)
	})

	it('a disabled criterion swallows the stop (no row, no integration event)', async () => {
		const outbox = await wireBridge()
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
				payload: { stopId: uuidv7(), issueId: issue.id.value, threadId: issue.threadId, kind: StopKind.HUMAN_REQUESTED, detail: 'needs a human' },
			}) as never,
		)
		await outbox.flush()

		expect(await testBed.resolve(StopRepository).openByIssue(issue.id.value)).toHaveLength(0)
		expect(testBed.externalSpy.getPublishedOfType('integration.issue.stop_resolved')).toHaveLength(0)
	})
})
