import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { CommandQueue, LibSqlDatabaseDriver, MockLoggingService, LibSqlCommandQueue } from '@codm/core-typescript'
import { TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { DeliverChannelMessage } from './DeliverChannelMessage'
import { RecordOrchestratorReply } from './RecordOrchestratorReply'
import { StreamChannelReply } from './StreamChannelReply'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'
import { ChannelSender, MockChannelSender } from '../services/ChannelSender'
import { ReplyStreamer, EDIT_WINDOW_MS } from '../services/ReplyStreamer'

/**
 * THE STREAMED REPLY — the answer lands in ~1-2s and GROWS, instead of the contact watching silence
 * for the whole generation (streaming spec, decisions 1-9).
 *
 * The properties on trial are the ways streaming could be WORSE than no streaming at all:
 *
 *  AC-1 — the first cut SENDS, and the id it returns is what every later edit addresses.
 *  AC-3 — the text the channel ends up showing is IDENTICAL to the transcript entry. Streaming that
 *         quietly diverges from the conversation is worse than no streaming: the operator's record
 *         and the contact's screen would disagree with nobody able to tell which is right.
 *  AC-4 — a cut that arrives late is DISCARDED. Without it the text SHRINKS on someone's screen.
 *  AC-5 — losing intermediate cuts changes NOTHING about the final state (self-correction).
 *  AC-6 — a channel that cannot edit behaves exactly as it does today: one message, at the end.
 *  AC-7 — the transcript gains ONE entry, whatever the streaming did.
 *
 * Cadence (AC-2) is NOT asserted here: it is a pure function with a controlled clock, and it lives in
 * `objects/ReplyCutPolicy.test.ts`. Asserting timing through the queue would need real sleeps.
 */
describe('the streamed reply — it starts early, it grows, and it never regresses', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let driver: LibSqlDatabaseDriver
	let queue: LibSqlCommandQueue
	let sender: MockChannelSender
	let streamer: ReplyStreamer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		driver = testBed.resolve(LibSqlDatabaseDriver)
	})

	beforeEach(async () => {
		await testBed.reset()

		// ORDER MATTERS — the same trap the cues suite documents: a Handler captures its collaborators at
		// RESOLVE time, so every binding has to be in place before anything is resolved. `ReplyStreamer`
		// injects the queue to enqueue cuts, so it must be resolved AFTER the queue override or the turn
		// would enqueue into a queue this suite never ticks.
		sender = new MockChannelSender()
		testBed.override(ChannelSender, sender)

		queue = new LibSqlCommandQueue(driver, new MockLoggingService())
		testBed.override(CommandQueue, queue)

		streamer = testBed.resolve(ReplyStreamer)

		await queue.registerCommandHandler(testBed.resolve(StreamChannelReply))
		await queue.registerCommandHandler(testBed.resolve(DeliverChannelMessage))
		queue.stopPolling() // deterministic: this suite calls tick() itself
	})

	afterEach(async () => {
		await queue.close()
	})

	afterAll(async () => {
		await testBed.destroy()
	})

	const FIRST = 'Vou olhar o log de deploy.'
	const GROWN = 'Vou olhar o log de deploy. Achei: o build quebrou no lint.'
	const FINAL = 'Vou olhar o log de deploy. Achei: o build quebrou no lint. Já subi o fix.'

	/** A thread plus the two coordinates every channel write is scoped by. */
	const givenConversation = async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		return { thread, channelId: thread.channelId, remoteId: thread.contactRef.externalId }
	}

	/** Run one cut straight through the executor — the precise control AC-4 and AC-5 need. */
	const cut = (channelId: string, remoteId: string, text: string, sequence: number) =>
		testBed.resolve(StreamChannelReply).execute({ ownerId: MOCK_CLOUD_OWNER_ID, channelId, remoteId, text, sequence })

	/** The real terminal leg: transcript entry + the delivery command, exactly as the turn's event drives it. */
	const finishReply = async (threadId: string, text: string) => {
		await testBed.resolve(RecordOrchestratorReply).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId, text })
		await queue.tick()
	}

	const systemEntries = async (threadId: string) =>
		(await testBed.resolve(ThreadRepository).listEntries(threadId)).filter(e => e.kind === TranscriptKind.SYSTEM)

	// ─────────────────────────────────────────────────────────────────────────────
	// AC-1 — the first cut is a SEND, and it is what every edit afterwards addresses
	// ─────────────────────────────────────────────────────────────────────────────

	describe('AC-1: the first cut sends, and its messageId is the target of every edit', () => {
		it('cut 1 sends; cuts 2 and 3 edit THAT message and never send another', async () => {
			const { channelId, remoteId } = await givenConversation()

			await cut(channelId, remoteId, FIRST, 1)
			expect(sender.sent).toHaveLength(1)
			expect(sender.sent[0]).toMatchObject({ channelId, remoteId, text: FIRST, ownerId: MOCK_CLOUD_OWNER_ID })
			const messageId = 'mock-wamid-1'

			await cut(channelId, remoteId, GROWN, 2)
			await cut(channelId, remoteId, FINAL, 3)

			// ONE balloon in the conversation, grown twice — not three messages.
			expect(sender.sent).toHaveLength(1)
			expect(sender.edits.map(e => e.messageId)).toEqual([messageId, messageId])
			expect(sender.screen()).toEqual([FINAL])
		})

		it('the streamed send is CLAIMED, so its own echo cannot wake the agent again', async () => {
			const { channelId, remoteId } = await givenConversation()

			await cut(channelId, remoteId, FIRST, 1)

			// The same exactly-once ledger `ConsumeInboundMessage` consults FIRST. Without this claim, the
			// echo of a half-written reply arrives as inbound speech WHILE the turn is still generating —
			// and the agent answers itself. The window is wider here than for a plain delivery, because the
			// streamed message exists for the whole rest of the generation.
			expect(await testBed.resolve(ConsumedMessageRepository).has(channelId, 'mock-wamid-1')).toBe(true)
		})

		it('cuts scheduled by the turn ride the queue as durable rows, one per cut', async () => {
			const { channelId, remoteId } = await givenConversation()
			const handle = streamer.begin({ ownerId: MOCK_CLOUD_OWNER_ID, channelId, remoteId })

			await handle.cut(FIRST)
			await handle.cut(GROWN)

			// TWO rows, not one. A stable jobId would have made the second cut a silent no-op (the queue
			// dedups with ON CONFLICT DO NOTHING) and the contact would keep reading the older text.
			// Counted through the probe — this suite never needs a row's COLUMNS, only how many exist.
			expect(await testBed.probe().count('scheduledCommands', { name: 'stream_channel_reply' })).toBe(2)

			await queue.tick()
			expect(sender.sent).toHaveLength(1)
			expect(sender.screen()).toEqual([GROWN])
		})
	})

	// ─────────────────────────────────────────────────────────────────────────────
	// AC-4 — order is a guarantee, not a hope
	// ─────────────────────────────────────────────────────────────────────────────

	describe('AC-4: a late cut is DISCARDED — the text never regresses', () => {
		/**
		 * THE FALSEADOR'S TARGET (AC-8a). The scenario is the CommandQueue's own retry: cut 2's gateway
		 * call failed, it backed off ~1s, and by the time it re-executes cut 3 has already landed.
		 *
		 * Let the guard through and the contact watches the answer UN-WRITE itself back to a sentence it
		 * had already moved past — with tsc green, no error anywhere and the command marked successful.
		 */
		it('a cut re-executed after a newer one leaves the newer text standing', async () => {
			const { channelId, remoteId } = await givenConversation()

			await cut(channelId, remoteId, FIRST, 1)
			await cut(channelId, remoteId, FINAL, 3)
			expect(sender.screen()).toEqual([FINAL])

			// The straggler, carrying strictly less text than what is already on screen.
			await cut(channelId, remoteId, GROWN, 2)

			expect(sender.screen()).toEqual([FINAL])
			// Not merely "ends up right" — the stale edit is never handed to the channel at all.
			expect(sender.edits).toHaveLength(1)
		})

		it('a cut re-executed with the sequence that already landed is dropped too', async () => {
			const { channelId, remoteId } = await givenConversation()

			await cut(channelId, remoteId, FIRST, 1)
			await cut(channelId, remoteId, GROWN, 2)
			expect(sender.edits).toHaveLength(1)

			// Same sequence, re-delivered (at-least-once is the queue's contract).
			await cut(channelId, remoteId, GROWN, 2)
			expect(sender.edits).toHaveLength(1)
			expect(sender.screen()).toEqual([GROWN])
		})

		it('a cut arriving AFTER the reply was finalised cannot re-open it', async () => {
			const { thread, channelId, remoteId } = await givenConversation()

			await cut(channelId, remoteId, FIRST, 1)
			await finishReply(thread.id.value, FINAL)
			expect(sender.screen()).toEqual([FINAL])

			// A straggler after the end. The stream is CLOSED, not deleted — deleting it would make this
			// cut find nothing and open a SECOND message, re-saying the answer.
			await cut(channelId, remoteId, GROWN, 9)

			expect(sender.sent).toHaveLength(1)
			expect(sender.screen()).toEqual([FINAL])
		})
	})

	// ─────────────────────────────────────────────────────────────────────────────
	// AC-3 + AC-5 + AC-7 — the end state is canonical, whatever happened on the way
	// ─────────────────────────────────────────────────────────────────────────────

	describe('AC-3/AC-5/AC-7: the final state is the transcript, and it survives losing everything in between', () => {
		it('the text the channel shows is IDENTICAL to the transcript entry', async () => {
			const { thread, channelId, remoteId } = await givenConversation()

			await cut(channelId, remoteId, FIRST, 1)
			await cut(channelId, remoteId, GROWN, 2)
			await finishReply(thread.id.value, FINAL)

			const entries = await systemEntries(thread.id.value)
			expect(entries).toHaveLength(1)
			// THE ASSERTION THAT KEEPS STREAMING HONEST: one string, compared against the conversation's
			// own record rather than against another copy of what the test just sent.
			expect(sender.screen()).toEqual([entries[0]!.text])
			expect(sender.screen()).toEqual([FINAL])
		})

		/**
		 * THE FALSEADOR'S TARGET (AC-8b). Every intermediate cut is lost — the gateway was down, the rows
		 * dead-lettered, whatever. Only the FIRST send and the FINAL edit happen.
		 *
		 * The reply is still complete, and that is the whole of decision 7: the mechanism is
		 * self-correcting because the last edit carries the canonical text rather than a delta. Make the
		 * final leg trust what the stream already delivered and this goes red, showing the contact a reply
		 * that stops mid-thought.
		 */
		it('losing every intermediate cut does not change the final state', async () => {
			const { thread, channelId, remoteId } = await givenConversation()

			await cut(channelId, remoteId, FIRST, 1)
			// cuts 2..8 never arrive.
			await finishReply(thread.id.value, FINAL)

			expect(sender.sent).toHaveLength(1)
			expect(sender.screen()).toEqual([FINAL])
			expect(await systemEntries(thread.id.value)).toHaveLength(1)
		})

		it('a reply nobody streamed is delivered exactly as it is today — one send, no edit', async () => {
			const { thread } = await givenConversation()

			await finishReply(thread.id.value, FINAL)

			expect(sender.sent).toHaveLength(1)
			expect(sender.sent[0]?.text).toBe(FINAL)
			expect(sender.edits).toHaveLength(0)
		})
	})

	// ─────────────────────────────────────────────────────────────────────────────
	// AC-6 — a channel that cannot edit loses nothing
	// ─────────────────────────────────────────────────────────────────────────────

	describe('AC-6: a channel without edit capability keeps exactly today behaviour', () => {
		/**
		 * THE FALSEADOR'S TARGET (AC-8d). Remove the capability check in `StreamChannelReply` and the
		 * first cut lands as a real message carrying HALF A SENTENCE — which nothing can then complete,
		 * because the only verb that could is the one this channel does not have.
		 */
		it('no stream is ever opened, and the answer arrives once, whole, at the end', async () => {
			const { thread, channelId, remoteId } = await givenConversation()
			sender.capabilities = { edit: false, media: true }

			await cut(channelId, remoteId, FIRST, 1)
			await cut(channelId, remoteId, GROWN, 2)

			// NOTHING went out while the answer was being written — no partial message to strand.
			expect(sender.sent).toHaveLength(0)
			expect(sender.edits).toHaveLength(0)

			await finishReply(thread.id.value, FINAL)

			expect(sender.sent).toHaveLength(1)
			expect(sender.sent[0]?.text).toBe(FINAL)
			expect(sender.edits).toHaveLength(0)
			expect(await systemEntries(thread.id.value)).toHaveLength(1)
		})

		it('and it never raises — a missing capability is a degradation, not an error', async () => {
			const { channelId, remoteId } = await givenConversation()
			sender.capabilities = { edit: false, media: true }

			expect(await cut(channelId, remoteId, FIRST, 1)).toBeUndefined()
		})
	})

	// ─────────────────────────────────────────────────────────────────────────────
	// Decision 4 — the 15-minute window closes mid-reply
	// ─────────────────────────────────────────────────────────────────────────────

	describe('the edit window closing mid-reply continues in a NEW message', () => {
		/**
		 * Cross the ~15-minute boundary in a millisecond.
		 *
		 * The streamer reads the instant it is HANDED (`claimCut`/`claimFinal` both take `nowMs`), so the
		 * only thing a test has to move is the clock the caller reads — no private state is touched and no
		 * suite waits fourteen minutes.
		 */
		const afterTheWindow = async <T>(fn: () => Promise<T>): Promise<T> => {
			const realNow = Date.now
			Date.now = () => realNow() + EDIT_WINDOW_MS + 1_000
			try {
				return await fn()
			} finally {
				Date.now = realNow
			}
		}

		it('the remainder goes out as a continuation, and the two balloons concatenate to the whole reply', async () => {
			const { thread, channelId, remoteId } = await givenConversation()

			await cut(channelId, remoteId, FIRST, 1)
			expect(sender.screen()).toEqual([FIRST])

			await afterTheWindow(() => finishReply(thread.id.value, FINAL))

			// TWO balloons, and NOTHING repeated between them.
			expect(sender.sent).toHaveLength(2)
			expect(sender.sent[1]?.text).toBe(FINAL.slice(FIRST.length))
			// THE PROPERTY THAT MATTERS: read end to end, the conversation still says exactly the reply —
			// no word lost to the expired window, none said twice.
			expect(sender.screen().join('')).toBe(FINAL)

			// And the transcript is still ONE entry — the window is a delivery detail, not a domain fact.
			const entries = await systemEntries(thread.id.value)
			expect(entries).toHaveLength(1)
			expect(entries[0]?.text).toBe(FINAL)
		})

		it('a cut taken after the window opens the continuation too, and the stream keeps growing there', async () => {
			const { channelId, remoteId } = await givenConversation()

			await cut(channelId, remoteId, FIRST, 1)
			await afterTheWindow(() => cut(channelId, remoteId, FINAL, 2))

			expect(sender.sent).toHaveLength(2)
			expect(sender.sent[1]?.text).toBe(FINAL.slice(FIRST.length))
			expect(sender.screen().join('')).toBe(FINAL)
		})
	})
	// ─────────────────────────────────────────────────────────────────────────────
	// THE CITATION — it rides the FIRST cut, because that is the message that exists
	// ─────────────────────────────────────────────────────────────────────────────

	/**
	 * "AO FINALIZAR UMA TAREFA, DEVE RESPONDER A MENSAGEM QUE A CRIOU" (founder), for the case that is
	 * actually the common one.
	 *
	 * The plain delivery already quotes. A STREAMED reply could not, and streaming is not an edge case:
	 * `RunOrchestratorTurn` opens a stream on EVERY turn, so in practice no finished task was arriving
	 * with a citation at all. It cannot be retrofitted at the end either — `ChannelSender.edit` takes
	 * `{channelId, remoteId, messageId, text}` and the gateway's `PUT /messages/edit` has no quote field,
	 * so a message that went out unquoted stays unquoted forever.
	 *
	 * So the citation travels with the OPENING send: the turn hands the anchor to `ReplyStreamer.begin`,
	 * every cut carries it on its durable row, and the cut that actually opens the message resolves it
	 * through the ledger and puts it on the wire. Later cuts only edit, and an edit needs no quote —
	 * quem cita é a mensagem, uma vez.
	 */
	describe('the citation rides the first cut', () => {
		/** The operator's message that asked for the work — a real entry, LINKED like a real inbound. */
		const givenOriginMessage = async (thread: Awaited<ReturnType<typeof givenThread>>, platformMessageId: string) => {
			const entry = thread.recordEntry({
				kind: TranscriptKind.CONTACT,
				text: 'arruma o cupom por favor',
				senderExternalId: thread.contactRef.externalId,
			})
			await testBed.resolve(ThreadRepository).save(thread)
			const ledger = testBed.resolve(ConsumedMessageRepository)
			await ledger.claim({ ownerId: MOCK_CLOUD_OWNER_ID, channelId: thread.channelId, platformMessageId })
			await ledger.linkEntry({
				channelId: thread.channelId,
				platformMessageId,
				threadId: thread.id.value,
				entryId: entry.entryId,
			})
			return entry
		}

		/** Same clock trick the window suite uses — cross ~15 minutes in a millisecond. */
		const afterTheWindow = async <T>(fn: () => Promise<T>): Promise<T> => {
			const realNow = Date.now
			Date.now = () => realNow() + EDIT_WINDOW_MS + 1_000
			try {
				return await fn()
			} finally {
				Date.now = realNow
			}
		}

		it('FALSEADOR — the opening send carries the quote ON THE WIRE, driven from the turn seam', async () => {
			const { thread, channelId, remoteId } = await givenConversation()
			await givenOriginMessage(thread, 'wamid-asked')
			const origin = (await testBed.resolve(ThreadRepository).listEntries(thread.id.value))[0]

			// The turn's own entry point, anchored the way `RunOrchestratorTurn` anchors an ISSUE_RESULT.
			const handle = streamer.begin({ ownerId: MOCK_CLOUD_OWNER_ID, channelId, remoteId, replyToEntryId: origin?.entryId })
			await handle.cut(FIRST)
			await queue.tick()

			// ON THE WIRE — what the SENDER received, never the command row. That distinction is what let
			// this ship broken twice. Remove the pass-through and this is `undefined`.
			expect(sender.sent).toHaveLength(1)
			expect(sender.sent[0]).toMatchObject({ channelId, remoteId, text: FIRST, quotedMessageId: 'wamid-asked' })
		})

		it('the cuts that follow EDIT and never re-cite — one utterance cites once', async () => {
			const { thread, channelId, remoteId } = await givenConversation()
			await givenOriginMessage(thread, 'wamid-asked')
			const origin = (await testBed.resolve(ThreadRepository).listEntries(thread.id.value))[0]

			const handle = streamer.begin({ ownerId: MOCK_CLOUD_OWNER_ID, channelId, remoteId, replyToEntryId: origin?.entryId })
			await handle.cut(FIRST)
			await handle.cut(GROWN)
			await handle.cut(FINAL)
			await queue.tick()

			// ONE balloon, quoted once, grown by edits that carry no citation of their own.
			expect(sender.sent).toHaveLength(1)
			expect(sender.sent[0]?.quotedMessageId).toBe('wamid-asked')
			expect(sender.edits.length).toBeGreaterThan(0)
			expect(sender.screen()).toEqual([FINAL])
		})

		/**
		 * THE CONTINUATION DOES NOT RE-CITE, and the reason CHANGED with this commit.
		 *
		 * It used to be "consistency with a first balloon that never cites". That premise is gone — the
		 * first balloon cites now. The rule that replaces it is stronger and survives the change: a
		 * citation anchors an UTTERANCE, and the utterance is already anchored by the balloon above. The
		 * contact would otherwise see the same quoted bubble stapled to two consecutive messages, which
		 * reads as two separate replies to one question rather than one answer that ran past a limit.
		 */
		it('a continuation opened after the window does NOT re-cite — the head balloon already did', async () => {
			const { thread, channelId, remoteId } = await givenConversation()
			await givenOriginMessage(thread, 'wamid-asked')
			const origin = (await testBed.resolve(ThreadRepository).listEntries(thread.id.value))[0]

			const handle = streamer.begin({ ownerId: MOCK_CLOUD_OWNER_ID, channelId, remoteId, replyToEntryId: origin?.entryId })
			await handle.cut(FIRST)
			await queue.tick()
			await afterTheWindow(async () => {
				await handle.cut(FINAL)
				await queue.tick()
			})

			expect(sender.sent).toHaveLength(2)
			expect(sender.sent[0]?.quotedMessageId).toBe('wamid-asked')
			expect(sender.sent[1]?.text).toBe(FINAL.slice(FIRST.length))
			expect(sender.sent[1]?.quotedMessageId).toBeUndefined()
			expect(sender.screen().join('')).toBe(FINAL)
		})

		it('an anchor that cannot be resolved opens the stream UNQUOTED, and does not fail', async () => {
			const { channelId, remoteId } = await givenConversation()

			// Names an entry that reached no ledger row — a message from before the thread was attached.
			const handle = streamer.begin({
				ownerId: MOCK_CLOUD_OWNER_ID,
				channelId,
				remoteId,
				replyToEntryId: '019e4d24-6524-7041-9e1c-8108180cddff',
			})
			await handle.cut(FIRST)
			await queue.tick()

			expect(sender.sent).toHaveLength(1)
			expect(sender.sent[0]?.text).toBe(FIRST)
			expect(sender.sent[0]?.quotedMessageId).toBeUndefined()
		})

		it('a stream with no anchor at all is unchanged — conversation replies open unquoted', async () => {
			const { channelId, remoteId } = await givenConversation()

			const handle = streamer.begin({ ownerId: MOCK_CLOUD_OWNER_ID, channelId, remoteId })
			await handle.cut(FIRST)
			await queue.tick()

			expect(sender.sent).toHaveLength(1)
			expect(sender.sent[0]?.quotedMessageId).toBeUndefined()
		})
	})
})
