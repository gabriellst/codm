import { BaseError, BaseValueObject, z } from '@codm/core-typescript'
import type Z from 'zod'
import { AskAnswerKind, StopKind } from '@codm/contracts-typescript/wire/enums'
import { StopAskSchema, type AskAnswer, type AskDefault, type StopAsk as StopAskShape } from '@shared/objects'
import type { DomainErrors } from '../errors'

/**
 * The two stop kinds that carry an ASK (fase 3) — a decision, and a question with a default and a deadline.
 * Every other kind (transport stops, the reconciler's STALLED, the legacy HUMAN_REQUESTED/APPROVAL_NEEDED,
 * PERMISSION_DENIED) is raised without one.
 */
export const ASK_STOP_KINDS = [StopKind.DECISION_REQUESTED, StopKind.QUESTION_ASKED] as const
export type AskStopKind = (typeof ASK_STOP_KINDS)[number]

/**
 * Which kind a stop fact must carry an ask for — and asks to be raised as. Total over `StopKind`: a kind
 * added to the contract decides here whether it is an ask. `undefined` ⇒ raised without one.
 */
export const ASKED_AS: Record<StopKind, AskStopKind | undefined> = {
	[StopKind.DECISION_REQUESTED]: StopKind.DECISION_REQUESTED,
	[StopKind.QUESTION_ASKED]: StopKind.QUESTION_ASKED,
	[StopKind.SERVER_ERROR]: undefined,
	[StopKind.BLOCKED_BY_CLASSIFICATION]: undefined,
	[StopKind.HUMAN_REQUESTED]: undefined,
	[StopKind.APPROVAL_NEEDED]: undefined,
	[StopKind.AUTH_REQUIRED]: undefined,
	[StopKind.PERMISSION_DENIED]: undefined,
	[StopKind.STALLED]: undefined,
}

/**
 * How long a question waits for somebody before it goes on with its default — counted from the moment the
 * message carrying it is accepted by the gateway, never from when the issue asked (decisão do dono, 15 min).
 */
export const QUESTION_DEFAULT_MS = 15 * 60 * 1000

/** The deadline of a question delivered at `deliveredAt` — the one place the 15 minutes are added. */
export function askDueAt(deliveredAt: Date): Date {
	return new Date(deliveredAt.getTime() + QUESTION_DEFAULT_MS)
}

/** Whether an answer naming an option names one this ask offers. A TEXT answer is always admissible. */
export function admitsAnswer(ask: StopAskShape, answer: AskAnswer | AskDefault): boolean {
	return answer.kind === AskAnswerKind.TEXT || ask.options.some(option => option.id === answer.optionId)
}

/**
 * The ask as the issue put it, plus what it ASKED to be (`requested`). The cross-field invariants the wire
 * schema deliberately leaves out (it is registered on the public OpenAPI, so it carries no `.refine()`) live
 * here, where a violation is a named domain error:
 * - option ids are unique — an answer names ONE option;
 * - an OPTION default names an option of this ask;
 * - a question carries a default — "a question without a default does not exist" (§6.1). A question with a
 *   declared effect is exempt: it escalates to a decision, which waits for a person, so it never applies one.
 */
export const StopAskObjectSchema = StopAskSchema.extend({ requested: z.enum(ASK_STOP_KINDS) })
	.refine(ask => new Set(ask.options.map(option => option.id)).size === ask.options.length, {
		error: 'ASK_OPTIONS_DUPLICATED' satisfies DomainErrors,
	})
	.refine(ask => ask.default === undefined || admitsAnswer(ask, ask.default), { error: 'ASK_OPTION_UNKNOWN' satisfies DomainErrors })
	.refine(ask => ask.requested !== StopKind.QUESTION_ASKED || ask.effects.length > 0 || ask.default !== undefined, {
		error: 'ASK_DEFAULT_REQUIRED' satisfies DomainErrors,
	})

/**
 * `StopAsk` (value object, fase 3) — what an issue asks the group, validated, and the ONE owner of the
 * escalation rule (§6.1): any declared effect (publish, irreversible, client data) makes the ask a
 * `DECISION_REQUESTED` — no default, no deadline, answerable only by someone who may release. The output
 * policy only routes the kind it is handed; it never re-derives it.
 */
export class StopAsk extends BaseValueObject<typeof StopAskObjectSchema> {
	static override schema = StopAskObjectSchema

	/**
	 * The ask a stop fact of `kind` carries — refused (`INVALID_REQUEST`) when that kind does not ask
	 * (`ASKED_AS`): a question attached to a server error is a malformed fact, not a question.
	 */
	static forKind(kind: StopKind, ask: StopAskShape): StopAsk {
		const requested = ASKED_AS[kind]
		if (!requested) throw new BaseError<DomainErrors>('INVALID_REQUEST', `a ${kind} stop takes no ask`)
		return new StopAsk({ ...ask, requested })
	}

	/** The kind the stop is raised as — the requested one, escalated to a decision by any effect. */
	get kind(): AskStopKind {
		return this.effects.length > 0 ? StopKind.DECISION_REQUESTED : this.requested
	}

	/** What a question goes on with, as people read it — the option's label, or the default text. */
	defaultLabel(): string | undefined {
		const fallback = this.default
		if (!fallback) return undefined
		return fallback.kind === AskAnswerKind.TEXT ? fallback.text : this.options.find(option => option.id === fallback.optionId)?.label
	}

	/** The wire shape the stop row stores (and the console/panel read) — `requested` is not part of it. */
	toAsk(): StopAskShape {
		return StopAskSchema.parse({
			question: this.question,
			options: this.options,
			default: this.default,
			effects: this.effects,
			addresseeId: this.addresseeId,
			// Fase 4 (item 6c): what follows a successful publish this ask authorized — kept on the stop for the dispatcher.
			onPublished: this.onPublished,
		})
	}
}

export interface StopAsk extends Z.infer<typeof StopAskObjectSchema> {}
export type StopAskProps = Z.input<typeof StopAskObjectSchema>
