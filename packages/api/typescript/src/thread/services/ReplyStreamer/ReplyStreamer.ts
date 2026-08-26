import { injectable } from 'tsyringe-neo'
import { CommandQueue, LoggingService, tryCatchAsync } from '@codm/core-typescript'
import type { StreamChannelReply } from '../../usecases/StreamChannelReply'

/**
 * How long WhatsApp lets this account edit a message it sent. Conservative on purpose: the platform's
 * own limit is around 15 minutes, and being a minute early costs one extra balloon while being a
 * minute late costs a FAILED command and a reply that stops growing where it stood.
 */
export const EDIT_WINDOW_MS = 14 * 60 * 1000

/** How many conversations keep stream state at once — bounded like `AgentStreamRegistry`'s replay buffer. */
const MAX_TRACKED_STREAMS = 200

/**
 * The delivery-side handle of ONE conversation's streamed reply.
 *
 * `channelId` + `remoteId` and nothing else — DERIVED, exactly like `typingBeatJobId`, and for the
 * same reason: it lets `DeliverChannelMessage` find and finish a stream it never started and was never
 * told about. Threading a stream id through `OrchestratorRepliedEvent` would have been a CONTRACT
 * change (the event is bridged to `integration.orchestrator.replied`), which decision 9 asks us to
 * avoid where possible. Deriving the key avoids it entirely.
 */
export const streamKey = (channelId: string, remoteId: string): string => `${channelId}:${remoteId}`

interface LiveStream {
	ownerId: string
	/** The platform message currently being grown. */
	messageId: string
	/** When THAT message was sent — the clock the edit window is measured against. */
	sentAtEpochMs: number
	/** Where the CURRENT message starts inside the whole reply — 0 until a window forces a continuation. */
	baseOffset: number
	/**
	 * How much of the whole reply is on screen RIGHT NOW, across every message of this stream.
	 *
	 * Distinct from `baseOffset`, and the distinction is what keeps a continuation from repeating the
	 * answer: `baseOffset` says where the live balloon BEGAN, this says where it currently ENDS. A
	 * continuation must start here — starting at `baseOffset` would re-say everything the expired
	 * message is still showing.
	 */
	deliveredLength: number
	/** The highest sequence applied so far — the guard's entire memory (decision 6). */
	lastAppliedSequence: number
	/**
	 * Set once the FINAL text has been applied. A closed stream is kept, not deleted: a straggler cut
	 * that found nothing here would open a SECOND message and re-say the answer.
	 */
	closed: boolean
}

/** What a cut should do when it reaches the channel. */
export type CutVerdict =
	| { action: 'DISCARD' }
	| { action: 'SEND' }
	| { action: 'EDIT'; messageId: string; baseOffset: number }
	| { action: 'CONTINUE'; baseOffset: number }

/** What the FINAL text should do — the same vocabulary minus `SEND`, which only a first cut can be. */
export type FinalVerdict =
	| { action: 'NONE' }
	| { action: 'EDIT'; messageId: string; baseOffset: number }
	| { action: 'CONTINUE'; baseOffset: number }

/** The turn's view of one streamed reply: mint a sequence, enqueue a cut, never think about the channel. */
export interface ReplyStreamHandle {
	/** Hand the accumulated text to the channel. Best-effort — a stream that cannot be scheduled is not a failed turn. */
	cut(text: string): Promise<void>
}

/**
 * The delivery-layer owner of a streamed reply (streaming spec, decisions 3, 6, 7 and 8).
 *
 * ### Why the state is PROCESS-LOCAL, said out loud
 * A stream lives for the duration of ONE turn — seconds to a minute — and a turn is not resumable: if
 * the daemon dies mid-generation, the turn itself is lost and re-run from scratch, producing a NEW
 * message. So durable stream state would buy nothing that the re-run does not already redo, at the
 * price of a table, a migration and a Go-side regeneration. The precedent is `AgentStreamRegistry`,
 * which is process-local for the same reason and carries the same TODO(scale).
 *
 * The failure mode the SEQUENCE guard actually defends against is therefore not a crash — it is the
 * CommandQueue's own retry: a cut whose gateway call failed backs off ~1s and re-executes AFTER later
 * cuts have already landed. That reordering happens inside one process, which is exactly where this
 * map can see it.
 *
 * TODO(scale): shard by conversation before running more than one daemon per owner.
 *
 * ### The three properties this class exists to hold
 *   1. ORDER (decision 6). Every cut carries a monotonic sequence; one that arrives with a sequence
 *      not greater than the last applied is DISCARDED, never applied. Without it a retried early cut
 *      overwrites a later one and the text SHRINKS on the contact's screen — the one failure the spec
 *      calls out by name.
 *   2. SELF-CORRECTION (decision 7). Every cut carries the whole text, so a lost intermediate costs
 *      one frame and nothing else. Nothing here reassembles deltas.
 *   3. THE WINDOW (decision 4). Past the edit window the reply CONTINUES in a new message rather than
 *      failing: `baseOffset` records what the closed message already carries, so the continuation
 *      starts where it left off and the concatenation still equals the whole reply.
 */
