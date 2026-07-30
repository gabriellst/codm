import { afterAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread, givenWorkspace } from '@test/support'
import { MailboxItemKind, MailboxTargetKind, ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { MailboxRepository } from '@agent/repositories'
import { MailboxDispatcher } from '@agent/services/MailboxDispatcher'
import { AgentRunOutcome } from '@agent/enums'
import { OrchestratorRepliedEvent } from '@agent/events/OrchestratorRepliedEvent'
import { CommandQueue, DomainEventRepository, MockOutboxDispatcher } from '@codedm/core-typescript'
import { PublishAgentIntegrationEvents } from '@agent/handlers/PublishAgentIntegrationEvents'
import { DeliverOrchestratorReply } from '@thread/handlers/DeliverOrchestratorReply'

/**
 * B1 — THE RESULT COMES BACK, AND IT QUOTES THE REQUEST.
 *
 * This is the gap the founder hit within minutes of first real use: the orchestrator acked a fork and
 * was never told the work had finished, so it answered "ainda está rodando" about an issue that was
 * already COMPLETED. It was not lying — nothing had told it.
 *
 * MOCK mode, like the other choreography flows: what is under test is the HAND-OFF between components,
 * and mock mode is where the spy mediator + `MockOutboxDispatcher.flush()` make each hop observable.
 *
 * The chain under test is short but crosses three components, and per-component tests cannot see it:
 * `RunIssueTurn.persistOutcome` queues `ISSUE_RESULT` → the dispatcher claims it → `RunOrchestratorTurn`
 * composes and persists `OrchestratorRepliedEvent`. What matters at the end is the ANCHOR: an issue
 * return always quotes the entry that asked (§7.6), and that is a mandate the use case imposes rather
 * than a sentinel the model may forget.
 */
describe('Flow (integration): ISSUE_RESULT → composed reply that quotes the request', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	const ORIGIN_ENTRY = '019fac48-06c6-7a11-afdf-29fff08d4a81'

	beforeEach(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('mock', { testContainer, ownerId: OPERATOR_ID })
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const queueResult = async (threadId: string, issueId: string) =>
		testBed.resolve(MailboxRepository).enqueue({
			ownerId: OPERATOR_ID,
			targetKind: MailboxTargetKind.THREAD,
			targetId: threadId,
			kind: MailboxItemKind.ISSUE_RESULT,
			payload: {
				kind: MailboxItemKind.ISSUE_RESULT,
				issueKey: 'resumo-do-que-odisseu-fez',
				outcome: { kind: AgentRunOutcome.COMPLETED, replyText: 'Resumo pronto: 10 anos de viagem, 6 paradas.' },
				originEntryId: ORIGIN_ENTRY,
			},
			dedupKey: `result:${issueId}`,
		})

	it('AC-B1.2 — the composed turn carries replyToEntryId = the issue origin', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const thread = await givenThread(testBed, {
			ownerId: OPERATOR_ID,
			workspaceId: workspace.id.value,
			providers: [ProviderKind.CLAUDE_CODE],
		})

		expect(await queueResult(thread.id.value, '019fac48-06c6-7a11-afdf-29fff08d4a99')).toBe(true)
		expect(await testBed.resolve(MailboxDispatcher).bind(testContainer).drain()).toBe(1)

		const replies = await testBed.resolve(DomainEventRepository).findByType(OrchestratorRepliedEvent)
		expect(replies).toHaveLength(1)

		// THE ASSERTION THAT MATTERS. The stub runner emits no `[quote: …]` sentinel, so if the use case
		// did not impose the anchor this would be undefined and the answer would arrive attached to
		// nothing — which is exactly what "the result never reached me" looked like from the outside.
		expect(replies[0]?.payload.replyToEntryId).toBe(ORIGIN_ENTRY)
	})

	/**
	 * AC-B3.2 — ONE conclusion, ONE message.
	 *
	 * Before B3 two paths raced to the channel for a single finished issue: the worker's raw draft via
	 * the old delivery handler, and the orchestrator's composed answer. Both would have been delivered,
	 * and the operator would have seen the work described twice in different voices. The falsifier for
	 * this AC re-registers a second producer and requires the count to go to 2.
	 */
	it('AC-B3.2 — one finished issue produces exactly ONE channel delivery', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const thread = await givenThread(testBed, {
			ownerId: OPERATOR_ID,
			workspaceId: workspace.id.value,
			providers: [ProviderKind.CLAUDE_CODE],
		})

		await testBed.spy.register(testBed.resolve(PublishAgentIntegrationEvents))

		await queueResult(thread.id.value, '019fac48-06c6-7a11-afdf-29fff08d4a97')
		await testBed.resolve(MailboxDispatcher).bind(testContainer).drain()
		await testBed.resolve(MockOutboxDispatcher).flush()

		// EXACTLY ONE agent→channel fact for this conclusion. Before B3 there were two producers: the
		// worker's raw draft AND the composed answer. `MockExternalMediator` captures without
		// dispatching, so the external leg is invoked explicitly below — the same shape
		// `inbound-routing.flow` uses.
		const replied = testBed.externalSpy.getPublishedOfType('integration.orchestrator.replied')
		expect(replied).toHaveLength(1)
		expect(testBed.externalSpy.getPublishedOfType('integration.agent.reply_drafted')).toHaveLength(0)

		// The delivery is a COMMAND now (B3): in mock mode the queue executes inline, so a recording
		// handler under the command's name is what "the order was placed" looks like here.
		const ordered: Array<{ text: string; author: string }> = []
		await testBed.resolve(CommandQueue).registerCommandHandler({
			name: 'deliver_channel_message',
			execute: async (input: unknown) => void ordered.push(input as { text: string; author: string }),
		} as never)

		await testBed.resolve(DeliverOrchestratorReply).handle(replied[0] as never)

		expect(ordered).toHaveLength(1)
		expect(ordered[0]?.text).toBeTruthy()
	})

	it('a redelivered outcome announces once — the issue id is the dedup key', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const thread = await givenThread(testBed, {
			ownerId: OPERATOR_ID,
			workspaceId: workspace.id.value,
			providers: [ProviderKind.CLAUDE_CODE],
		})
		const issueId = '019fac48-06c6-7a11-afdf-29fff08d4a98'

		expect(await queueResult(thread.id.value, issueId)).toBe(true)
		expect(await queueResult(thread.id.value, issueId)).toBe(false)
	})
})
