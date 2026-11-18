import { AskAnswerKind, StopKind } from '@codm/contracts-typescript/wire/enums'
import type { StopAsk } from '@shared/objects'
import type { AskReply, AskView } from '@shared/schemas'
import type { Stop } from '../entities/Thread'
import { AnswerGate } from '../enums'
import { ASKED_AS, type AskStopKind } from '../objects/StopAsk'
import { askCode, labelOfAnswer } from './askAnswer'
import { gateOf } from './answerRules'

/** The stop facts an ask's view is built from — what the console's read and the panel's roster both hold. */
export type AskedStop = Pick<Stop, 'kind' | 'ask' | 'seq' | 'dueAt'>

/** How a person answers this ask: its options as buttons, or — when it offers none — their own words. */
export function askReplyOf(ask: StopAsk): AskReply {
	const [first, ...rest] = ask.options
	return first ? { kind: AskAnswerKind.OPTION, options: [first, ...rest] } : { kind: AskAnswerKind.TEXT }
}

/** One view per ask kind — total over the kinds that ask, so a new one decides here what people see. */
const VIEW_OF: { [K in AskStopKind]: (stop: AskedStop & { ask: StopAsk }, code: string) => Extract<AskView, { kind: K }> } = {
	[StopKind.DECISION_REQUESTED]: (stop, code) => ({
		kind: StopKind.DECISION_REQUESTED,
		code,
		question: stop.ask.question,
		reply: askReplyOf(stop.ask),
		releaseRequired: gateOf(stop) === AnswerGate.WITH_EFFECT,
	}),
	[StopKind.QUESTION_ASKED]: (stop, code) => ({
		kind: StopKind.QUESTION_ASKED,
		code,
		question: stop.ask.question,
		reply: askReplyOf(stop.ask),
		// A question always carries a default (`StopAsk` refuses one without); the empty label is the
		// honest fallback for a row written by hand, never a guess.
		defaultLabel: stop.ask.default ? labelOfAnswer(stop.ask, stop.ask.default) : '',
		dueAt: stop.dueAt?.toISOString(),
	}),
}

/**
 * An open stop's ask as a person sees it where they answer it (fase 3) — the console's Needs-you card and
 * the cloud panel. `undefined` for a stop that asks nothing (a transport stop, a stall, the legacy kinds):
 * those keep their bare resolution buttons.
 */
export function askViewOf(stop: AskedStop, issueKey: string): AskView | undefined {
	const asked = ASKED_AS[stop.kind]
	if (!asked || !stop.ask) return undefined
	return VIEW_OF[asked]({ ...stop, ask: stop.ask }, askCode(issueKey, stop.seq))
}
