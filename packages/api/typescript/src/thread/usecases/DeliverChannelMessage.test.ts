import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { scheduledCommands } from '@codm/contracts/db'
import { LibSqlDatabaseDriver, MockLoggingService, LibSqlCommandQueue, LibSqlTransaction } from '@codm/core-typescript'
import { TestBed, givenThread } from '@test/support'
import { ChannelKind, MessageAuthor, MessageType, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { ChannelMessageReceivedInProcessEvent } from '@codm/contracts-typescript/wire/events'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { DeliverChannelMessage } from './DeliverChannelMessage'
import { ChannelSender, MockChannelSender, type SendChannelMessageInput } from '../services/ChannelSender'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ConsumeInboundMessage } from '../handlers/ConsumeInboundMessage'
import { EDIT_WINDOW_MS, ReplyStreamer, streamKey } from '../services/ReplyStreamer'
import { RecordOrchestratorReply } from './RecordOrchestratorReply'
import type { Thread } from '../entities/Thread'

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
	let db: LibSqlTransaction
	let driver: LibSqlDatabaseDriver

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		db = testBed.resolve(LibSqlDatabaseDriver).db
		driver = testBed.resolve(LibSqlDatabaseDriver)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const command = (channelId: string, contactExternalId: string, author: MessageAuthor) => ({
		ownerId: MOCK_CLOUD_OWNER_ID,
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
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const sender = new MockChannelSender()
		testBed.override(ChannelSender, sender)

		await testBed.resolve(DeliverChannelMessage).execute(command(thread.channelId, thread.contactRef.externalId, MessageAuthor.SYSTEM))

		expect(sender.sent).toHaveLength(1)
		expect(sender.sent[0]).toMatchObject({
			channelId: thread.channelId,
			remoteId: thread.contactRef.externalId,
			text: 'here you go',
			ownerId: MOCK_CLOUD_OWNER_ID,
		})
	})

	it('CLAIMS its own outgoing message, so the echo is a redelivery rather than speech', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		testBed.override(ChannelSender, new MockChannelSender())
		const ledger = testBed.resolve(ConsumedMessageRepository)

		await testBed.resolve(DeliverChannelMessage).execute(command(thread.channelId, thread.contactRef.externalId, MessageAuthor.SYSTEM))

		const ourId = 'mock-wamid-1'
		expect(await ledger.has(thread.channelId, ourId)).toBe(true)
		// THE LOOP PROOF, expressed the way the inbound consumer expresses it: its FIRST act is `claim`,
		// and a second claim on an already-claimed id returns false — so the echo stops before any thread
		// lookup, transcript write or classification.
		expect(await ledger.claim({ ownerId: MOCK_CLOUD_OWNER_ID, channelId: thread.channelId, platformMessageId: ourId })).toBe(false)
	})

	it('does NOT claim a message a human composed — the owner speaking is not the product speaking', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		testBed.override(ChannelSender, new MockChannelSender())

		await testBed.resolve(DeliverChannelMessage).execute(command(thread.channelId, thread.contactRef.externalId, MessageAuthor.HUMAN))

		expect(await testBed.resolve(ConsumedMessageRepository).has(thread.channelId, 'mock-wamid-1')).toBe(false)
	})

	it('FALSEADOR — a failed send is RETRIED from the queue: the command survives, backs off, and delivers on the next tick', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

		// A gateway that is down exactly once. `GatewayChannelSender` turns any transport failure into a
		// throw, which is all the queue needs to see. It is the REAL double with `send` failing once,
		// not a bare `{ send }`: what the queue resolves is the whole `ChannelSender` port, so a stand-in
		// that only answers `send` is drift — and drift is exactly what nobody sees until it matters.
		let failNext = true
		class FlakyChannelSender extends MockChannelSender {
			override async send(input: SendChannelMessageInput, ownerId: string): Promise<{ messageId: string }> {
				if (failNext) {
					failNext = false
					throw new Error('gateway down')
				}
				await super.send(input, ownerId)
				return { messageId: 'wamid-after-retry' }
			}
		}
		const gateway = new FlakyChannelSender()
		const sent = gateway.sent
		testBed.override(ChannelSender, gateway)

		const queue = new LibSqlCommandQueue(driver, new MockLoggingService())
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

/**
 * THE OTHER HALF OF THE LEDGER, and the bug it hid (founder, 31-jul).
 *
 * The founder replied — a real WhatsApp reply, no `@` — to a message the AGENT had sent, expecting the
 * documented behaviour: `repliesToAgent` stands the mention gate down, because replying to the agent's
 * own words is addressing it. Nothing happened. The entry his message produced reached the transcript
 * with `quoted_entry_id` EMPTY.
 *
 * The ledger that maps "platform id → transcript entry" was written for INBOUND messages only:
 * `ConsumeInboundMessage` closes its row with `linkEntry`, while the delivery leg only ever `claim`ed —
 * enough to recognise its own echo, not enough to say WHICH entry the message is. So the agent's own
 * speech existed in the ledger as an unattributed row, `findEntry` returned undefined for it, and
 * `IngestChannelMessage` computed `repliesToAgent = false` on every reply to the agent. The mention gate
 * then did exactly what it is supposed to do to a message that does not cite the agent: nothing.
 *
 * That is also why quoting from the OTHER direction always worked — the task-completion reply quotes an
 * OPERATOR message, which is inbound and therefore linked.
 *
 * These two cases are the cycle end to end: the agent speaks, its words become resolvable by the id the
 * platform gave them, and a reply to that id invokes with no citation. One covers the plain send, one
 * covers the streamed reply that is COMPLETED rather than sent — the two ways an agent reply can reach
 * the channel, and a link that only covers the first leaves streaming broken in exactly the same way.
 */
describe("DeliverChannelMessage — the agent's own words become quotable, so a reply to them invokes without a citation", () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const AGENT_LINE = 'rodo a migration agora ou depois do deploy?'

	/**
	 * The agent's reply as a transcript entry — recorded through the AGGREGATE and the REPOSITORY, the
	 * way `RecordOrchestratorReply` records it (`kind: SYSTEM`), never by running that use case.
	 */
	const givenAgentReply = async (thread: Thread) => {
		const entry = thread.recordEntry({ kind: TranscriptKind.SYSTEM, text: AGENT_LINE })
		await testBed.resolve(ThreadRepository).save(thread)
		return entry
	}

	/** What `RecordOrchestratorReply` enqueues: the text, and the entry the outbound message IS. */
	const deliver = (thread: Thread, entryId: string) =>
		testBed.resolve(DeliverChannelMessage).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			channelId: thread.channelId,
			contactExternalId: thread.contactRef.externalId,
			text: AGENT_LINE,
			author: MessageAuthor.SYSTEM,
			replyEntryId: entryId,
			replyThreadId: thread.id.value,
		})

	/**
	 * The founder's reply, as the gateway bridges it: `fromMe` (he answered from his own phone), quoting
	 * the agent's message by PLATFORM id, and carrying NO citation tag — which is the whole point.
	 */
	const replyQuoting = (thread: Thread, quotedPlatformId: string) =>
		new ChannelMessageReceivedInProcessEvent({
			ownerId: MOCK_CLOUD_OWNER_ID,
			payload: {
				channelId: thread.channelId,
				messageId: 'wamid-founder-reply',
				internalMessageId: crypto.randomUUID(),
				remoteId: thread.contactRef.externalId,
				senderId: thread.contactRef.externalId,
				fromMe: true,
				// The founder answered from his own phone — HUMAN is the hand, and `fromMe` alone stops
				// separating it from the product's own replies once this product can send.
				author: MessageAuthor.HUMAN,
				isGroup: false,
				timestamp: Math.floor(Date.now() / 1000),
				occurredAt: new Date(),
				observedAt: new Date(),
				messageType: MessageType.TEXT,
				content: { text: 'depois', contextInfo: { stanzaId: quotedPlatformId } },
				platform: ChannelKind.WHATSAPP,
				ownerId: MOCK_CLOUD_OWNER_ID,
			},
		})

	/**
	 * The turn that was (or was not) queued. What this suite reads off it is `quoted.speaker`: the reply
	 * carried no tag, so the ONLY thing that can have opened the gate is `repliesToAgent`, and a quote
	 * attributed to `you` is that verdict crossing out of the context. No item at all means the gate
	 * refused the message, which is the bug.
	 */
	const queuedTurn = async () => {
		const item = await testBed.resolve(MailboxRepository).claimNext('deliver-cycle-test', 60_000)
		return {
			targetId: item?.targetId,
			payload: item?.payload as { text: string; quoted?: { speaker: string; at: Date; text: string } } | undefined,
		}
	}

	it('FALSEADOR — plain send: the sent message resolves to its entry, and a reply to it invokes with no `@`', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		testBed.override(ChannelSender, new MockChannelSender())
		const ledger = testBed.resolve(ConsumedMessageRepository)

		const agentLine = await givenAgentReply(thread)
		await deliver(thread, agentLine.entryId)

		// 1. THE LINK — what was missing. The id the platform assigned now names the entry it IS, which is
		// the direction `findEntry` is asked in when a quote arrives. Drop the link and this is undefined.
		expect(await ledger.findEntry(thread.channelId, 'mock-wamid-1')).toEqual({
			threadId: thread.id.value,
			entryId: agentLine.entryId,
		})

		// 2. The founder replies to it, citing nothing.
		await testBed.resolve(ConsumeInboundMessage).handle(replyQuoting(thread, 'mock-wamid-1') as never)

		// 3. The column the founder measured EMPTY in the live database is filled.
		const entries = await testBed.resolve(ThreadRepository).recentEntries(thread.id.value, 10)
		expect(entries.find(e => e.text === 'depois')?.quotedEntryId).toBe(agentLine.entryId)

		// 4. AND THE AGENT WAS ACTUALLY SUMMONED — the reply carried no tag, so the only thing that can
		// have opened the gate is `repliesToAgent`, and a quote attributed to `you` is that same verdict
		// crossing out of the context. This is the assertion that fails today.
		const { targetId, payload } = await queuedTurn()
		expect(targetId).toBe(thread.id.value)
		expect(payload?.text).toBe('depois')
		expect(payload?.quoted).toMatchObject({ speaker: 'you', text: AGENT_LINE })
	})

	/**
	 * THE STREAMED REPLY, which reaches the channel by a different verb and must not be a second bug.
	 *
	 * When a stream is in flight the delivery leg does not SEND — it EDITS the message the streamer
	 * already opened, completing it with the canonical text. So the id that has to be linked was minted
	 * by the FIRST CUT, one use case away, and a link written only on the send path leaves every streamed
	 * reply — which is every reply long enough to stream, i.e. most of them — exactly as broken as before.
	 *
	 * The first cut's post-condition is reproduced through the two seams `StreamChannelReply.openMessage`
	 * itself writes — `ChannelSender.send`, `ReplyStreamer.opened`, and the ledger `claim` — rather than
	 * by running that use case. Nothing here is a stand-in: the message really is on the mock channel and
	 * the ledger row really is claimed-but-unlinked, which is the state the row is in on a live stream.
	 */
	it('FALSEADOR — streamed reply: the message COMPLETED by edit resolves to its entry, and a reply to it invokes with no `@`', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const sender = new MockChannelSender()
		testBed.override(ChannelSender, sender)
		const ledger = testBed.resolve(ConsumedMessageRepository)
		const streams = testBed.resolve(ReplyStreamer)

		const agentLine = await givenAgentReply(thread)

		// The first cut already went out: a message on the channel, a stream growing it, its echo claimed.
		const firstCut = 'rodo a migration'
		const { messageId } = await sender.send(
			{ channelId: thread.channelId, remoteId: thread.contactRef.externalId, text: firstCut },
			MOCK_CLOUD_OWNER_ID,
		)
		streams.opened(streamKey(thread.channelId, thread.contactRef.externalId), {
			ownerId: MOCK_CLOUD_OWNER_ID,
			messageId,
			sentAtEpochMs: Date.now(),
			sequence: 1,
			baseOffset: 0,
			deliveredLength: firstCut.length,
		})
		await ledger.claim({ ownerId: MOCK_CLOUD_OWNER_ID, channelId: thread.channelId, platformMessageId: messageId })
		// Claimed but UNLINKED — the row exists, so the link cannot be an insert. It has to be an update.
		expect(await ledger.has(thread.channelId, messageId)).toBe(true)
		expect(await ledger.findEntry(thread.channelId, messageId)).toBeUndefined()

		await deliver(thread, agentLine.entryId)

		// The turn ended by COMPLETING the streamed message, not by sending a second one.
		expect(sender.edits).toHaveLength(1)
		expect(sender.sent).toHaveLength(1)
		expect(await ledger.findEntry(thread.channelId, messageId)).toEqual({
			threadId: thread.id.value,
			entryId: agentLine.entryId,
		})

		// And the same cycle closes on the streamed id: a reply to the balloon the contact watched grow
		// summons the agent with no citation.
		await testBed.resolve(ConsumeInboundMessage).handle(replyQuoting(thread, messageId) as never)

		const entries = await testBed.resolve(ThreadRepository).recentEntries(thread.id.value, 10)
		expect(entries.find(e => e.text === 'depois')?.quotedEntryId).toBe(agentLine.entryId)

		const { targetId, payload } = await queuedTurn()
		expect(targetId).toBe(thread.id.value)
		expect(payload?.quoted).toMatchObject({ speaker: 'you', text: AGENT_LINE })
	})
})

