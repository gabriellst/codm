import { SteerUrgency } from '../enums'

/**
 * THE URGENCY WORDS (fase 2, item 4), compared after folding case and accents, the style of
 * `controlCommand.ts`. Only `NOW` has words: `NEXT_STEP` is what a steer is when it says nothing.
 */
const URGENCY_WORDS: Readonly<Record<SteerUrgency, readonly string[]>> = {
	[SteerUrgency.NEXT_STEP]: [],
	[SteerUrgency.NOW]: ['agora', 'now'],
}

/**
 * Words that, right after `agora`, make it a REACTION to the work, not an order: "agora sim", "agora
 * ficou bom", "agora deu certo". Cutting a running turn on praise throws work away, so these stay
 * `NEXT_STEP` (the steer still reaches the session — it just waits its turn). Folded like the rest.
 */
const NOT_AN_ORDER_AFTER_NOW: ReadonlySet<string> = new Set([
	'sim',
	'nao',
	'ficou',
	'deu',
	'foi',
	'funcionou',
	'funciona',
	'melhorou',
	'ta',
	'esta',
	'entendi',
	'ok',
	'beleza',
	'perfeito',
	'yes',
	'it',
	'works',
	'looks',
])

const URGENCY_OF_WORD: ReadonlyMap<string, SteerUrgency> = new Map(
	Object.values(SteerUrgency).flatMap(urgency => URGENCY_WORDS[urgency].map(word => [word, urgency] as const)),
)

/**
 * What may come BEFORE the urgency word — the message's addressing, never its content: leading
 * @mentions, then at most one issue key (the target, `APP-12`), each with the punctuation people put
 * after it ("APP-12: agora …", "APP-12, agora …").
 */
const ADDRESSING = /^(?:\s*@\S+)*\s*(?:[A-Za-z][A-Za-z0-9]{1,5}-\d{1,6}\b\s*[:,\-–—]?\s*)?/u
/** The first word, whole, and what follows it after the punctuation that may trail it. */
const FIRST_WORD = /^(\p{L}+)(?![\p{L}\p{N}])\s*[:,\-–—!.]?\s*/u

const fold = (word: string): string => word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

export interface ParsedSteer {
	urgency: SteerUrgency
	/** What the session is told: the text with the addressing and the urgency word taken off — or as written, for `NEXT_STEP`. */
	text: string
}

/**
 * How soon does this routed steer want the session? `NOW` when, after its addressing, the first word is
 * `agora` / `now` AND something follows it — a bare "agora" is not an instruction, and neither is "agora sim" / "agora ficou bom" (`NOT_AN_ORDER_AFTER_NOW`;
 * see the spec's known limits). Everything else is `NEXT_STEP` with the text untouched.
 */
export function parseSteerUrgency(text: string): ParsedSteer {
	const afterAddressing = text.slice(ADDRESSING.exec(text)?.[0].length ?? 0)
	const first = FIRST_WORD.exec(afterAddressing)
	const urgency = first?.[1] === undefined ? undefined : URGENCY_OF_WORD.get(fold(first[1]))
	const rest = first ? afterAddressing.slice(first[0].length).trim() : ''
	if (urgency === undefined || rest.length === 0) return { urgency: SteerUrgency.NEXT_STEP, text }
	const next = FIRST_WORD.exec(rest)?.[1]
	if (next !== undefined && NOT_AN_ORDER_AFTER_NOW.has(fold(next))) return { urgency: SteerUrgency.NEXT_STEP, text }
	return { urgency, text: rest }
}
