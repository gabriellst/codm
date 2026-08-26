import { CommandQueue, LoggingService, tryCatchAsync } from '@codm/core-typescript'
import { TYPING_FIRST_BEAT_SLOT, TYPING_MAX_DURATION_MS, typingBeatJobId, typingBeatJobIds } from '../../utils/ChannelCues'
import type { SustainTypingPresence } from '../../usecases/SustainTypingPresence'
import type { ChannelSender } from '../ChannelSender'

/** Everything the loop needs to beat, plus the two kernel collaborators the enqueue rides on. */
interface BeginTypingPresence {
	commands: CommandQueue
	logging: LoggingService
	ownerId: string
	/** The gateway channel the conversation lives on. */
	channelId: string
	/** The contact/group the indicator is shown to — `Thread.contactRef.externalId`. */
	remoteId: string
}

/**
 * THE IGNITION OF "digitando…" — the one line that turns `SustainTypingPresence` from a complete
 * mechanism into a running loop (streaming spec, AC-10).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * ### WHY THIS EXISTS AT ALL: it is a cross-context SEAM, not a helper
 *
 * `SustainTypingPresence`'s own docblock names the caller — "WHO TURNS IT ON: the turn" — and the turn
 * is `agent/usecases/RunOrchestratorTurn`. But the ignition needs four things that all live in THIS
 * context: the command's name, its payload shape, the ceiling, and the derived job id. Reaching them
 * from `agent` directly means importing `thread/usecases` (the class, for `enqueueCommand<T>` and for
 * `name`) and `thread/utils` (the constants) — and `usecases` is FORBIDDEN across a context boundary
 * by `CROSS_CONTEXT_POLICY` ("cross-context orchestration"), while `utils` is not on the allowed list
 * either. The previous session stopped at exactly that wall and shipped the loop unlit rather than
 * widen the map, which was the right call.
 *
 * `services` IS on the allowed list, and it is the surface this very seam already crosses on: the
 * neighbouring `ReplyStreamer` is exported from `thread/services` for the same reason, in the same
 * turn, feeding the same conversation — its barrel comment says so in as many words. So the ignition
 * lands beside it. Nothing about the map moves: `agent → thread` is a declared edge, `services` is a
 * permitted surface, and the whole vocabulary of the typing loop stays owned by the context that
 * implements it.
 *
 * ### WHY A FUNCTION AND NOT AN INJECTABLE SERVICE CLASS
 * There is no state to hold. `ReplyStreamer` is a bound singleton because it owns process-local stream
 * state that must outlive a call; this owns nothing at all — the loop's entire state is the durable
 * queue row `SustainTypingPresence` re-arms on each beat, which is precisely what makes the loop
 * survive a restart. A registered singleton whose only job is to forward four arguments to the queue
 * would add a DI node that can be silently half-wired (the orphan-artifact failure the wiring rails
 * exist for) and buy nothing. Free exports from the services surface are already the house shape here:
 * `streamKey` and `EDIT_WINDOW_MS` cross on the same barrel.
 *
 * ### BEST-EFFORT, like every other cue (decision 12)
 * A queue that refuses the first beat costs the indicator, never the turn. The reply is generated,
 * recorded and delivered exactly the same; the contact simply waits without the decoration, which is
 * today's behaviour. Throwing here would trade a missing "digitando…" for a failed turn, and the
 * dispatcher would retry the turn — producing a SECOND message in a real group.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
export async function beginTypingPresence({ commands, logging, ownerId, channelId, remoteId }: BeginTypingPresence): Promise<void> {
	const armed = await tryCatchAsync(() =>
		commands.enqueueCommand<SustainTypingPresence>(
			'sustain_typing_presence' satisfies SustainTypingPresence['name'],
			// THE CEILING IS MINTED HERE, once, and then TRAVELS: every subsequent beat copies the same
			// absolute instant forward rather than recomputing it, so a loop cannot extend its own deadline
			// by beating. Wall-clock epoch ms because the payload is JSON in a SQLite column.
			{ ownerId, channelId, remoteId, untilEpochMs: Date.now() + TYPING_MAX_DURATION_MS, slot: TYPING_FIRST_BEAT_SLOT },
			// No `delay`: the whole point of a cue is that it costs no generation, so the first beat is due
			// immediately. The handle is DERIVED, which is what lets `DeliverChannelMessage` cancel a loop it
			// never started and was never told about.
			{ jobId: typingBeatJobId(channelId, remoteId, TYPING_FIRST_BEAT_SLOT) },
		),
	)
	if (!armed.success) {
		logging.info({ content: { message: 'typing presence not started (best-effort)', channelId, reason: armed.error.message } })
	}
}

/**
 * What ending a loop needs. `ownerId` is back — not for the cancel (`CommandQueue.cancelCommand`
 * deletes by job id alone) but for the `paused` that follows it, which is a gateway write and is
 * scoped by owner like every other one.
 */
