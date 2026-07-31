import { CommandQueue, LoggingService, tryCatchAsync } from '@codm/core-typescript'
import { TYPING_FIRST_BEAT_SLOT, TYPING_MAX_DURATION_MS, typingBeatJobId } from '../../utils'
import type { SustainTypingPresence } from '../../usecases/SustainTypingPresence'

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
