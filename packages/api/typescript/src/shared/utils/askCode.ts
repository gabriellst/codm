import { AskAnswerKind } from '@codm/contracts-typescript/wire/enums'
import type { StopAnswer, StopAsk } from '@shared/objects'

// How an ask READS to people (fase 3) — shared because two contexts print it: `thread` (the group message,
// the echo, the console's card) and `issue` (the timeline the console and the cloud panel show).

/** The code people read for an ask — `APP-12 · D1`; the key alone when the stop is not a numbered ask. */
export function askCode(key: string, seq: number | undefined): string {
	return seq === undefined ? key : `${key} · D${seq}`
}

/** An answer as people read it — the option's label (its id when the ask no longer lists it), the text, or the default's. */
export function labelOfAnswer(ask: StopAsk | undefined, answer: StopAnswer): string {
	const chosen = answer.kind === AskAnswerKind.DEFAULT ? answer.default : answer
	if (chosen.kind === AskAnswerKind.TEXT) return chosen.text
	return ask?.options.find(option => option.id === chosen.optionId)?.label ?? chosen.optionId
}