interface EndTypingPresence {
	commands: CommandQueue
	sender: ChannelSender
	logging: LoggingService
	ownerId: string
	channelId: string
	remoteId: string
}

/**
 * THE OTHER HALF OF THE IGNITION — cancel a running loop from anywhere in the thread context,
 * without importing `SustainTypingPresence` (`usecases`, forbidden across the context boundary by
 * `CROSS_CONTEXT_POLICY`) or the raw job-id vocabulary from outside it. Same seam as
 * `beginTypingPresence` above, for the same reason: `services` is the permitted surface, and the
 * loop's vocabulary — the command's name, its two derivable handles — stays owned by this context.
 *
 * TWO HALVES, and both are load bearing: CANCEL the pending beats (so nothing re-lights the signal)
 * and PUBLISH the stop (so what is already on the contact's screen comes down). Either one alone
 * leaves the bug that motivated this: cancelling without stopping left a `composing` standing that
 * nothing would ever retract; stopping without cancelling would have the next beat undo it.
 *
 * `DeliverChannelMessage` already relied on exactly this property (a canceller derives both handles
 * from `channelId`/`remoteId` alone and can stop a loop it never started) — it just held the only
 * copy, as a private method nothing outside `thread/usecases` could reach. Extracted here so every
 * terminal can reach it, and now they all do: both of the delivery's exits, `StreamChannelReply`'s
 * opening cut, and — the guarantee — `RunOrchestratorTurn`'s `finally`, which covers the paths with
 * no delivery at all (an error, a run that produced no reply).
 *
 * BEST-EFFORT PER HANDLE, like every other cue (decision 12): one handle failing to cancel must not
 * skip the other, and neither failure may throw — the reply (or the error path) already did its job.
 */
export async function endTypingPresence({ commands, sender, logging, ownerId, channelId, remoteId }: EndTypingPresence): Promise<void> {
	for (const jobId of typingBeatJobIds(channelId, remoteId)) {
		const outcome = await tryCatchAsync(() =>
			commands.cancelCommand('sustain_typing_presence' satisfies SustainTypingPresence['name'], jobId),
		)
		if (!outcome.success) {
			logging.info({ content: { message: 'typing presence not cancelled (best-effort)', channelId, reason: outcome.error.message } })
		}
	}

	// AND THEN SAY SO ON THE WIRE. Deleting the rows only stops US from beating; the contact's screen is
	// still holding the last `composing` we published, and how long it holds it is not ours to assume —
	// the old design rated the decay at "~10s" and a real conversation showed the indicator outliving
	// the answer regardless. `paused` is what actually takes it down (`ChannelSender.stopTyping`).
	//
	// AFTER the cancel, never before: a stop published while a beat is still armed would be overwritten
	// by that beat within six seconds, which is worse than not stopping at all — it looks intermittent.
	const stopped = await tryCatchAsync(() => sender.stopTyping({ channelId, remoteId }, ownerId))
	if (!stopped.success) {
		logging.info({ content: { message: 'typing presence not stopped (best-effort)', channelId, reason: stopped.error.message } })
	}
}
