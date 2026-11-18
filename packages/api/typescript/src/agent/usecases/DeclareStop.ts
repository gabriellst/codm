import { injectable } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { Handler, z, BaseError } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { IssueHold } from '@issue/services/IssueHold'
import { AskEffect, StopKind } from '@codm/contracts-typescript/wire/enums'
import type { AskOption } from '@shared/objects'
import { CloudSession } from '@shared/services/CloudSession'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { THREAD_MESSAGES } from '@thread/i18n/messages'
import { AgentRunStopRaisedEvent } from '../events/AgentRunStopRaisedEvent'
import { FactSource } from '../enums'
import type { AgentDomainErrors } from '../errors'
import { askQuestionOf, askStopFact, conversationLanguage } from '../utils/issueAsk'

export const DeclareStopInputSchema = z.object({
	ownerId: z.uuid(),
	issueId: z.uuid(),
	threadId: z.uuid(),
	/**
	 * Kept on the FULL frozen `StopKind` rather than a narrowed mirror: §8 rule 5 forbids redeclaring a
	 * value-set contracts already owns. The narrowing to the DOMAIN half is the handler's job below,
	 * and it is one membership test.
	 */
	kind: z.enum(StopKind),
	detail: z.string().trim().min(1).max(4000),
	/**
	 * The issue whose RUN is calling, read off the run identity by the controller — absent for the
	 * orchestrator and the console. A held issue's run is refused here (ISSUE_PAUSED, `IssueHold`).
	 * Never part of the tool's arguments: the controller omits it from the body.
	 */
	actingIssueId: z.uuid().optional(),
})

export const DeclareStopOutputSchema = z.object({ stopId: z.uuid() })

/**
 * What a kind DECLARED through the legacy `RaiseStop` tool becomes (fase 3) — total over `StopKind`, so a
 * kind added to the contract fails compilation here until somebody decides what a model declaring it means.
 *
 * - `ASK` — an alias of `AskDecision`: a `DECISION_REQUESTED` stop with an ask. `YES_NO` offers the two
 *   options a bare "sim"/"não" answers; `FREE_TEXT` none (the answer is text). `effects` is what the answer
 *   authorizes: an approval releases an action the model could not take on its own, so `IRREVERSIBLE` —
 *   only someone who may release answers it, the rule `APPROVE` always had.
 * - `STOP` — raised as declared (a classification block is a notice, not a question).
 * - `REFUSED` — not the model's to declare: the TRANSPORT kinds are observed by the runner; `STALLED` is the
 *   reconciler's inference; a question has a default, which this door cannot carry (`AskQuestion` can).
 */
type DeclaredAs =
	| { as: 'ASK'; options: 'YES_NO' | 'FREE_TEXT'; effects: readonly AskEffect[] }
	| { as: 'STOP' }
	| { as: 'REFUSED'; refusal: AgentDomainErrors }

export const DECLARED_AS: Record<StopKind, DeclaredAs> = {
	[StopKind.APPROVAL_NEEDED]: { as: 'ASK', options: 'YES_NO', effects: [AskEffect.IRREVERSIBLE] },
	[StopKind.HUMAN_REQUESTED]: { as: 'ASK', options: 'FREE_TEXT', effects: [] },
	[StopKind.DECISION_REQUESTED]: { as: 'ASK', options: 'FREE_TEXT', effects: [] },
	[StopKind.BLOCKED_BY_CLASSIFICATION]: { as: 'STOP' },
	[StopKind.AUTH_REQUIRED]: { as: 'REFUSED', refusal: 'AGENT_TRANSPORT_STOP_NOT_DECLARABLE' },
	[StopKind.SERVER_ERROR]: { as: 'REFUSED', refusal: 'AGENT_TRANSPORT_STOP_NOT_DECLARABLE' },
	[StopKind.PERMISSION_DENIED]: { as: 'REFUSED', refusal: 'AGENT_TRANSPORT_STOP_NOT_DECLARABLE' },
	[StopKind.STALLED]: { as: 'REFUSED', refusal: 'AGENT_STOP_KIND_NOT_DECLARABLE' },
	[StopKind.QUESTION_ASKED]: { as: 'REFUSED', refusal: 'AGENT_STOP_KIND_NOT_DECLARABLE' },
}

