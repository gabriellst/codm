import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { scheduledCommands } from '@codm/contracts/db'
import { DrizzleClient, DrizzleDatabaseDriver } from '@codm/core-typescript'
import { TestBed, givenThread } from '@test/support'
import { MessageAuthor, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { SendDirectMessage } from './SendDirectMessage'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ChannelConnectivity } from '../services/ChannelConnectivity'
import { DirectMessageSentEvent } from '../events'

/**
 * C20 — the operator speaks as themselves on the channel, and B3's guarantee: the words they see in
 * their own console and the order to put them on WhatsApp are ONE transaction. Either both exist or
 * neither does. Before B3 the order was an integration event published through a transport that wrote
 * nothing: a crash (or a dead gateway) between the two lost the message with no retry and no trace.
 */
describe('SendDirectMessage — the entry and the delivery COMMAND commit together', () => {
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
		// The gate this use case enforces reads the Go gateway's table, which no test has behind it.
		testBed.override(ChannelConnectivity, { isConnected: async () => true, anyConnected: async () => true } as ChannelConnectivity)
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('appends the DIRECT entry and enqueues `deliver_channel_message` with the operator as the author', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

		const { entryId } = await testBed
			.resolve(SendDirectMessage)
			.execute({ ownerId: OPERATOR_ID, threadId: thread.id.value, text: 'oi, sou eu' })

		const entries = await testBed.resolve(ThreadRepository).recentEntries(thread.id.value, 10)
		expect(entries.find(e => e.entryId === entryId)?.kind).toBe(TranscriptKind.DIRECT)

		const [command] = await db.select().from(scheduledCommands)
		expect({ id: command?.id, name: command?.name, input: command?.input }).toEqual({
			// The jobId IS the entry id: a retried request that already committed re-enqueues the same id
			// and the queue's ON CONFLICT DO NOTHING makes it a no-op.
			id: entryId,
			name: 'deliver_channel_message',
			input: {
				ownerId: OPERATOR_ID,
				channelId: thread.channelId,
				contactExternalId: thread.contactRef.externalId,
				text: 'oi, sou eu',
				// A HUMAN wrote it — the owner typed it and we are only the courier.
				author: MessageAuthor.HUMAN,
			},
		})
	})

	it('ATOMICITY — a rolled-back transaction leaves NEITHER the transcript entry NOR the command', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const before = await testBed.probe().snapshot(['transcriptEntries', 'scheduledCommands', 'events'] as const)

		await driver
			.transaction(async tx => {
				await testBed.resolve(SendDirectMessage).execute({ ownerId: OPERATOR_ID, threadId: thread.id.value, text: 'morre junto' }, tx)
				throw new Error('the request died after the writes, before the commit')
			})
			.catch(() => {})

		expect(await testBed.probe().snapshot(['transcriptEntries', 'scheduledCommands', 'events'] as const)).toEqual(before)
	})

	it('the `thread.direct_message_sent` FACT is still recorded — it is an audit record with no consumer (decision 3)', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

		await testBed.resolve(SendDirectMessage).execute({ ownerId: OPERATOR_ID, threadId: thread.id.value, text: 'consta na auditoria' })

		const persisted = await testBed.probe().persistedEvents({ name: DirectMessageSentEvent.name, ownerId: OPERATOR_ID })
		expect(persisted).toHaveLength(1)
	})
})