@injectable()
export class ReplyStreamer {
	private readonly streams = new Map<string, LiveStream>()

	constructor(
		private readonly commands: CommandQueue,
		private readonly logging: LoggingService,
	) {}

	/**
	 * Open a stream for one conversation — the TURN's only entry point.
	 *
	 * Returns a handle rather than exposing the sequence counter, so the caller cannot get the ordering
	 * wrong: sequences are minted here, in call order, and the turn just says "here is the text now".
	 *
	 * ### `replyToEntryId` — the anchor, handed over BEFORE a word exists
	 * "Ao finalizar uma tarefa, deve responder a mensagem que a criou" (founder). A streamed reply can
	 * only be quoted by the message that OPENS it: an edit replaces text and carries no citation field,
	 * so a balloon that went out unquoted stays unquoted. The anchor therefore has to be known here, at
	 * `begin`, before the model has said anything — and it is, because the mandate is not the model's to
	 * make: `RunOrchestratorTurn` takes `originEntryId` as INPUT on an ISSUE_RESULT turn (the mandatory
	 * half of D6) and hands it straight through.
	 *
	 * It is the ENTRY id, not the platform id. Resolving the ledger here would put a thread-context read
	 * inside a service the turn calls; `StreamChannelReply` already holds `ConsumedMessageRepository` for
	 * its echo claim and resolves it there, in the context that owns the ledger and exactly where
	 * `RecordOrchestratorReply` resolves the same thing. The durable row also keeps a stable domain id
	 * rather than a platform id frozen at enqueue time.
	 *
	 * A conversational citation the MODEL chooses (its sentinel, parsed after the run) cannot ride this
	 * path — it does not exist yet when the stream opens. Those replies still get their quote from the
	 * final `deliver_channel_message`, which is unstreamed whenever no cut ever landed.
	 */
	begin(conversation: { ownerId: string; channelId: string; remoteId: string; replyToEntryId?: string }): ReplyStreamHandle {
		const key = streamKey(conversation.channelId, conversation.remoteId)
		// A previous reply in the SAME conversation may still be parked here (closed, kept so stragglers
		// die). This turn's reply is a new message, so the slot starts clean.
		this.streams.delete(key)

		let sequence = 0
		return {
			cut: async (text: string) => {
				sequence += 1
				// BEST-EFFORT, and the reason is the same one decision 12 gives the cues: streaming is an
				// improvement on the wait, never the delivery itself. The reply is still recorded and still
				// delivered by `deliver_channel_message` at the end of the turn, so a queue that refuses a cut
				// must cost a frame — never the answer, and never the turn.
				const scheduled = await tryCatchAsync(() =>
					this.commands.enqueueCommand<StreamChannelReply>(
						'stream_channel_reply',
						{
							ownerId: conversation.ownerId,
							channelId: conversation.channelId,
							remoteId: conversation.remoteId,
							text,
							sequence,
							// Rides EVERY cut, though only the one that OPENS a message will spend it. Carrying it on
							// each row keeps the cut self-contained: which cut opens the message is decided by
							// `claimCut` at execution time (a retried first cut can be overtaken), so the executor
							// must be able to open a message from whichever row happens to get there first.
							replyToEntryId: conversation.replyToEntryId,
						},
						// UNIQUE job id per cut. A stable one would be worse than useless: `enqueueCommand`
						// dedups with ON CONFLICT DO NOTHING, so a second cut would be silently DROPPED and the
						// contact would keep reading the older text.
						{ jobId: `stream:${key}:${sequence}` },
					),
				)
				if (!scheduled.success) {
					this.logging.info({
						content: {
							message: 'reply stream cut not scheduled (best-effort)',
							channelId: conversation.channelId,
							reason: scheduled.error.message,
						},
					})
				}
			},
		}
	}

