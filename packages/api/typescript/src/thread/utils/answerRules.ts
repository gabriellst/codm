import { AskEffect, PermissionPosture, StopKind, StopResolution } from '@codm/contracts-typescript/wire/enums'
import type { Stop, Thread } from '../entities/Thread'
import { AnswerGate, BareAnswer, ReplyAnswerWay } from '../enums'
import type { ApplicationErrors } from '../errors'

// WHO MAY ANSWER WHAT, AND HOW A REPLY ANSWERS IT (fase 3, item 3) — tables, every one total over the enum it
// reads, so a stop kind or a resolution added to the contract fails compilation here until somebody decides.

/**
 * How a reply typed in the group answers a stop of each kind — `undefined` ⇒ it does not: a block notice
 * (server error, CLI login, a stall, a classification block) is quoted to TALK about it, never to resolve it,
 * even though its message carries the stop's id. The legacy `HUMAN_REQUESTED` / `APPROVAL_NEEDED` admit no
 * `ANSWER` and their messages never carried the id.
 */
export const ANSWERED_IN_GROUP_AS: Readonly<Record<StopKind, ReplyAnswerWay | undefined>> = {
	[StopKind.DECISION_REQUESTED]: ReplyAnswerWay.ASK,
	[StopKind.QUESTION_ASKED]: ReplyAnswerWay.ASK,
	[StopKind.PERMISSION_DENIED]: ReplyAnswerWay.YES_NO,
	[StopKind.SERVER_ERROR]: undefined,
	[StopKind.BLOCKED_BY_CLASSIFICATION]: undefined,
	[StopKind.HUMAN_REQUESTED]: undefined,
	[StopKind.APPROVAL_NEEDED]: undefined,
	[StopKind.AUTH_REQUIRED]: undefined,
	[StopKind.STALLED]: undefined,
}

/**
 * How a reply in the group answers THIS stop — only an ISSUE's stop is answered by the rules: a stop of the
 * conversation itself (the orchestrator's, raised with no issue) keeps today's path — the message reaches the
 * orchestrator, and nothing would resume a stop that has no issue to resume.
 */
export function answeredInGroupAs(stop: Stop): ReplyAnswerWay | undefined {
	return stop.issueId === undefined ? undefined : ANSWERED_IN_GROUP_AS[stop.kind]
}

/** A bare yes / no on a permission stop — the resolution it gives (`ANSWERED_IN_GROUP_AS` = `YES_NO`). */
export const YES_NO_RESOLUTION: Readonly<Record<BareAnswer, StopResolution>> = {
	[BareAnswer.YES]: StopResolution.APPROVE,
	[BareAnswer.NO]: StopResolution.DENY,
}

/**
 * What answering a stop WITHOUT an ask authorizes. A permission the filter blocked is an irreversible action
 * by definition (the spec's routing table: `PERMISSION_DENIED` → DECISION, effect `IRREVERSIBLE`); every other
 * kind without an ask authorizes nothing by being answered. A stop WITH an ask declares its own `effects`.
 */
const IMPLIED_EFFECTS: Readonly<Record<StopKind, readonly AskEffect[]>> = {
	[StopKind.PERMISSION_DENIED]: [AskEffect.IRREVERSIBLE],
	[StopKind.DECISION_REQUESTED]: [],
	[StopKind.QUESTION_ASKED]: [],
	[StopKind.SERVER_ERROR]: [],
	[StopKind.BLOCKED_BY_CLASSIFICATION]: [],
	[StopKind.HUMAN_REQUESTED]: [],
	[StopKind.APPROVAL_NEEDED]: [],
	[StopKind.AUTH_REQUIRED]: [],
	[StopKind.STALLED]: [],
}

/**
 * THE RULER OF WHO ANSWERS (owner decision 18/11). With an effect: only someone who may release — the same
 * rule as `APPROVE` on the panel today. Without: anyone who may act. A muted participant answers nothing.
 */
export const ANSWER_GATE: Readonly<Record<AnswerGate, (thread: Thread, participantId: string) => boolean>> = {
	[AnswerGate.WITH_EFFECT]: (thread, participantId) =>
		thread.mayAct(participantId) && thread.postureOf(participantId) === PermissionPosture.BYPASS,
	[AnswerGate.NO_EFFECT]: (thread, participantId) => thread.mayAct(participantId),
}

/** The named refusal of each gate, for the doors that answer a person with a code (console, panel). */
export const REFUSED_AS: Readonly<Record<AnswerGate, ApplicationErrors>> = {
	[AnswerGate.WITH_EFFECT]: 'PARTICIPANT_CANNOT_RELEASE',
	[AnswerGate.NO_EFFECT]: 'PARTICIPANT_CANNOT_ACT',
}

/** The effects answering this stop authorizes — the ask's declared ones, or what its kind implies. */
export function effectsOf(stop: Stop): readonly AskEffect[] {
	return stop.ask?.effects ?? IMPLIED_EFFECTS[stop.kind]
}

/** Which gate a stop's answer passes — any effect makes it a release. */
export function gateOf(stop: Stop): AnswerGate {
	return effectsOf(stop).length > 0 ? AnswerGate.WITH_EFFECT : AnswerGate.NO_EFFECT
}

/** May this participant answer this stop? */
export function mayAnswer(thread: Thread, stop: Stop, participantId: string): boolean {
	return ANSWER_GATE[gateOf(stop)](thread, participantId)
}
