/**
 * WHEN a growing reply is worth pushing to the channel — the hybrid cadence of the streaming spec's
 * decision 2, ratified by the founder on 31/07.
 *
 * A PURE FUNCTION over (accumulated text, instant, previous decision). No clock, no timer, no I/O,
 * no `Date.now()` anywhere in this file: the caller passes `nowMs`, which is what makes the cadence
 * assertable with a CONTROLLED clock instead of a `sleep`. A policy that read the clock itself could
 * only be tested by waiting, and a suite that waits 1.5s per assertion gets deleted the first time
 * someone is in a hurry.
 *
 * ### The three triggers, and why "per line" is not among them
 *   - FIRST SENTENCE — the first send fires as soon as one complete sentence exists. This is the
 *     trigger that actually buys the goal: the contact goes from "silence for the whole generation"
 *     to "something in ~1-2s". Everything after it is polish.
 *   - PARAGRAPH — a blank line closed since the last cut. A paragraph is a unit the reader recognises,
 *     so growing by one reads as deliberate rather than as flicker.
 *   - INTERVAL — ~1.5s since the last cut, so a long paragraph still visibly advances.
 *
 * NEVER per line (decision 2, explicit). A newline arrives every few tokens in list-shaped output, so
 * a per-line cadence would turn one reply into dozens of edits: the message would shimmer on the
 * contact's screen and the number would be a rate-limit candidate. The falseador for AC-2 swaps the
 * paragraph test for a line test and the edit count explodes — which is the point of stating this
 * here rather than only in a test name.
 *
 * ### Why the cut carries the WHOLE text
 * Every decision returns the entire visible text so far, never a delta. `ChannelSender.edit` replaces
 * the body, and decision 7 makes "the last edit carries the complete text" the property that makes
 * the mechanism self-correcting: a lost intermediate cut costs one frame, never the final state.
 */

/** How long a reply may sit unchanged before it is worth an edit (decision 2 — a ratified starting point, not a measurement). */
export const STREAM_CUT_INTERVAL_MS = 1_500

/** What the caller carries between decisions — the whole memory this policy needs. */
export interface ReplyCutState {
	/** When the last cut was handed over. `null` before the first send, which is what selects the first-sentence trigger. */
	readonly lastCutAtMs: number | null
	/** How much visible text the last cut carried — the "is there anything new?" baseline. */
	readonly deliveredLength: number
}

/** A stream that has delivered nothing yet. */
export const INITIAL_CUT_STATE: ReplyCutState = { lastCutAtMs: null, deliveredLength: 0 }

/** Which trigger fired — carried so callers and tests can assert the CADENCE, not just the count. */
export type CutReason = 'FIRST_SENTENCE' | 'PARAGRAPH' | 'INTERVAL'

export type CutDecision = { cut: false } | { cut: true; reason: CutReason; text: string }

export interface DecideCutInput {
	/** Everything the model has emitted for this reply so far, raw. */
	text: string
	nowMs: number
	state: ReplyCutState
	/** Overridable so a test can drive the cadence without also owning the production number. */
	intervalMs?: number
}

/**
 * A sentence ends at `.`, `!` or `?` followed by whitespace or the end of the text.
 *
 * The trailing-end case is what makes the FIRST send fire promptly: at the moment the model emits
 * "Vou olhar o log." there is no space after the period yet, and requiring one would hold the first
 * message back until the next token — spending the exact 1-2s this whole frente exists to buy.
 */
const SENTENCE_END = /[.!?](\s|$)/

/** A closed paragraph: one blank line. `\n` ALONE IS NOT A TRIGGER — see the file docstring. */
const PARAGRAPH_BREAK = '\n\n'

/** The head of the citation sentinel `parseReply` strips at the end of a turn. */
const SENTINEL_HEAD = '[quote:'

/**
 * The reply as the CONTACT should see it mid-flight — trimmed, with any trailing citation sentinel
 * removed even when it is still half-typed.
 *
 * `parseReply` already exists because "a sentinel that reached the delivery would be delivered
 * verbatim into somebody's chat" is a defect this repo has already decided it cares about. Streaming
 * reopens that hole in a way `parseReply` cannot close: the sentinel is emitted at the END of the
 * turn, so it lands token by token INSIDE the window where edits are still going out, and a cut taken
 * mid-sentinel would put a literal `[quote: 019fb…` on the contact's screen for a second or two.
 * Stripping the partial form here keeps that from ever being visible.
 */
export function visibleReplyText(raw: string): string {
	const text = raw.trimEnd()
	const open = text.lastIndexOf('[')
	if (open === -1) return text

	const tail = text.slice(open)
	// Either the sentinel is fully formed, or it is a prefix of one the model is still emitting.
	const complete = /^\[quote:[^\]\n]*\]$/.test(tail)
	const partial = SENTINEL_HEAD.startsWith(tail) || (tail.startsWith(SENTINEL_HEAD) && !tail.includes(']') && !tail.includes('\n'))
	return complete || partial ? text.slice(0, open).trimEnd() : text
}

/**
 * Should the stream be cut RIGHT NOW?
 *
 * Returns the whole visible text when it fires, so the caller never reassembles anything.
 */
export function decideCut({ text, nowMs, state, intervalMs = STREAM_CUT_INTERVAL_MS }: DecideCutInput): CutDecision {
	const visible = visibleReplyText(text)

	// NOTHING NEW — checked before any trigger, and it is what stops the interval from firing forever
	// on a stalled generation. Without it a model that goes quiet for ten seconds would produce an edit
	// every 1.5s, all of them re-sending an identical body.
	if (visible.length <= state.deliveredLength) return { cut: false }

	// THE FIRST SEND. Not time-based on purpose: a timer would either fire before there is a whole
	// thought to show, or sit idle while one was already available.
	if (state.lastCutAtMs === null) {
		return SENTENCE_END.test(visible) ? { cut: true, reason: 'FIRST_SENTENCE', text: visible } : { cut: false }
	}

	// A paragraph CLOSED SINCE THE LAST CUT — searched from the delivered offset so the same blank line
	// cannot re-trigger on every subsequent token.
	if (visible.indexOf(PARAGRAPH_BREAK, state.deliveredLength) !== -1) {
		return { cut: true, reason: 'PARAGRAPH', text: visible }
	}

	if (nowMs - state.lastCutAtMs >= intervalMs) return { cut: true, reason: 'INTERVAL', text: visible }

	return { cut: false }
}

/** The state a stream is in once `decision` has been handed to the channel. */
export function advanceCutState(decision: Extract<CutDecision, { cut: true }>, nowMs: number): ReplyCutState {
	return { lastCutAtMs: nowMs, deliveredLength: decision.text.length }
}
