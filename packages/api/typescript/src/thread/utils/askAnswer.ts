import { AskAnswerKind } from '@codm/contracts-typescript/wire/enums'
import { ASK_TEXT_MAX, type AskAnswer, type StopAsk } from '@shared/objects'
import { BareAnswer } from '../enums'
import { fold, LEADING_MENTIONS } from './controlCommand'

// READING AN ANSWER OUT OF A MESSAGE (fase 3, item 3) — no model, the same style as `controlCommand.ts`.
// Three questions: is the whole message a bare "sim"/"não"; does it name an ask by its code (`APP-12 · D1`,
// `D1`); and, once the ask is known, which of its options (or what free text) the message is.

/**
 * The BARE ANSWERS — a whole message that is only one of these is a yes or a no. Compared after folding
 * case and accents and dropping the mentions and the final punctuation, so "Sim!", "SIM" and "@codm sim"
 * are one answer. Disjoint from `CONTROL_WORDS` (tested): "pare" / "segue" typed alone stay commands.
 */
export const BARE_ANSWERS: Readonly<Record<BareAnswer, readonly string[]>> = {
	[BareAnswer.YES]: [
		'sim',
		'pode',
		'pode sim',
		'pode publicar',
		'pode mandar',
		'manda',
		'ok',
		'okay',
		'yes',
		'yep',
		'aprovado',
		'aprovo',
		'👍',
	],
	[BareAnswer.NO]: ['nao', 'nao pode', 'melhor nao', 'negativo', 'no', 'nope', '👎'],
}

const ANSWER_OF_WORD: ReadonlyMap<string, BareAnswer> = new Map(
	Object.values(BareAnswer).flatMap(answer => BARE_ANSWERS[answer].map(word => [word, answer] as const)),
)

/** Trailing punctuation a bare answer may carry ("sim!", "pode.", "ok…"). */
const TRAILING_PUNCTUATION = /[\s.!?,;:…]+$/u

/** A message as a bare answer is compared: folded, without leading mentions, final punctuation or doubled spaces. */
function asBare(text: string): string {
	return fold(text).replace(LEADING_MENTIONS, '').replace(TRAILING_PUNCTUATION, '').replace(/\s+/gu, ' ').trim()
}

/** Is the WHOLE message a bare yes or no? `undefined` for anything else — "sim, mas muda o título" is not one. */
export function parseBareAnswer(text: string): BareAnswer | undefined {
	return ANSWER_OF_WORD.get(asBare(text))
}

/**
 * An ask's code written in a message: `APP-12 · D1`, `APP-12 D1`, `APP-12-D1`, or `D1` alone (then the issue
 * comes from the quoted message). The key follows the format `ForkIssue` mints, the same as `RuleRouter`.
 */
const ASK_CODE = /(?:\b([A-Z][A-Z0-9]{1,5}-\d{1,6})\s*[·.:-]?\s*)?\b[Dd](\d{1,3})\b/gu

export interface AskCode {
	/** The issue key, when the message wrote it. */
	key?: string
	/** The ask's number within its issue — the `1` of `D1`. */
	seq: number
	/** The message with the code taken out — what is left is the answer. */
	rest: string
}

/** The ONE ask code a message names — `undefined` with none, or with two different ones (never a guess). */
export function parseAskCode(text: string): AskCode | undefined {
	const found = [...text.matchAll(ASK_CODE)]
	const distinct = new Set(found.map(match => `${match[1] ?? ''}#${match[2]}`))
	if (distinct.size !== 1) return undefined
	const [first] = found
	if (!first) return undefined
	return { key: first[1], seq: Number(first[2]), rest: text.replace(ASK_CODE, ' ') }
}

/** The option of a yes/no ask that a bare answer of this polarity picks — by its label or its id. */
export function optionForBare(ask: StopAsk, answer: BareAnswer): string | undefined {
	return ask.options.find(option => parseBareAnswer(option.label) === answer || parseBareAnswer(option.id) === answer)?.id
}

/** What is left of a message once the mentions and the separators people put after a code ("— sim", ": 2") go. */
const LEADING_SEPARATORS = /^[\s·—–:,-]+/u

/**
 * The answer a message gives to `ask` — `undefined` when nothing is left to read (only a mention, only the
 * code). In order: the option's NUMBER as listed (`2`), its label or id, a bare yes/no on a yes/no ask; any
 * other text is a TEXT answer, which every ask admits.
 */
export function parseAskAnswer(text: string, ask: StopAsk): AskAnswer | undefined {
	const answer = text.replace(LEADING_MENTIONS, '').replace(LEADING_SEPARATORS, '').trim()
	if (answer.length === 0) return undefined
	const bare = asBare(answer)

	const index = /^\d+$/u.test(bare) ? Number(bare) - 1 : -1
	const byPosition = ask.options[index]
	if (byPosition) return { kind: AskAnswerKind.OPTION, optionId: byPosition.id }

	const byName = ask.options.find(option => asBare(option.label) === bare || asBare(option.id) === bare)
	if (byName) return { kind: AskAnswerKind.OPTION, optionId: byName.id }

	const polarity = parseBareAnswer(answer)
	const byPolarity = polarity ? optionForBare(ask, polarity) : undefined
	if (byPolarity) return { kind: AskAnswerKind.OPTION, optionId: byPolarity }

	return { kind: AskAnswerKind.TEXT, text: answer.slice(0, ASK_TEXT_MAX) }
}

// How an ask reads to people — shared with the `issue` timeline, so it lives in `shared/utils`.
export { askCode, labelOfAnswer } from '@shared/utils/askCode'
