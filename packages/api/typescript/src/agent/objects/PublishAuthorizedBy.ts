import { AskAnswerKind, AskEffect, StopResolution } from '@codm/contracts-typescript/wire/enums'
import type { StopAnswer, StopAsk } from '@shared/objects'

/** What the rule reads of a resolved stop: the ask the issue declared, and the answer recorded on it. */
export interface ResolvedAsk {
	ask?: StopAsk
	answer?: StopAnswer
}

/** The option an answer chose — a person's option, or the option the deadline's default named. */
function chosenOptionId(answer: StopAnswer | undefined): string | undefined {
	switch (answer?.kind) {
		case undefined:
		case AskAnswerKind.TEXT:
			return undefined
		case AskAnswerKind.OPTION:
			return answer.optionId
		case AskAnswerKind.DEFAULT:
			return answer.default.kind === AskAnswerKind.OPTION ? answer.default.optionId : undefined
	}
}

const declaresPublish = (stop: ResolvedAsk): boolean => stop.ask?.effects.includes(AskEffect.PUBLISH) ?? false

/** The ask declared `PUBLISH` at stake AND the chosen option declares it authorizes `PUBLISH`. */
const chosenOptionAuthorizes = (stop: ResolvedAsk): boolean => {
	const optionId = chosenOptionId(stop.answer)
	const option = stop.ask?.options.find(candidate => candidate.id === optionId)
	return declaresPublish(stop) && (option?.authorizes?.includes(AskEffect.PUBLISH) ?? false)
}

const never = (): boolean => false

/**
 * WHETHER A RESOLUTION AUTHORIZES PUBLISHING (fase 4, item 6c) — by DECLARED data only, total over `StopResolution`:
 *  - an answer (a person's, or the default the deadline applied) to an ask whose `effects ∋ PUBLISH`, when the
 *    chosen option declares `authorizes ∋ PUBLISH`;
 *  - an `APPROVE` of a stop whose ask declares `effects ∋ PUBLISH`;
 *  - nothing else — a DENY, a retry, a take-over never authorize anything.
 *
 * Read by the resume of a resolved stop (`thread/handlers/ResumeIssueOnStopResolved`: an authorizing resolution is
 * queued even when the issue has work pending, or the publish would never run) and, from slice S11, by the
 * dispatcher that runs the workspace's publish command in place of the session turn. Never "APPROVE ⇒ true" in
 * general: that would give every approval a second turn (spec, revisão 2).
 */
export const PUBLISH_AUTHORIZED_BY: Readonly<Record<StopResolution, (stop: ResolvedAsk) => boolean>> = {
	[StopResolution.RETRY]: never,
	[StopResolution.REVIEW_AND_SEND]: never,
	[StopResolution.APPROVE]: declaresPublish,
	[StopResolution.DENY]: never,
	[StopResolution.TAKE_OVER]: never,
	[StopResolution.ANSWER]: chosenOptionAuthorizes,
	[StopResolution.DEFAULT_APPLIED]: chosenOptionAuthorizes,
}
