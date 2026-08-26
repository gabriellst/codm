import { afterAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread, givenWorkspace } from '@test/support'
import { MailboxItemKind, MailboxTargetKind, ProviderKind, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { scheduledCommands } from '@codm/contracts/db'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { MailboxDispatcher } from '@agent/services/MailboxDispatcher'
import { AgentRunOutcome } from '@agent/enums'
import { OrchestratorRepliedEvent } from '@agent/events/OrchestratorRepliedEvent'
import { CommandQueue, DomainEventRepository, MockOutboxDispatcher, OutboxDispatcher, LibSqlDatabaseDriver } from '@codm/core-typescript'
import { PublishAgentIntegrationEvents } from '@agent/handlers/PublishAgentIntegrationEvents'
import { ConsumedMessageRepository } from '@thread/repositories/ConsumedMessageRepository'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
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
		testBed = await TestBed.create('mock', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const queueResult = async (threadId: string, issueId: string) =>
		testBed.resolve(MailboxRepository).enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
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
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const thread = await givenThread(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
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
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const thread = await givenThread(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
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
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const thread = await givenThread(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			workspaceId: workspace.id.value,
			providers: [ProviderKind.CLAUDE_CODE],
		})
		const issueId = '019fac48-06c6-7a11-afdf-29fff08d4a98'

		expect(await queueResult(thread.id.value, issueId)).toBe(true)
		expect(await queueResult(thread.id.value, issueId)).toBe(false)
	})
})

/**
 * THE SAME CHAIN, RUN THE REST OF THE WAY — does the quote reach the WIRE?
 *
 * The suite above stops at `OrchestratorRepliedEvent.replyToEntryId`, which is the last link the AGENT
 * context owns. Everything that decides whether a human actually sees a quoted reply happens after it,
 * in `thread`: `RecordOrchestratorReply` has to turn that entry id back into the PLATFORM message id
 * through the consumed ledger, and put it on the `deliver_channel_message` order. An `originEntryId`
 * that travels perfectly and then finds no ledger row degrades to `quotedMessageId: undefined` — the
 * reply is still delivered, still correct, and simply not attached to anything. Which is exactly what
 * "it doesn't quote" looks like from a chat, and exactly what no test above can see.
 *
 * So this runs INTEGRATION rather than mock, deliberately: the lookup under test is
 * `LibSqlConsumedMessageRepository.findPlatformId`, a real `WHERE entry_id = ?`. The mock's version is
 * a hand-written scan over a Map and would answer correctly no matter what the SQL says.
 *
 * The GIVEN is built through repositories only — `ThreadRepository.recordEntry/save` for the message
 * that asked, `ConsumedMessageRepository.claim` + `linkEntry` for the ledger row. Those two calls are
 * what `ConsumeInboundMessage` does at its steps 1 and 6; going through the ingest use case instead
 * would make this test depend on that use case being right, which is the thing a flow test must not do.
 */
