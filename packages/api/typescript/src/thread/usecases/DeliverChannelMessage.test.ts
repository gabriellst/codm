import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { scheduledCommands } from '@codedm/contracts/db'
import { DrizzleClient, DrizzleDatabaseDriver, MockLoggingService, SqliteCommandQueue } from '@codedm/core-typescript'
import { TestBed, givenThread } from '@test/support'
import { MessageAuthor } from '@codedm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { DeliverChannelMessage } from './DeliverChannelMessage'
import { ChannelSender, MockChannelSender, type SendChannelMessageInput } from '../services/ChannelSender'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'

/**
 * The delivery leg, now a COMMAND (B3, decision 2) — and the two properties that made it worth moving.
 *
 * 1. THE LOOP MUST NOT OPEN. WhatsApp echoes back everything this account sends, and the gateway
 *    bridges from-me messages INBOUND. The send returns the platform message id; we write it into the
 *    same exactly-once ledger `ConsumeInboundMessage` consults FIRST, so the echo is a redelivery that
 *    dies before any thread lookup. Unchanged from the EventHandler this replaces.
 * 2. A FAILED SEND IS RETRIED. This is the new one, and the reason the event died: as an integration
 *    event the delivery rode `ExternalMediator.publish`, which wrote NOTHING — a dead gateway lost the
 *    message with no retry and no trace. As a command it is a row in `shared_scheduled_commands`, and
 *    the last case here proves the retry against the real queue.
 */
describe('DeliverChannelMessage — the reply leaves, its echo cannot come back as speech, and a failed send is retried', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let db: DrizzleClient
	let driver: DrizzleDatabaseDriver

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
		db = testBed.resolve(DrizzleClient)
		driver = testBed.resolve(DrizzleDatabaseDriver)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const command = (channelId: string, contactExternalId: string, author: MessageAuthor) => ({
		ownerId: OPERATOR_ID,
		channelId,
		contactExternalId,
		text: 'here you go',
		author,
	})

	const rowById = async (id: string) => (await db.select().from(scheduledCommands).where(eq(scheduledCommands.id, id)))[0]

	// Writes go through the driver's write seam — `db` is the READ connection.
	const rewindRunAt = async (id: string) =>
		driver.transaction(tx =>
			tx
				.update(scheduledCommands)
				.set({ runAt: new Date(Date.now() - 1_000) })
				.where(eq(scheduledCommands.id, id)),
		)

	it('sends through the channel seam, carrying the owner explicitly', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const sender = new MockChannelSender()
		testBed.override(ChannelSender, sender)

		await testBed.resolve(DeliverChannelMessage).execute(command(thread.channelId, thread.contactRef.externalId, MessageAuthor.SYSTEM))

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
		testBed.override(ChannelSender, new MockChannelSender())
		const ledger = testBed.resolve(ConsumedMessageRepository)

		await testBed.resolve(DeliverChannelMessage).execute(command(thread.channelId, thread.contactRef.externalId, MessageAuthor.SYSTEM))

		const ourId = 'mock-wamid-1'
		expect(await ledger.has(thread.channelId, ourId)).toBe(true)
		// THE LOOP PROOF, expressed the way the inbound consumer expresses it: its FIRST act is `claim`,
		// and a second claim on an already-claimed id returns false — so the echo stops before any thread
		// lookup, transcript write or classification.
		expect(await ledger.claim({ ownerId: OPERATOR_ID, channelId: thread.channelId, platformMessageId: ourId })).toBe(false)
	})

	it('does NOT claim a message a human composed — the owner speaking is not the product speaking', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		testBed.override(ChannelSender, new MockChannelSender())

		await testBed.resolve(DeliverChannelMessage).execute(command(thread.channelId, thread.contactRef.externalId, MessageAuthor.HUMAN))

		expect(await testBed.resolve(ConsumedMessageRepository).has(thread.channelId, 'mock-wamid-1')).toBe(false)
	})

	it('FALSEADOR — a failed send is RETRIED from the queue: the command survives, backs off, and delivers on the next tick', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

		// A gateway that is down exactly once. `GatewayChannelSender` turns any transport failure into a
		// throw, which is all the queue needs to see.
		const sent: SendChannelMessageInput[] = []
		let failNext = true
		testBed.override(ChannelSender, {
			async send(input: SendChannelMessageInput) {
				if (failNext) {
					failNext = false
					throw new Error('gateway down')
				}
				sent.push(input)
				return { messageId: 'wamid-after-retry' }
			},
		} as ChannelSender)

		const queue = new SqliteCommandQueue(driver, new MockLoggingService())
		await queue.registerCommandHandler(testBed.resolve(DeliverChannelMessage))
		queue.stopPolling() // this test drives tick() deterministically — no background interval

		await queue.enqueueCommand<DeliverChannelMessage>(
			'deliver_channel_message',
			command(thread.channelId, thread.contactRef.externalId, MessageAuthor.SYSTEM),
			{ jobId: 'job-delivery' },
		)

		// Attempt 1: the gateway is down. NOTHING IS LOST — the row stays, one attempt charged, backed off
		// into the future, not dead-lettered. On the old path (publish → in-memory dispatch) there was no
		// row at all: the message was gone.
		await queue.tick()
		expect(sent).toHaveLength(0)
		const backedOff = await rowById('job-delivery')
		expect({
			attempts: backedOff?.attempts,
			dead: backedOff?.deadAt ?? null,
			runsInFuture: (backedOff?.runAt.getTime() ?? 0) > Date.now(),
		}).toEqual({ attempts: 1, dead: null, runsInFuture: true })

		// "Time passes" — the backoff expires and the SAME command runs again, this time reaching the channel.
		await rewindRunAt('job-delivery')
		await queue.tick()
		expect(sent).toHaveLength(1)
		expect(sent[0]).toMatchObject({ channelId: thread.channelId, text: 'here you go' })
		expect(await rowById('job-delivery')).toBeUndefined() // one-shot consumed → gone

		await queue.close()
	})
})