/**
 * The agent DECLARES that it is blocked (GOAL-agent-abstraction §4.4; the tool is `RaiseStop`).
 * "Asking for approval" is the `APPROVAL_NEEDED` case of this operation, not a separate one — the
 * model chooses the kind here, which is exactly what separates it from `AskOperator`, where the
 * handler fixes the kind and a `kind` key does not exist in the schema at all.
 *
 * ### A model may only raise a DOMAIN stop
 * `AUTH_REQUIRED` / `SERVER_ERROR` are TRANSPORT facts: the runner OBSERVES them on the process and
 * the stream, and they are always `INFERRED`. Letting a model declare one would let it manufacture an
 * observation about a subsystem it cannot see — and would put a `DECLARED` transport stop in the
 * ledger, making the `FactSource` column lie. The rejection is a DOMAIN error because the invariant is
 * about the vocabulary, not about the caller's credentials.
 *
 * ### Since fase 3 it is mostly an ALIAS of a decision (`DECLARED_AS`)
 * Sessions already running still call it. An approval or a request for a person becomes the
 * `DECISION_REQUESTED` stop `AskDecision` raises — with an ask built on THIS call, so the output policy can
 * put it in the group with its code and its options. The legacy `APPROVAL_NEEDED` / `HUMAN_REQUESTED` are no
 * longer raised by any tool and stay in the contract for the history.
 */
@injectable()
export class DeclareStop extends Handler<typeof DeclareStopInputSchema, typeof DeclareStopOutputSchema> {
	readonly name = 'declare_stop' as const
	readonly inputSchema = DeclareStopInputSchema
	readonly outputSchema = DeclareStopOutputSchema

	constructor(
		private readonly hold: IssueHold,
		private readonly threads: ThreadRepository,
		private readonly session: CloudSession,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		// A HELD issue's run does not get to raise anything visible (fase 2, item 2 — pausa como comando).
		await this.hold.assertNotHeld(input.actingIssueId)
		const declared = DECLARED_AS[input.kind]
		if (declared.as === 'REFUSED') {
			throw new BaseError<AgentDomainErrors>(declared.refusal, `${input.kind} is not declared through RaiseStop`)
		}

		if (declared.as === 'ASK') {
			const { event, stopId } = askStopFact({
				ownerId: input.ownerId,
				issueId: input.issueId,
				threadId: input.threadId,
				requested: StopKind.DECISION_REQUESTED,
				ask: {
					question: askQuestionOf(input.detail),
					options: await this.optionsOf(declared.options, input.threadId),
					effects: [...declared.effects],
				},
				detail: input.detail,
			})
			await this.withTransaction(tx, async tx => {
				await this.domainEventRepository.save(event, tx)
			})
			return { stopId }
		}

		const stopId = uuidv7()
		await this.withTransaction(tx, async tx => {
			await this.domainEventRepository.save(
				new AgentRunStopRaisedEvent({
					entityId: input.issueId,
					ownerId: input.ownerId,
					payload: {
						stopId,
						issueId: input.issueId,
						threadId: input.threadId,
						kind: input.kind,
						detail: input.detail,
						source: FactSource.DECLARED,
					},
				}),
				tx,
			)
		})
		return { stopId }
	}

	/** The options of a legacy ask — a yes/no in the group's language, or none (a free-text answer). */
	private async optionsOf(options: 'YES_NO' | 'FREE_TEXT', threadId: string): Promise<AskOption[]> {
		if (options === 'FREE_TEXT') return []
		const language = await conversationLanguage(this.threads, this.session, threadId)
		return [
			{ id: 'yes', label: THREAD_MESSAGES.approvalYes(language) },
			{ id: 'no', label: THREAD_MESSAGES.approvalNo(language) },
		]
	}
}
