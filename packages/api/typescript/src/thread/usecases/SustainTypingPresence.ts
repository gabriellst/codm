import { injectable } from 'tsyringe-neo'
import { CommandQueue, Handler, LoggingService, tryCatchAsync, z } from '@codm/core-typescript'
import { ChannelSender } from '../services/ChannelSender'
import { TYPING_BEAT_INTERVAL_MS, TYPING_BEAT_SLOTS, nextTypingBeatSlot, typingBeatJobId, type TypingBeatSlot } from '../utils/ChannelCues'

export const SustainTypingPresenceInputSchema = z.object({
	ownerId: z.uuid(),
	channelId: z.string(),
	remoteId: z.string(),
	/**
	 * THE CEILING, as an ABSOLUTE instant rather than a countdown.
	 *
	 * Epoch milliseconds because this payload is JSON in a SQLite column: a `Date` comes back as a
	 * string and a countdown would drift every time a beat waits behind a busy queue. A wall clock is
	 * the only form of "the indicator may not outlive this instant" that survives both.
	 */
	untilEpochMs: z.number().int(),
	/** Which of the two alternating queue handles this beat is running as — see `TYPING_BEAT_SLOTS`. */
	slot: z
		.number()
		.int()
		.refine((n): n is TypingBeatSlot => TYPING_BEAT_SLOTS.includes(n as TypingBeatSlot)),
})

export const SustainTypingPresenceOutputSchema = z.void()

/**
 * The native "digitando…" kept lit while the orchestrator generates (streaming spec, decision 10).
 *
 * ### The loop, and the three questions the spec asks of it
 *
 * WHO TURNS IT ON — the turn, by enqueueing the first beat when it starts generating:
 *
 *     commands.enqueueCommand<SustainTypingPresence>(
 *       'sustain_typing_presence',
 *       { ownerId, channelId, remoteId, untilEpochMs: Date.now() + TYPING_MAX_DURATION_MS, slot: TYPING_FIRST_BEAT_SLOT },
 *       { jobId: typingBeatJobId(channelId, remoteId, TYPING_FIRST_BEAT_SLOT) },
 *     )
 *
 * WHO RENEWS IT — this class, by scheduling the NEXT beat BEFORE it publishes its own (see the order
 * in `handle`, which is what keeps a cancel from being outrun). There is nothing to renew *in place*:
 * renewal is simply another beat, and it lives in a durable row rather than in a `setInterval` that a
 * restart would forget.
 *
 * WHO TURNS IT OFF — **somebody always has to, and that was the correction.** The original design
 * said nobody did: silence plus the platform's own decay was the off-switch, and an explicit stop was
 * kept as a mere optimisation. A real conversation falsified it (gateway log, 26-ago): the reply
 * landed and the beats ran on for five full minutes, to the ceiling, every turn. Two things were
 * wrong at once, and the fix needed both:
 *
 *   1. NOBODY WAS CANCELLING on the path that matters. `DeliverChannelMessage` returned early for a
 *      streamed reply, above its own cancel; `StreamChannelReply` cancelled only when a cut OPENS a
 *      message, which the "Pensando" placeholder makes impossible. The cancel now runs on every exit
 *      of the delivery, and `RunOrchestratorTurn` closes the presence in a `finally` — the guarantee,
 *      covering delivery, empty replies, errors and any terminal written later.
 *   2. SILENCE IS NOT AN OFF-SWITCH. `paused` exists on the wire (`ChatPresenceType`) and always did;
 *      this side simply never published it, and the "~10s decay" it relied on instead was an
 *      assumption, not a measurement. Every extinction now SAYS so: the canceller
 *      (`endTypingPresence`) and the ceiling beat below both publish a stop.
 *
 * The ceiling stays, and stays load-bearing: it is what bounds a turn nothing ever cancels (a crash
 * between "on" and "off"), and it is now the beat that publishes the final `paused`.
 *
 * ### Why the beat alternates between two job ids
 * `LibSqlCommandQueue.finalizeSuccess` DELETES the command's row after the handler returns. A beat
 * that re-armed its own `jobId` would insert a row and then have the queue delete it — one beat, then
 * silence, with `tsc` green and every unit test passing. Alternating means the row this beat schedules
 * is never the row about to be deleted. Both handles are derivable from the conversation, so the
 * canceller does not need to know which one is currently armed.
 *
 * ### Best-effort throughout (decision 12)
 * Neither the gateway call nor the re-arm may throw out of here: a cue that dead-letters is an
 * operator-visible error for a decoration. A failed beat still schedules the next one — a gateway
 * blip should cost one frame of the indicator, not the rest of the turn.
 */
