import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread, GIVEN_MENTION_TAG } from '@test/support'
import { ChannelKind, MessageType } from '@codedm/contracts-typescript/wire/enums'
import { ChannelMessageReceivedInProcessEvent } from '@codedm/contracts-typescript/wire/events'
import { OPERATOR_ID } from '@auth/operator'
import { ConsumeInboundMessage } from './ConsumeInboundMessage'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'
import { TranscriptRepository } from '../repositories/TranscriptRepository'

/**
 * Phase-6 HARD GATE — at-least-once delivery from the gateway becomes exactly-once PROCESSING.
 * The `UNIQUE(channel_id, platform_message_id)` ledger + `INSERT ... ON CONFLICT DO NOTHING` mean a
 * redelivered platform message is a total no-op: no second transcript entry, no second row.
 */
describe('Inbound message dedup (exactly-once processing)', () => {
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

	// Verbatim gateway payload (union-slots pilot): text rides the WHATSAPP/TEXT content variant.
	const buildEvent = (channelId: string, contactExternalId: string, messageId: string, opts: { text?: string; quotes?: string } = {}) =>
		new ChannelMessageReceivedInProcessEvent({
			ownerId: OPERATOR_ID,
			payload: {
				channelId,
				messageId,
				internalMessageId: crypto.randomUUID(),
				remoteId: contactExternalId,
				senderId: contactExternalId,
				fromMe: false,
				isGroup: false,
				timestamp: Math.floor(Date.now() / 1000),
				occurredAt: new Date(),
				observedAt: new Date(),
				messageType: MessageType.TEXT,
				content: {
					text: opts.text ?? `${GIVEN_MENTION_TAG} ship the coupon fix`,
					...(opts.quotes ? { contextInfo: { stanzaId: opts.quotes } } : {}),
				},
				platform: ChannelKind.WHATSAPP,
				ownerId: OPERATOR_ID,
			},
		})

	it('ConsumedMessageRepository.claim: first claim true, redelivery false, one row', async () => {
		const repo = testBed.resolve(ConsumedMessageRepository)
		const channelId = '00000000-0000-4000-8000-0000000000aa'
		const first = await repo.claim({ ownerId: OPERATOR_ID, channelId, platformMessageId: 'wamid-1' })
		const second = await repo.claim({ ownerId: OPERATOR_ID, channelId, platformMessageId: 'wamid-1' })
		expect(first).toBe(true)
		expect(second).toBe(false) // ON CONFLICT DO NOTHING → redelivery no-op
		expect(await repo.has(channelId, 'wamid-1')).toBe(true)
	})

	it('double-delivered inbound is processed exactly once (one transcript entry)', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const handler = testBed.resolve(ConsumeInboundMessage)
		const transcript = testBed.resolve(TranscriptRepository)

		const event = buildEvent(thread.channelId, thread.contactRef.externalId, 'wamid-double')

		// Deliver the SAME platform message twice (redelivery).
		await handler.handle(event as never)
		await handler.handle(event as never)

		const entries = await transcript.listByThread(thread.id.value)
		const contactEntries = entries.filter(e => e.kind === 'CONTACT')
		expect(contactEntries).toHaveLength(1) // dedup: the redelivery was a no-op
	})

	it('distinct platform messages are both processed', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const handler = testBed.resolve(ConsumeInboundMessage)
		const transcript = testBed.resolve(TranscriptRepository)

		await handler.handle(buildEvent(thread.channelId, thread.contactRef.externalId, 'wamid-a') as never)
		await handler.handle(buildEvent(thread.channelId, thread.contactRef.externalId, 'wamid-b') as never)

		const entries = await transcript.listByThread(thread.id.value)
		expect(entries.filter(e => e.kind === 'CONTACT')).toHaveLength(2)
	})

	/**
	 * THE REPLY-QUOTE SHORTCUT, ALIVE FOR THE FIRST TIME.
	 *
	 * `IssueRouter` documents its first branch as "authoritative, wins over context matching, NO model
	 * call" — and it had never fired outside the test ingress controller, because nothing turned a
	 * WhatsApp quote into a `quotedEntryId`. WhatsApp reports the quote as `contextInfo.stanzaId`, the
	 * PLATFORM id; the router needs OUR entry id. The consumed ledger is exactly that map and its
	 * `threadId`/`entryId` columns were never filled, because `claim` runs before ingestion.
	 *
	 * Two messages: the first becomes an entry and closes its ledger row; the second quotes the first
	 * by platform id and must arrive at the transcript carrying the first entry's id.
	 */
	it('resolves a WhatsApp reply-quote (contextInfo.stanzaId) into quotedEntryId via the ledger', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const handler = testBed.resolve(ConsumeInboundMessage)
		const transcript = testBed.resolve(TranscriptRepository)

		await handler.handle(buildEvent(thread.channelId, thread.contactRef.externalId, 'wamid-original') as never)
		const [original] = await transcript.recentByThread(thread.id.value, 10)
		expect(original).toBeDefined()

		// The ledger row is CLOSED by the first message — that is what makes it quotable at all.
		const linked = await testBed.resolve(ConsumedMessageRepository).findEntry(thread.channelId, 'wamid-original')
		expect(linked).toEqual({ threadId: thread.id.value, entryId: original!.entryId })

		await handler.handle(
			buildEvent(thread.channelId, thread.contactRef.externalId, 'wamid-reply', {
				text: `${GIVEN_MENTION_TAG} and also this`,
				quotes: 'wamid-original',
			}) as never,
		)

		const entries = await transcript.recentByThread(thread.id.value, 10)
		const reply = entries.find(e => e.text.includes('and also this'))
		expect(reply?.quotedEntryId).toBe(original!.entryId)
	})

	it('a quote we cannot resolve degrades to no quote rather than failing', async () => {
		// A quote pointing at a message from before the thread was attached, or at one we dropped.
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const handler = testBed.resolve(ConsumeInboundMessage)

		await handler.handle(
			buildEvent(thread.channelId, thread.contactRef.externalId, 'wamid-orphan', { quotes: 'wamid-never-seen' }) as never,
		)

		const [entry] = await testBed.resolve(TranscriptRepository).recentByThread(thread.id.value, 10)
		expect(entry).toBeDefined()
		expect(entry!.quotedEntryId).toBeUndefined()
	})
})
