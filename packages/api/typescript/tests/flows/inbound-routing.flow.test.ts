import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread, givenIssue } from '@test/support'
import { DomainEventRepository } from '@template/core-typescript'
import { ChannelKind, ContactKind, ClassificationMethod, TranscriptKind } from '@template/contracts-typescript/wire/enums'
import { ChannelMessageReceivedEvent } from '@template/contracts-typescript/wire/events'
import { OPERATOR_ID } from '@auth/operator'
import { ConsumeInboundMessage } from '@thread/handlers/ConsumeInboundMessage'
import { TranscriptRepository } from '@thread/repositories/TranscriptRepository'
import { MessageClassifiedEvent } from '@thread/events'

/**
 * FLOW — inbound → route → classify choreography (the reachable Core saga leg).
 *
 * The gateway delivers `integration.channel_message.received` AT LEAST ONCE; the BC4 consumer
 * (`ConsumeInboundMessage`) turns that into exactly-once PROCESSING (dedup ledger), appends the
 * transcript entry, and — when the sender may invoke — demultiplexes it into an issue
 * (`ClassifyMessage`), emitting `thread.message_classified` (→ integration.message.classified).
 *
 * NOTE — the downstream `classified → terminal RunTerminalSession → integration.issue.opened → SSE`
 * leg is intentionally NOT asserted here: the terminal external handler that would consume
 * `integration.message.classified` is still empty (BUILD-LOG deferral, gateway phase), so an
 * end-to-end "issue opened from inbound" fact is unreachable today. This flow covers everything up to
 * and including the classification hand-off, which is closed.
 */
describe('Flow: inbound message → route → classify', () => {
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

	const inbound = (
		channelId: string,
		contactExternalId: string,
		messageId: string,
		opts: Partial<{ senderExternalId: string; quotedEntryId: string; text: string }> = {},
	) =>
		new ChannelMessageReceivedEvent({
			ownerId: OPERATOR_ID,
			payload: {
				channelId,
				messageId,
				contactExternalId,
				contactDisplayName: 'Test Contact',
				contactKind: ContactKind.CONTACT,
				senderExternalId: opts.senderExternalId ?? contactExternalId,
				isGroup: false,
				text: opts.text ?? 'ship the coupon fix',
				quotedEntryId: opts.quotedEntryId,
				platform: ChannelKind.WHATSAPP,
				receivedAt: new Date(),
			},
		})

	it('at-least-once delivery becomes exactly-once processing (one transcript entry)', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const consumer = testBed.resolve(ConsumeInboundMessage)
		const event = inbound(thread.channelId, thread.contactRef.externalId, 'wamid-dup')

		// The gateway redelivers the SAME platform message.
		await consumer.handle(event as never)
		await consumer.handle(event as never)

		const entries = await testBed.resolve(TranscriptRepository).listByThread(thread.id.value)
		expect(entries.filter(e => e.kind === TranscriptKind.CONTACT)).toHaveLength(1)
	})

	it('an invocable inbound quoting an open issue routes there (classified ACTION line + fact)', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const issue = await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value })
		// A prior entry already routed to that open issue — the reply-quote target.
		const quoted = await testBed.resolve(TranscriptRepository).append({
			ownerId: OPERATOR_ID,
			threadId: thread.id.value,
			kind: TranscriptKind.CONTACT,
			text: 'the earlier message',
			senderExternalId: 'stranger-42',
			issueId: issue.id.value,
		})

		const consumer = testBed.resolve(ConsumeInboundMessage)
		// Sender is not the read-only seeded contact → invocable; quotes the routed entry.
		await consumer.handle(
			inbound(thread.channelId, thread.contactRef.externalId, 'wamid-quote', {
				senderExternalId: 'stranger-42',
				quotedEntryId: quoted.entryId,
			}) as never,
		)

		const entries = await testBed.resolve(TranscriptRepository).listByThread(thread.id.value)
		const action = entries.filter(e => e.kind === TranscriptKind.ACTION)
		expect(action.some(e => e.text === `classified: ${ClassificationMethod.REPLY_QUOTE}`)).toBe(true)

		const classified = await testBed.resolve(DomainEventRepository).findByType(MessageClassifiedEvent)
		expect(classified).toHaveLength(1)
		expect(classified[0]?.payload.issueId).toBe(issue.id.value)
	})
})
