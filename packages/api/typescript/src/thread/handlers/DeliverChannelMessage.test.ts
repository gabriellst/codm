import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread } from '@test/support'
import { ContactKind, MessageAuthor } from '@codedm/contracts-typescript/wire/enums'
import { ChannelDeliveryRequestedEvent } from '@codedm/contracts-typescript/wire/events'
import { OPERATOR_ID } from '@auth/operator'
import { DeliverChannelMessage } from './DeliverChannelMessage'
import { ChannelSender, MockChannelSender } from '../services/ChannelSender'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'

/**
 * The delivery leg, and the loop it must not open.
 *
 * WhatsApp echoes back everything this account sends, and the gateway now bridges from-me messages
 * INBOUND — that is how the owner's own words are heard. So a reply we send comes back as speech, and
 * a consumer that cannot recognise it answers itself, forever.
 *
 * The structural break is the exactly-once ledger that already exists: the send returns a platform
 * message id, we claim it, and the echo — arriving with that same id from either Go emission site —
 * is a redelivery that `ConsumeInboundMessage` drops before touching a thread.
 */
describe('DeliverChannelMessage — the reply leaves, and its echo cannot come back as speech', () => {
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

	const request = (channelId: string, contactExternalId: string, author: MessageAuthor) =>
		new ChannelDeliveryRequestedEvent({
			ownerId: OPERATOR_ID,
			payload: { channelId, contactExternalId, contactDisplayName: 'Ada', contactKind: ContactKind.GROUP, text: 'here you go', author },
		})

	it('sends through the channel seam, carrying the owner explicitly', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const sender = new MockChannelSender()
		testBed.override(ChannelSender, sender)

		await testBed
			.resolve(DeliverChannelMessage)
			.handle(request(thread.channelId, thread.contactRef.externalId, MessageAuthor.SYSTEM) as never)

		expect(sender.sent).toHaveLength(1)
		expect(sender.sent[0]).toMatchObject({
			channelId: thread.channelId,
			remoteId: thread.contactRef.externalId,
			text: 'here you go',
			ownerId: OPERATOR_ID,
		})
	})

	it('CLAIMS its own outgoing message, so the echo is a redelivery rather than speech', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const sender = new MockChannelSender()
		testBed.override(ChannelSender, sender)
		const ledger = testBed.resolve(ConsumedMessageRepository)

		await testBed
			.resolve(DeliverChannelMessage)
			.handle(request(thread.channelId, thread.contactRef.externalId, MessageAuthor.SYSTEM) as never)

		const ourId = 'mock-wamid-1'
		expect(await ledger.has(thread.channelId, ourId)).toBe(true)
		// THE LOOP PROOF, expressed the way the inbound consumer expresses it: its FIRST act is `claim`,
		// and a second claim on an already-claimed id returns false — so the echo stops before any
		// thread lookup, transcript write or classification.
		expect(await ledger.claim({ ownerId: OPERATOR_ID, channelId: thread.channelId, platformMessageId: ourId })).toBe(false)
	})

	it('does NOT claim a message a human composed — the owner speaking is not the product speaking', async () => {
		// A direct message the owner typed in the console rides the same delivery path, but it is their
		// speech: claiming it would make the transcript miss the words they actually said on the channel.
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		testBed.override(ChannelSender, new MockChannelSender())

		await testBed
			.resolve(DeliverChannelMessage)
			.handle(request(thread.channelId, thread.contactRef.externalId, MessageAuthor.HUMAN) as never)

		expect(await testBed.resolve(ConsumedMessageRepository).has(thread.channelId, 'mock-wamid-1')).toBe(false)
	})
})
