/**
 * The reader for the citation sentinel the prompt teaches (D6, §7.6) — deliberately COLOCATED with
 * the prompt that emits it, because the two are one protocol and drift between them is silent.
 *
 * ### Why a trailing sentinel and not structured output
 * The orchestrator has no `outputSchema` (a conversational turn is a stream, not an object) and its
 * tool scope is for forking and reading, not for speaking. §7.6 says the model "signals a citation by
 * reusing the entryId of the consumed item", and the only channel it has is the text. Anchored to the
 * END of the reply, the sentinel cannot be confused with prose, and a turn that simply forgets it
 * degrades to "no quote" — which is the correct default anyway.
 */

/**
 * `[quote: <uuid>]` as the LAST non-empty line, and nothing after it.
 *
 * Anchored with `\s*$` so a sentence that happens to mention the shape mid-reply is not a citation.
 * The id is matched loosely (not a strict uuid) so a malformed one is STRIPPED rather than delivered
 * to the group as literal text — the failure mode that matters is the operator reading `[quote: …]`
 * in their chat, and that must not happen whatever the model emits.
 */
const SENTINEL = /\n?[ \t]*\[quote:[ \t]*([^\]\n]*)\][ \t]*$/

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface ParsedReply {
	/** The reply as the operator should see it — sentinel removed, whatever it contained. */
	text: string
	/** Present only when the sentinel carried a well-formed id. */
	replyToEntryId?: string
}

/**
 * Split a raw turn into what to SAY and what to CITE.
 *
 * The two failure modes are handled differently on purpose. A missing sentinel is not an error — it
 * is the common case, and the reply stands as written. A malformed one IS stripped but produces no
 * citation: publishing `[quote: undefined]` into somebody's conversation is worse than losing the
 * attachment, and the reply itself is still perfectly good.
 */
export function parseReply(raw: string): ParsedReply {
	const match = SENTINEL.exec(raw)
	if (!match) return { text: raw.trim() }

	const id = (match[1] ?? '').trim()
	const text = raw.slice(0, match.index).trim()
	return UUID.test(id) ? { text, replyToEntryId: id } : { text }
}