/**
 * THE CITATION THAT NEVER LEFT THE BUILDING (founder, 31-jul).
 *
 * The ask, in the founder's words: "ao finalizar uma tarefa, deve responder a mensagem que a criou pra
 * indicar finalização". Everything upstream was built for it — `RunOrchestratorTurn` imposes the anchor
 * (`replyToEntryId = originEntryId`, the mandatory half of D6), `RecordOrchestratorReply` resolves it
 * through the ledger into a platform id, the command row carries it, and `GatewayChannelSender` forwards
 * it to the gateway. And `DeliverChannelMessage` dropped it on the floor: it destructured `text` and
 * never passed `quotedMessageId` to `sender.send`. The contact saw an unquoted message.
 *
 * IT SURVIVED BECAUSE OF WHERE THE TESTS LOOKED. Two of them are literally named "no quote ON THE WIRE"
 * and "travels as the platform id THE GATEWAY QUOTES", and both assert on `command.input` — the durable
 * row, one hop short of the wire. The chain was measured up to the row and declared finished. So these
 * cases assert on what the SENDER RECEIVES, which is the only surface that corresponds to what the
 * contact actually sees.
 */
describe('DeliverChannelMessage — the citation reaches the wire, which is the only place the contact can see it', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let db: LibSqlTransaction

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		db = testBed.resolve(LibSqlDatabaseDriver).db
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	/** The operator's message that asked for the work — a real entry, LINKED in the ledger like a real inbound. */
	const givenOriginMessage = async (thread: Thread, platformMessageId: string) => {
		const entry = thread.recordEntry({
			kind: TranscriptKind.CONTACT,
			text: 'arruma o cupom por favor',
			senderExternalId: thread.contactRef.externalId,
		})
		await testBed.resolve(ThreadRepository).save(thread)
		const ledger = testBed.resolve(ConsumedMessageRepository)
		await ledger.claim({ ownerId: MOCK_CLOUD_OWNER_ID, channelId: thread.channelId, platformMessageId })
		await ledger.linkEntry({ channelId: thread.channelId, platformMessageId, threadId: thread.id.value, entryId: entry.entryId })
		return entry
	}

	/** The delivery order exactly as `RecordOrchestratorReply` wrote it — never hand-built. */
	const enqueuedDelivery = async () => (await db.select().from(scheduledCommands))[0]?.input

	it('FALSEADOR — a finished task QUOTES the message that created it, all the way to the sender', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const sender = new MockChannelSender()
		testBed.override(ChannelSender, sender)

		const origin = await givenOriginMessage(thread, 'wamid-asked')

		// The whole chain the founder asked for, driven end to end: the orchestrator's reply anchors on the
		// message that created the task, and the delivery order is the one the use case actually enqueued.
		await testBed
			.resolve(RecordOrchestratorReply)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, text: 'terminei, subiu', replyToEntryId: origin.entryId })

		await testBed.resolve(DeliverChannelMessage).execute((await enqueuedDelivery()) as never)

		// ON THE WIRE — not on the command row, which is where the previous tests stopped and is exactly
		// how this shipped broken. Remove the pass-through and this is `undefined`.
		expect(sender.sent).toHaveLength(1)
		expect(sender.sent[0]).toMatchObject({
			channelId: thread.channelId,
			remoteId: thread.contactRef.externalId,
			text: 'terminei, subiu',
			quotedMessageId: 'wamid-asked',
		})
	})

	/**
	 * THE REAL DEGRADATION, and it is not hypothetical: an entry from before the thread was attached has
	 * no ledger row, so `findPlatformId` answers undefined and the order carries no quote. The send must
	 * go out UNQUOTED rather than fail — an unquoted answer is worth far more than a silence, and the
	 * conditional spread in `GatewayChannelSender` is what keeps the field off the wire entirely.
	 */
	it('a citation that cannot be resolved sends WITHOUT a quote, and does not fail', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const sender = new MockChannelSender()
		testBed.override(ChannelSender, sender)

		await testBed.resolve(RecordOrchestratorReply).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			text: 'resolvido',
			// Names an entry that exists nowhere — the shape of a message predating the attach.
			replyToEntryId: '019e4d24-6524-7041-9e1c-8108180cddff',
		})

		await testBed.resolve(DeliverChannelMessage).execute((await enqueuedDelivery()) as never)

		expect(sender.sent).toHaveLength(1)
		expect(sender.sent[0]?.text).toBe('resolvido')
		expect(sender.sent[0]?.quotedMessageId).toBeUndefined()
	})

	/**
	 * THE CONTINUATION STILL DOES NOT CITE — same verdict, DIFFERENT REASON, and the reason was rewritten
	 * on purpose rather than left standing.
	 *
	 * The original argument was "consistency with a first balloon that never cites". That premise is now
	 * FALSE: `StreamChannelReply` carries `replyToEntryId` and quotes the message it opens, so the head
	 * balloon of a streamed reply does cite. A decision resting on a premise that has been deleted has to
	 * be re-made, not inherited.
	 *
	 * Re-made, it lands in the same place on a stronger footing: a citation anchors an UTTERANCE, and
	 * this utterance is ALREADY anchored by the balloon above it. Repeating the quote would staple the
	 * same bubble to two consecutive messages, which reads as two separate replies to one question rather
	 * than one answer that ran past a platform limit. Quem cita é a mensagem, uma vez.
	 *
	 * The old secondary argument survives untouched and still matters: quoting here would make the
	 * citation's presence depend on whether the 14-minute window happened to expire mid-reply.
	 */
	it('the continuation of a streamed reply sends UNQUOTED — the head balloon already carried the citation', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const sender = new MockChannelSender()
		testBed.override(ChannelSender, sender)
		const streams = testBed.resolve(ReplyStreamer)

		const origin = await givenOriginMessage(thread, 'wamid-asked')

		// A stream whose message is older than the edit window: the final text CONTINUES in a new message.
		// The head carries the citation, because that is what `StreamChannelReply` now puts on the balloon
		// that OPENS a reply — the fixture mirrors the real opening send rather than an obsolete one.
		const head = 'terminei, '
		const { messageId } = await sender.send(
			{ channelId: thread.channelId, remoteId: thread.contactRef.externalId, text: head, quotedMessageId: 'wamid-asked' },
			MOCK_CLOUD_OWNER_ID,
		)
		streams.opened(streamKey(thread.channelId, thread.contactRef.externalId), {
			ownerId: MOCK_CLOUD_OWNER_ID,
			messageId,
			sentAtEpochMs: Date.now() - EDIT_WINDOW_MS - 1_000,
			sequence: 1,
			baseOffset: 0,
			deliveredLength: head.length,
		})

		await testBed
			.resolve(RecordOrchestratorReply)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, text: `${head}subiu`, replyToEntryId: origin.entryId })
		await testBed.resolve(DeliverChannelMessage).execute((await enqueuedDelivery()) as never)

		// The tail went out as its own message, carrying only what the expired one does not show...
		expect(sender.sent).toHaveLength(2)
		expect(sender.sent[1]?.text).toBe('subiu')
		// ...and the citation sits on the HEAD and nowhere else: one utterance, quoted once.
		expect(sender.sent[0]?.quotedMessageId).toBe('wamid-asked')
		expect(sender.sent[1]?.quotedMessageId).toBeUndefined()
		expect(sender.edits).toHaveLength(0)
	})
})
