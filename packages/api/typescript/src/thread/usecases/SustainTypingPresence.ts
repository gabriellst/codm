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
 * WHO RENEWS IT — this class, by scheduling the NEXT beat before it returns. The platform expires
 * the indicator on its own in the order of ten seconds, so there is nothing to renew *in place*;
 * renewal is simply another beat, and it lives in a durable row rather than in a `setInterval` that
 * a restart would forget.
 *
 * WHO TURNS IT OFF — **nobody has to, and that is the design.** Three independent things stop it,
 * two of which need no cooperation at all:
 *
 *   1. THE PLATFORM. Miss one beat, for any reason — crash, dead gateway, stopped queue — and the
 *      indicator decays by itself within ~10s. Silence IS the off-switch.
 *   2. THE CEILING (`untilEpochMs`). Even with a perfectly healthy process, a turn that hangs forever
 *      cannot keep the indicator lit forever: the beat that finds the deadline passed publishes
 *      nothing and schedules nothing, and the loop is over.
 *   3. THE MESSAGE. `DeliverChannelMessage` cancels both handles once the reply is on the wire —
 *      which is the AC's "cessa quando o primeiro texto sai". This one is an OPTIMISATION, not the
 *      guarantee: it saves the gateway calls that (1) and (2) would otherwise waste.
 *
 * The ordering matters. A design whose only off-switch is an explicit signal is a design where every
 * crash between "on" and "off" strands a contact watching a permanent "digitando…" — so the explicit
 * signal is deliberately the LAST line of defence here, never the first.
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

		// THE CEILING, CHECKED FIRST. Past the deadline this beat is a no-op in both directions: it
		// neither lights the indicator nor arms a successor, so the loop ends here even if nothing ever
		// cancelled it.
		if (Date.now() >= untilEpochMs) {
			this.logging.debug({ content: { message: 'typing presence loop reached its ceiling', channelId, remoteId } })
			return
		}

		const beat = await tryCatchAsync(() => this.sender.signalTyping({ channelId, remoteId }, ownerId))
		if (!beat.success) {
			// Swallowed, and the loop CONTINUES — see the class doc. A blip costs one frame.
			this.logging.info({ content: { message: 'typing presence beat skipped (best-effort)', channelId, reason: beat.error.message } })
		}

		// Don't arm a successor that would only wake up past the deadline — it would publish nothing,
		// so scheduling it just leaves a row for the queue to claim, run and delete for no effect.
		if (Date.now() + TYPING_BEAT_INTERVAL_MS >= untilEpochMs) return

		const next = nextTypingBeatSlot(slot)
		const armed = await tryCatchAsync(() =>
			this.commands.enqueueCommand<SustainTypingPresence>(
				this.name,
				{ ownerId, channelId, remoteId, untilEpochMs, slot: next },
				{ jobId: typingBeatJobId(channelId, remoteId, next), delay: TYPING_BEAT_INTERVAL_MS },
			),
		)
		if (!armed.success) {
			// The loop simply ends — which the platform's own expiry makes harmless within ~10s. Throwing
			// would retry this beat and re-publish an indicator whose successor is what actually failed.
			this.logging.info({ content: { message: 'typing presence loop not renewed (best-effort)', channelId, reason: armed.error.message } })
		}
	}
}
