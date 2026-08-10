import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { scheduledCommands } from '@codm/contracts/db'
import { DrizzleDatabaseDriver, DrizzleTransaction } from '@codm/core-typescript'
import { TestBed, givenThread } from '@test/support'
import { MessageAuthor, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { RecordOrchestratorReply } from './RecordOrchestratorReply'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'

/**
 * The transactional body the handler used to run OUTSIDE any transaction (the outbox dispatches with
 * no tx — DrizzleOutboxDispatcher's phase 2). It does three things, and each closes a gap:
 *
 *  1. WRITES THE SYSTEM TRANSCRIPT ENTRY — without it the agent's own words are absent from the very
 *     buffer its next turn reads, so a conversation looks, to the orchestrator, like a series of
 *     unanswered operator messages.
 *  2. RESOLVES THE QUOTE — `findPlatformId(replyToEntryId)` turns our entry id into the platform
 *     message id a WhatsApp quote needs. Absent-but-requested DEGRADES to no quote rather than
 *     failing: a retried conversational turn is a second message in a real group.
 *  3. ORDERS THE DELIVERY as a durable command, in the SAME transaction as (1). Before B3 these were
 *     two independent operations, and the second one persisted nothing.
 */
describe('RecordOrchestratorReply — the reply is transcribed and its delivery ordered, atomically', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let db: DrizzleTransaction
	let driver: DrizzleDatabaseDriver

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
		db = testBed.resolve(DrizzleDatabaseDriver).db
		driver = testBed.resolve(DrizzleDatabaseDriver)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const commands = async () => db.select().from(scheduledCommands)

	it('writes the SYSTEM entry and enqueues the delivery carrying the entry it IS', async () => {
		const thread = await givenThread(testBed)

		await testBed.resolve(RecordOrchestratorReply).execute({ ownerId: OPERATOR_ID, threadId: thread.id.value, text: 'sim, claro' })

		const entries = await testBed.resolve(ThreadRepository).recentEntries(thread.id.value, 10)
		const system = entries.find(e => e.kind === TranscriptKind.SYSTEM)
		expect(system?.text).toBe('sim, claro')

		const [command] = await commands()
		expect({ name: command?.name, id: command?.id, input: command?.input }).toEqual({
			name: 'deliver_channel_message',
			id: system?.entryId,
			input: {
				ownerId: OPERATOR_ID,
				channelId: thread.channelId,
				contactExternalId: thread.contactRef.externalId,
				text: 'sim, claro',
				author: MessageAuthor.SYSTEM,
				// The link that lets a human's reply TO this message resolve back to an entry (§8, flow 3).
				// BOTH columns of the ledger row travel, because `linkEntry` names `threadId` too and the
				// PRODUCER is the layer holding the aggregate — the delivery leg would have to re-derive it
				// from (channel, contact) and could land on a thread other than the one it just wrote to.
				replyEntryId: system?.entryId,
				replyThreadId: thread.id.value,
			},
		})
	})

	/*
	 * THESE THREE CASES STOP AT THE ORDER, and the names now say so.
	 *
	 * They used to claim "the wire" and "the gateway quotes" while asserting on `command.input` — the
	 * durable row, one hop short of the send. That gap is exactly where the citation was being dropped:
	 * `DeliverChannelMessage` never handed `quotedMessageId` to `ChannelSender.send`, and a suite that
	 * measured the row read green the whole time. What reaches the SENDER is asserted in
	 * `DeliverChannelMessage.test.ts` ("the citation reaches the wire"); this file owns the resolution.
	 */
	it('no citation requested — no quote on the ORDER', async () => {
		const thread = await givenThread(testBed)

		await testBed
			.resolve(RecordOrchestratorReply)
			.execute({ ownerId: OPERATOR_ID, threadId: thread.id.value, text: 'está dessa forma: xxx' })

		const [command] = await commands()
		const input = command?.input as { quotedMessageId?: string }
		expect(input.quotedMessageId).toBeUndefined()
	})

	it('a citation that cannot be resolved degrades to no quote, and still orders the delivery', async () => {
		const thread = await givenThread(testBed)

		await testBed.resolve(RecordOrchestratorReply).execute({
			ownerId: OPERATOR_ID,
			threadId: thread.id.value,
			text: 'resolvido',
			replyToEntryId: '019e4d24-6524-7041-9e1c-8108180cddff',
		})

		const [command] = await commands()
		const input = command?.input as { text: string; quotedMessageId?: string }
		expect(input).toMatchObject({ text: 'resolvido' })
		expect(input.quotedMessageId).toBeUndefined()
	})

	it('a citation that RESOLVES rides the ORDER as the platform id the gateway will quote', async () => {
		const thread = await givenThread(testBed)
		// The seed goes through the AGGREGATE since B4 — never a loose append. A CONTACT line carries the
		// sender that spoke, which is the invariant `recordEntry` owns.
		const quoted = thread.recordEntry({
			kind: TranscriptKind.CONTACT,
			text: 'e o cupom?',
			senderExternalId: thread.contactRef.externalId,
		})
		await testBed.resolve(ThreadRepository).save(thread)
		await testBed
			.resolve(ConsumedMessageRepository)
			.claim({ ownerId: OPERATOR_ID, channelId: thread.channelId, platformMessageId: 'wamid-asked' })
		await testBed.resolve(ConsumedMessageRepository).linkEntry({
			channelId: thread.channelId,
			platformMessageId: 'wamid-asked',
			threadId: thread.id.value,
			entryId: quoted.entryId,
		})

		await testBed
			.resolve(RecordOrchestratorReply)
			.execute({ ownerId: OPERATOR_ID, threadId: thread.id.value, text: 'saiu', replyToEntryId: quoted.entryId })

		const [command] = await commands()
		const input = command?.input as { quotedMessageId?: string }
		expect(input.quotedMessageId).toBe('wamid-asked')
	})

	it('a reply for a vanished thread is dropped, not forged — nothing is written and nothing is ordered', async () => {
		const before = await testBed.probe().snapshot(['transcriptEntries', 'scheduledCommands'] as const)

		await testBed
			.resolve(RecordOrchestratorReply)
			.execute({ ownerId: OPERATOR_ID, threadId: '019e4d24-6524-7041-9e1c-8108180cdd99', text: 'olá' })

		expect(await testBed.probe().snapshot(['transcriptEntries', 'scheduledCommands'] as const)).toEqual(before)
	})

	it('ATOMICITY — a rolled-back transaction leaves NEITHER the entry NOR the command', async () => {
		const thread = await givenThread(testBed)
		const before = await testBed.probe().snapshot(['transcriptEntries', 'scheduledCommands'] as const)

		await driver
			.transaction(async tx => {
				await testBed.resolve(RecordOrchestratorReply).execute({ ownerId: OPERATOR_ID, threadId: thread.id.value, text: 'morre junto' }, tx)
				throw new Error('the turn died after the writes, before the commit')
			})
			.catch(() => {})

		expect(await testBed.probe().snapshot(['transcriptEntries', 'scheduledCommands'] as const)).toEqual(before)
	})
})