	/**
	 * THE GUARD (decision 6) — what one cut is allowed to do, decided before any gateway call.
	 *
	 * `nowMs` is a parameter, not a `Date.now()` read, so the window can be crossed in a test without
	 * waiting fourteen minutes.
	 */
	claimCut(key: string, sequence: number, nowMs: number): CutVerdict {
		const stream = this.streams.get(key)
		if (!stream) return { action: 'SEND' }

		// THE WHOLE OF AC-4. `<=` and not `<`: a re-executed cut carrying the sequence that already
		// landed has nothing to add either, and re-sending it is a wasted gateway call at best.
		if (stream.closed || sequence <= stream.lastAppliedSequence) return { action: 'DISCARD' }

		// THE WINDOW CLOSED. The continuation starts where the screen currently ENDS, not where the live
		// message began — otherwise the second balloon repeats everything the first one still shows.
		if (nowMs - stream.sentAtEpochMs >= EDIT_WINDOW_MS) return { action: 'CONTINUE', baseOffset: stream.deliveredLength }

		return { action: 'EDIT', messageId: stream.messageId, baseOffset: stream.baseOffset }
	}

	/**
	 * Record the message a `SEND`/`CONTINUE` just put on the channel.
	 *
	 * ### A SECOND caller (thinking-indicator spec, decision 2)
	 * `StreamChannelReply` calls this after ITS OWN send/continue, as documented above. `RunOrchestratorTurn`
	 * now also calls it directly, right after `begin()`, to register the "✻ {verbo}…" placeholder it
	 * opened before the model said anything — same shape, `sequence: 0` so the first real cut's sequence
	 * (minted starting at 1 by `begin()`'s handle) is never `<= lastAppliedSequence` and therefore never
	 * discarded. The effect is exactly what `claimCut` is FOR: the first real cut finds a stream already
	 * open here and answers `EDIT`, so it grows the placeholder instead of sending a second message
	 * (AC-3 — one messageId for the whole reply, thinking phase included).
	 */
	opened(
		key: string,
		opened: { ownerId: string; messageId: string; sentAtEpochMs: number; sequence: number; baseOffset: number; deliveredLength: number },
	): void {
		this.streams.set(key, {
			ownerId: opened.ownerId,
			messageId: opened.messageId,
			sentAtEpochMs: opened.sentAtEpochMs,
			baseOffset: opened.baseOffset,
			deliveredLength: opened.deliveredLength,
			lastAppliedSequence: opened.sequence,
			closed: false,
		})
		this.evictOverflow()
	}

	/** Record that an `EDIT` landed — the sequence applied, and how much of the reply is now on screen. */
	applied(key: string, sequence: number, deliveredLength: number): void {
		const stream = this.streams.get(key)
		if (!stream) return
		stream.lastAppliedSequence = sequence
		stream.deliveredLength = deliveredLength
	}

	/**
	 * What the FINAL, canonical text should do — and, whatever the answer, the stream is now CLOSED.
	 *
	 * Closing is what orders the final against every straggler without giving it a sequence number: the
	 * end of a stream is not "a very large sequence", it is a different state, and every cut that
	 * arrives afterwards is stale by definition (decision 7 — the last edit is the complete text, so
	 * nothing later can have anything to add).
	 */
	claimFinal(key: string, nowMs: number): FinalVerdict {
		const stream = this.streams.get(key)
		// Nobody streamed this reply — a channel that cannot edit, a turn too short to reach a first
		// sentence, or a message that was never an orchestrator reply at all. Today's behaviour (AC-6).
		if (!stream || stream.closed) return { action: 'NONE' }

		stream.closed = true

		if (nowMs - stream.sentAtEpochMs >= EDIT_WINDOW_MS) return { action: 'CONTINUE', baseOffset: stream.deliveredLength }
		return { action: 'EDIT', messageId: stream.messageId, baseOffset: stream.baseOffset }
	}

	/** Whether a live (unclosed) stream is currently growing in this conversation — read by tests and logs. */
	isStreaming(key: string): boolean {
		const stream = this.streams.get(key)
		return stream !== undefined && !stream.closed
	}

	/** Bounded like the replay buffer next door: a busy day must not grow the daemon without limit. */
	private evictOverflow(): void {
		while (this.streams.size > MAX_TRACKED_STREAMS) {
			const oldest = this.streams.keys().next()
			if (oldest.done) break
			this.streams.delete(oldest.value)
		}
	}
}
