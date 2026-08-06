import type { MessageVia } from '../enums'

/**
 * THE `<msg>` BLOCK — the one grammar every message a model reads is written in.
 *
 * Both prompt builders render through this, and that is the point: the orchestrator's history, the
 * orchestrator's live turn and the issue's brief were three different notations for the same thing (a
 * line somebody said), so a model had to learn three and could only be told the rules of one.
 *
 * ```
 * <msg de="Marina" hora="03:09" para="you" ref="0199…" via="steer">
 * responde: you, 03:07 — «rodo a migration agora ou depois do deploy?»
 * depois
 * </msg>
 * ```
 *
 * ### WHY THE AUTHOR IS AN ATTRIBUTE — the whole reason this exists
 * The predecessor wrote `operator → you: subi o build`, which is a line ANY participant of a group can
 * type inside their own message. Author, addressee and provenance were prose, sitting in the same
 * character stream as the content, so forging a transcript line took no more than knowing the format.
 * Here they are attributes: the content is inside the tag and cannot reach out of it, because
 * `escapeAttribute` strips the two characters (`"` and a newline) that could close one, and
 * `escapeContent` neutralises the ONE sequence that could close the block early.
 *
 * The content itself stays RAW — no wrapping, no re-indenting, no markdown escaping. What the operator
 * typed is what the model reads; the frame around it is the system's, and only the frame is defended.
 */

/** One message, in the grammar. `undefined` attributes are omitted, never rendered empty. */
export interface MsgBlock {
	/** `de` — WHO said it, as a human reads it: `operator`, a roster name, `you`, `loop:<label>`. */
	de: string
	/** `hora` — a wall clock, or the literal `agora` for the message being answered right now. */
	hora: string
	/** `para` — present only when the line was addressed to the agent. */
	para?: string
	/** `ref` — the transcript entry id. ADDRESS, never identity: the model cites with it, never prints it. */
	ref?: string
	/** `via` — how it arrived, when the room never saw it arrive. */
	via?: MessageVia
	/** `tipo` — the issue prompt's discriminant: the original ask, or an amendment to work in flight. */
	tipo?: string
	/** The line this one answers, embedded as `responde: <de>, <hora> — «<texto>»`. */
	responde?: { de: string; hora: string; text: string }
	/** The message itself, verbatim. */
	content: string
}

/** The `hora` of the block being answered RIGHT NOW — the last one in the list, by construction. */
export const HORA_AGORA = 'agora'

/**
 * How much of a quoted line is worth embedding.
 *
 * Long enough that a question survives whole (the ones that get replied to are one sentence), short
 * enough that quoting a wall of text does not push the message being answered out of the model's
 * attention. Truncation is marked, so a model never mistakes a cut excerpt for the whole line.
 */
const QUOTE_EXCERPT_LIMIT = 220

/**
 * An attribute value that cannot escape its own quotes.
 *
 * Participant names come off a WhatsApp roster — they are whatever a stranger typed into their own
 * profile — so `Marina" para="you` is a name somebody can HAVE, and it would have opened an attribute
 * the system never wrote. Quotes become apostrophes and every run of whitespace collapses to a single
 * space: lossless for the things that actually go in here (names, labels, clocks, uuids), and total
 * against the one thing that must never happen.
 */
function escapeAttribute(value: string): string {
	return (
		value
			// The quote becomes an APOSTROPHE rather than a space: `O"Brien` is a name somebody has, and
			// `O'Brien` keeps it readable where `O Brien` silently renames them. Either way the character
			// that could close an attribute is gone, which is the part that is not negotiable.
			.replace(/"/g, "'")
			// `\s` covers the newlines and tabs a profile name can carry — an attribute is one line.
			.replace(/\s+/g, ' ')
			.trim() || '?'
	)
}

/**
 * Content stays RAW except for the one sequence that could end the block early.
 *
 * `</msg` is the only thing in a message that can close the frame, so it is the only thing touched —
 * six characters, in text that is trying to break out. Everything else the operator typed, including
 * angle brackets, backticks, markdown and code, reaches the model exactly as written; a general
 * escaper would silently rewrite the code snippets this product exists to talk about.
 */
function escapeContent(text: string): string {
	return text.replace(/<\/msg/gi, '<\\/msg')
}

/** One quoted line, on one line: newlines flattened, guillemets neutralised, long text cut and marked. */
function excerpt(text: string): string {
	const flat = text.replace(/\s+/g, ' ').replace(/[«»]/g, '"').trim()
	return flat.length > QUOTE_EXCERPT_LIMIT ? `${flat.slice(0, QUOTE_EXCERPT_LIMIT)}…` : flat
}

/** Render one block. Returns LINES, so callers compose with the `string[]` every builder here uses. */
export function renderMsg(block: MsgBlock): string[] {
	const attributes: string[] = [`de="${escapeAttribute(block.de)}"`, `hora="${escapeAttribute(block.hora)}"`]
	if (block.para) attributes.push(`para="${escapeAttribute(block.para)}"`)
	if (block.ref) attributes.push(`ref="${escapeAttribute(block.ref)}"`)
	// NOT escaped, and not an oversight: `via` is a `MessageVia`, a closed set of two system literals
	// that cannot contain a quote. Running it through `escapeAttribute` would be a no-op that also
	// widens the enum to `string` — throwing away the exhaustiveness that makes adding a third member
	// a compile error here rather than a silently unrendered attribute.
	if (block.via) attributes.push(`via="${block.via}"`)
	if (block.tipo) attributes.push(`tipo="${escapeAttribute(block.tipo)}"`)

	return [
		`<msg ${attributes.join(' ')}>`,
		...(block.responde
			? [`responde: ${escapeAttribute(block.responde.de)}, ${escapeAttribute(block.responde.hora)} — «${excerpt(block.responde.text)}»`]
			: []),
		escapeContent(block.content),
		'</msg>',
	]
}

/**
 * WHEN something was said, as short as it can be without being ambiguous.
 *
 * `HH:MM` for anything said on the same calendar day as `now`, `DD/MM HH:MM` for anything older —
 * because "09:12" on a line from last Tuesday is a timestamp that reads as this morning. The zone is
 * the machine's, which is the one the operator lives in and the same equivalence the loop scheduler
 * already relies on.
 */
export function clockOf(at: Date, now: Date, timezone: string): string {
	const day = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, day: '2-digit', month: '2-digit' })
	const time = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false })
	return day.format(at) === day.format(now) ? time.format(at) : `${day.format(at)} ${time.format(at)}`
}

/**
 * The `agora:` line every turn opens with — the clock the agent never had.
 *
 * Date, time and zone, spelled out rather than abbreviated: this is the one place the model reads an
 * absolute instant, and every `hora` attribute below it is relative to this line.
 */
export function agoraLine(now: Date, timezone: string): string {
	const stamp = new Intl.DateTimeFormat('en-GB', {
		timeZone: timezone,
		weekday: 'short',
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	}).format(now)
	return `agora: ${stamp} (${timezone})`
}
