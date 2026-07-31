/**
 * THE INSTANT CUES — the vocabulary of what the product says on the channel before it has words.
 *
 * Streaming cuts the wait to ~1-2s; a cue cuts it to ~0, because it depends on no generation at all
 * (streaming spec, decision 10). Everything here is COSMETIC by construction: nothing in this file
 * is ever a domain fact, nothing is transcribed, and every consumer treats a failure as "nothing
 * happened" (decision 12).
 */

/**
 * `👀` — "I saw this and I am on it", hung on the message that woke the agent.
 *
 * A NAMED constant rather than a literal at the call site, because this emoji is a PRODUCT decision
 * that the spec expects to move: decision 11 already anticipates a SECOND cue for "the turn ended
 * and it needs you", and the founder has not chosen that emoji yet.
 *
 * THE SEAM THAT LEAVES OPEN, stated so the next person does not re-derive it: swapping the cue is
 * free, because WhatsApp keeps one reaction per sender per message and REPLACES it on resend. So
 * "change 👀 to X" is one more `react` call with the same `messageId`, and "clear it" is a `react`
 * with an empty string. `ReactToChannelMessage` therefore takes the emoji as INPUT rather than
 * hardcoding this one — the only thing still missing for the stop-outcome cue is the emoji itself,
 * which lands here as a sibling `const`.
 */
export const CUE_ACKNOWLEDGED = '👀'

/**
 * How often the typing indicator must be re-published to stay lit.
 *
 * The platform expires it on its own in the order of ten seconds. Beating faster than the expiry is
 * the whole mechanism — beat at the expiry and the indicator strobes.
 */
export const TYPING_BEAT_INTERVAL_MS = 6_000

/**
 * THE CEILING. The longest a turn may keep the indicator lit before the loop stops on its own.
 *
 * This is the number that makes "digitando…" impossible to get PERMANENTLY stuck, and it is load
 * bearing rather than a tidy-up: see `SustainTypingPresence` for why no off-switch can carry that
 * guarantee by itself.
 */
export const TYPING_MAX_DURATION_MS = 5 * 60 * 1000

/**
 * The two job ids the typing loop alternates between.
 *
 * Two, not one, because of a hard property of `SqliteCommandQueue`: a command's row is DELETED by
 * `finalizeSuccess` AFTER its handler returns, so a beat that re-armed its own id would schedule a
 * row and then watch the queue delete it — the loop would stop after exactly one beat, silently and
 * with everything green. Alternating between two ids means the row a beat schedules is never the row
 * about to be deleted.
 */
export const TYPING_BEAT_SLOTS = [0, 1] as const
export type TypingBeatSlot = (typeof TYPING_BEAT_SLOTS)[number]

/** The slot a fresh loop starts on. */
export const TYPING_FIRST_BEAT_SLOT: TypingBeatSlot = 0

/** The other slot — the one the beat currently running schedules next. */
export const nextTypingBeatSlot = (slot: TypingBeatSlot): TypingBeatSlot => (slot === 0 ? 1 : 0)

/**
 * The queue handle of one beat, DERIVED from the conversation alone.
 *
 * Derivation is what makes the loop stoppable by someone who never started it: `DeliverChannelMessage`
 * holds `channelId` + `remoteId` and nothing else, and that is enough to cancel a loop some other use
 * case armed. A random job id would have forced the starter to hand the handle down through the turn.
 */
export const typingBeatJobId = (channelId: string, remoteId: string, slot: TypingBeatSlot): string =>
	`typing:${channelId}:${remoteId}:${slot}`

/** Every handle a running loop can currently be parked on — what a canceller has to clear. */
export const typingBeatJobIds = (channelId: string, remoteId: string): readonly string[] =>
	TYPING_BEAT_SLOTS.map(slot => typingBeatJobId(channelId, remoteId, slot))