@injectable()
export class SustainTypingPresence extends Handler<typeof SustainTypingPresenceInputSchema, typeof SustainTypingPresenceOutputSchema> {
	readonly name = 'sustain_typing_presence' as const
	readonly inputSchema = SustainTypingPresenceInputSchema
	readonly outputSchema = SustainTypingPresenceOutputSchema

	constructor(
		private readonly sender: ChannelSender,
		private readonly commands: CommandQueue,
		private readonly logging: LoggingService,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<void> {
		const { ownerId, channelId, remoteId, untilEpochMs } = input
		const slot = input.slot as TypingBeatSlot

		// THE CEILING, CHECKED FIRST — and this beat is the one that PUTS THE INDICATOR OUT. It arms no
		// successor, so the loop ends here even if nothing ever cancelled it, and it publishes a `paused`
		// so the ending is visible to the contact rather than left to a decay this side cannot observe.
		// A turn that hangs forever therefore costs a bounded "digitando…", not an open-ended one.
		if (Date.now() >= untilEpochMs) {
			const stopped = await tryCatchAsync(() => this.sender.stopTyping({ channelId, remoteId }, ownerId))
			if (!stopped.success) {
				this.logging.info({
					content: { message: 'typing presence not stopped at ceiling (best-effort)', channelId, reason: stopped.error.message },
				})
			}
			this.logging.debug({ content: { message: 'typing presence loop reached its ceiling', channelId, remoteId } })
			return
		}

		// ────────────────────────────────────────────────────────────────────────────────────────────
		// THE SUCCESSOR IS ARMED BEFORE THE GATEWAY CALL, AND THE ORDER IS THE WHOLE POINT.
		//
		// A canceller (`endTypingPresence`) DELETES both derivable rows. Arming after the beat left a
		// window the width of an HTTP round-trip in which the successor did not exist yet: a cancel
		// landing inside it deleted nothing, this beat then inserted the successor, and the loop walked
		// on to its five-minute ceiling with nobody left to stop it — a resurrected loop, un-cancellable
		// because every canceller had already run. Arming FIRST inverts that: the row a cancel needs to
		// find is on disk before the slow part starts, so the window shrinks from ~one second to the few
		// microseconds of a single SQLite insert.
		//
		// A successor that would only wake up PAST the ceiling is armed too, deliberately — it is the
		// beat that publishes the `paused` above. Skipping it (as this used to) meant the last beat of a
		// hung turn left `composing` standing with nothing scheduled to retract it.
		// ────────────────────────────────────────────────────────────────────────────────────────────
		const next = nextTypingBeatSlot(slot)
		const armed = await tryCatchAsync(() =>
			this.commands.enqueueCommand<SustainTypingPresence>(
				this.name,
				{ ownerId, channelId, remoteId, untilEpochMs, slot: next },
				{ jobId: typingBeatJobId(channelId, remoteId, next), delay: TYPING_BEAT_INTERVAL_MS },
			),
		)
		if (!armed.success) {
			// The loop simply ends — the turn's own terminal still publishes the stop. Throwing would retry
			// this beat and re-publish an indicator whose successor is what actually failed.
			this.logging.info({ content: { message: 'typing presence loop not renewed (best-effort)', channelId, reason: armed.error.message } })
		}

		const beat = await tryCatchAsync(() => this.sender.signalTyping({ channelId, remoteId }, ownerId))
		if (!beat.success) {
			// Swallowed, and the loop CONTINUES — see the class doc. A blip costs one frame.
			this.logging.info({ content: { message: 'typing presence beat skipped (best-effort)', channelId, reason: beat.error.message } })
		}
	}
}
