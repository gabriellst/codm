import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import type { ExternalMediator } from '@codedm/core-typescript'
import { TestBed, givenThread } from '@test/support'
import { ChannelDeliveryRequestedEvent, OrchestratorRepliedEvent } from '@codedm/contracts-typescript/wire/events'
import { MessageAuthor, TranscriptKind } from '@codedm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { TranscriptRepository } from '../repositories/TranscriptRepository'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'
import { DeliverOrchestratorReply } from './DeliverOrchestratorReply'

/**
 * T6 — the leg that actually puts a reply on WhatsApp (§7.5), and the one the whole phase's
 * acceptance proof rests on: without it the orchestrator thinks, persists a fact, and nobody hears it.
 *
 * Two of the three assertions here exist because the design review found them MISSING from v1, and
 * both fail silently rather than loudly. A reply that skips the transcript is invisible to the
 * orchestrator's own next turn — the conversation would look, to it, like a series of unanswered
 * operator messages. A delivery without `replyEntryId` produces a ledger row with no entry, and a
 * human replying to that message resolves to nothing.
 */
describe('DeliverOrchestratorReply', () => {
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

	// Real repositories (the transcript write and the platform-id lookup are what is under test), and a
	// SPY mediator — the same shape `PublishAgentIntegrationEvents.test.ts` uses. Capturing the outbound
	// event is the assertion; actually dispatching it would drag in the whole channel leg.
	const published: unknown[] = []
	const build = () => {
		published.length = 0
		const mediator = { publish: mock(async (event: unknown) => void published.push(event)) } as unknown as ExternalMediator
		return new DeliverOrchestratorReply(
			testBed.resolve(ThreadRepository),
			testBed.resolve(TranscriptRepository),
			testBed.resolve(ConsumedMessageRepository),
			mediator,
		)
	}
	const deliveries = (): ChannelDeliveryRequestedEvent[] =>
		published.filter((e): e is ChannelDeliveryRequestedEvent => e instanceof ChannelDeliveryRequestedEvent)

	it('writes the SYSTEM transcript entry and asks the channel to send', async () => {
		const thread = await givenThread(testBed)
		const handler = build()

		await handler.handle(
			new OrchestratorRepliedEvent({
				ownerId: OPERATOR_ID,
				payload: { threadId: thread.id.value, text: 'sim, claro' },
			}),
		)

		const entries = await testBed.resolve(TranscriptRepository).recentByThread(thread.id.value, 10)
		const system = entries.find(e => e.kind === TranscriptKind.SYSTEM)
		expect(system?.text).toBe('sim, claro')

		const delivery = deliveries().at(-1)
		expect(delivery?.payload.text).toBe('sim, claro')
		expect(delivery?.payload.author).toBe(MessageAuthor.SYSTEM)
		// The link that lets a human's reply TO this message resolve back to an entry (§8, flow 3).
		expect(delivery?.payload.replyEntryId).toBe(system?.entryId)
	})

	it('no citation requested — no quote on the wire', async () => {
		const thread = await givenThread(testBed)
		const handler = build()

		await handler.handle(
			new OrchestratorRepliedEvent({ ownerId: OPERATOR_ID, payload: { threadId: thread.id.value, text: 'está dessa forma: xxx' } }),
		)

		expect(deliveries().at(-1)?.payload.quotedMessageId).toBeUndefined()
	})

	/**
	 * A citation whose entry has no platform id — the message was never delivered through the channel,
	 * or the ledger row predates the link. It DEGRADES to an unquoted reply rather than throwing: the
	 * dispatcher would treat a throw as a failed turn and retry it, and a retried conversational turn
	 * is a second message in a real group. An unquoted answer is worth far more than a silence.
	 */
	it('a citation that cannot be resolved degrades to no quote, and still delivers', async () => {
		const thread = await givenThread(testBed)
		const handler = build()

		await handler.handle(
			new OrchestratorRepliedEvent({
				ownerId: OPERATOR_ID,
				payload: { threadId: thread.id.value, text: 'resolvido', replyToEntryId: '019e4d24-6524-7041-9e1c-8108180cddff' },
			}),
		)

		const delivery = deliveries().at(-1)
		expect(delivery).toBeDefined()
		expect(delivery?.payload.text).toBe('resolvido')
		expect(delivery?.payload.quotedMessageId).toBeUndefined()
	})

	it('a reply for a vanished thread is dropped, not forged', async () => {
		const handler = build()
		const before = deliveries().length

		await handler.handle(
			new OrchestratorRepliedEvent({ ownerId: OPERATOR_ID, payload: { threadId: '019e4d24-6524-7041-9e1c-8108180cdd99', text: 'olá' } }),
		)

		expect(deliveries().length).toBe(before)
	})
})