describe('Flow (integration): the issue result quotes the request ON THE WIRE', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	/** The wamid the gateway gave the operator's message — what a real quote must come back carrying. */
	const ASK_PLATFORM_ID = 'wamid.HBgNNTUxMTk5OTk5OTk5ORUCABIYFjNBMDAwMDAwMDAwMDAwMDAwMDAwMDA='

	beforeEach(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		await testBed.reset()
		// The internal handler that carries the domain fact across to the wire, registered the way every
		// flow spec registers one: TestBed wires DI, `BoundedContext.create` wires the mediator at boot,
		// and a test is neither.
		await testBed.spy.register(testBed.resolve(PublishAgentIntegrationEvents))
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	/**
	 * A thread, the operator's request already in the transcript, and the ledger row linking that entry
	 * to the platform message it arrived as. `withLedgerRow: false` is the message that reached the
	 * transcript but never the ledger.
	 */
	async function givenTheRequest(withLedgerRow = true) {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const thread = await givenThread(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			workspaceId: workspace.id.value,
			providers: [ProviderKind.CLAUDE_CODE],
		})

		const threads = testBed.resolve(ThreadRepository)
		const loaded = (await threads.findById(thread.id.value))!
		const ask = loaded.recordEntry({
			kind: TranscriptKind.CONTACT,
			senderExternalId: 'operator',
			text: 'faz um resumo do que o odisseu fez',
		})
		await threads.save(loaded)

		if (withLedgerRow) {
			const consumed = testBed.resolve(ConsumedMessageRepository)
			await consumed.claim({ ownerId: MOCK_CLOUD_OWNER_ID, channelId: thread.channelId, platformMessageId: ASK_PLATFORM_ID })
			await consumed.linkEntry({
				channelId: thread.channelId,
				platformMessageId: ASK_PLATFORM_ID,
				threadId: thread.id.value,
				entryId: ask.entryId,
			})
		}

		return { thread, askEntryId: ask.entryId }
	}

	/**
	 * Queue the conclusion exactly as `RunIssueTurn.enqueueResult` shapes it, then run the chain to the
	 * end and hand back every observable it crossed.
	 *
	 * It ASSERTS NOTHING — each caller does, in its own `it`. The intermediate counts are returned rather
	 * than checked here so a break mid-chain names itself (`drained` 0, `replied` empty) instead of
	 * surfacing as an empty order list three hops later.
	 */
	async function announceResult(threadId: string, originEntryId?: string) {
		await testBed.resolve(MailboxRepository).enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.THREAD,
			targetId: threadId,
			kind: MailboxItemKind.ISSUE_RESULT,
			payload: {
				kind: MailboxItemKind.ISSUE_RESULT,
				issueKey: 'resumo-do-que-odisseu-fez',
				outcome: { kind: AgentRunOutcome.COMPLETED, replyText: 'Resumo pronto: 10 anos de viagem, 6 paradas.' },
				originEntryId,
			},
			dedupKey: `result:${crypto.randomUUID()}`,
		})

		const drained = await testBed.resolve(MailboxDispatcher).bind(testContainer).drain()
		await testBed.resolve(OutboxDispatcher).flush()

		// `MockExternalMediator` captures without dispatching, so the external leg is invoked explicitly —
		// the same shape the other choreography flows use.
		const replied = testBed.externalSpy.getPublishedOfType('integration.orchestrator.replied')
		for (const event of replied) await testBed.resolve(DeliverOrchestratorReply).handle(event as never)

		const rows = await testBed.resolve(LibSqlDatabaseDriver).db.select().from(scheduledCommands)
		const orders = rows
			.filter(row => row.name === 'deliver_channel_message')
			.map(row => row.input as { text: string; quotedMessageId?: string; replyEntryId?: string })
		return { drained, replied, orders }
	}

	/**
	 * THE MEASUREMENT. Asserted on the durable `deliver_channel_message` row rather than on a spy,
	 * because that row IS the order the gateway executes: a chain that computed the right anchor and
	 * dropped it on the way to the queue would satisfy every other assertion in this file and still
	 * deliver an unattached message.
	 */
	it('the delivery order carries quotedMessageId = the PLATFORM id of the message that asked', async () => {
		const { thread, askEntryId } = await givenTheRequest()

		const { drained, replied, orders } = await announceResult(thread.id.value, askEntryId)

		// The chain, hop by hop — so a break names itself instead of arriving as an empty order list.
		expect(drained).toBe(1)
		expect(replied).toHaveLength(1)
		expect(orders).toHaveLength(1)
		expect(orders[0]?.quotedMessageId).toBe(ASK_PLATFORM_ID)
	})

	/**
	 * THE NEGATIVE THAT KEEPS THE POSITIVE HONEST, and the founder's own named suspect: an issue forked
	 * by a WHISPER has no originating message (`E2eMcpDriver` documents it — "a whisper queues an
	 * orchestrator turn with no origin"). There is nothing to attach to, and the reply must still go out.
	 *
	 * Without this case a seam that quoted the LAST inbound of the thread, or any row it could find,
	 * would pass the test above and be wrong in production.
	 */
	it('an issue with no origin delivers an UNATTACHED reply — never a borrowed anchor', async () => {
		const { thread } = await givenTheRequest()

		const { orders } = await announceResult(thread.id.value, undefined)

		expect(orders).toHaveLength(1)
		expect(orders[0]?.text).toBeTruthy()
		expect(orders[0]?.quotedMessageId).toBeUndefined()
	})

	/**
	 * The message reached the transcript but never the ledger (it predates the link, or it was a console
	 * message that never had a platform id). The anchor cannot be resolved, and the rule is that an
	 * unquoted answer beats a silence — so the reply still ships.
	 */
	it('an origin that never reached the channel degrades to no quote, and still delivers', async () => {
		const { thread, askEntryId } = await givenTheRequest(false)

		const { orders } = await announceResult(thread.id.value, askEntryId)

		expect(orders).toHaveLength(1)
		expect(orders[0]?.text).toBeTruthy()
		expect(orders[0]?.quotedMessageId).toBeUndefined()
	})
})
