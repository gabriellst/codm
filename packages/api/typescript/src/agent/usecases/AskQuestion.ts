import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { StopKind } from '@codm/contracts-typescript/wire/enums'
import { AskDefaultSchema, StopAskSchema } from '@shared/objects'
import { IssueHold } from '@issue/services/IssueHold'
import { askStopFact } from '../utils/issueAsk'

export const AskQuestionInputSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	issueId: z.uuid(),
	/**
	 * The issue whose RUN is calling, read off the run identity by the controller — absent for the console.
	 * A held issue's run is refused (ISSUE_PAUSED, `IssueHold`). Never part of the tool's arguments.
	 */
	actingIssueId: z.uuid().optional(),
	// A question MUST carry the default it goes on with — required here, so "a question without a default"
	// is not a value the tool can even receive. `options` may be empty (a free-text question).
	...StopAskSchema.shape,
	default: AskDefaultSchema,
})
/**
 * `kind` tells the session what the ask became: `QUESTION_ASKED` (goes on with the default after the
 * deadline) or `DECISION_REQUESTED` (a declared effect escalated it — wait for the answer).
 */
export const AskQuestionOutputSchema = z.object({ stopId: z.uuid(), kind: z.enum(StopKind) })

/**
 * The issue asks the group a QUESTION it can go on without (fase 3, item 1) — a stop `QUESTION_ASKED` that
 * holds the issue only until its deadline (15 min after the group received it), then the declared default
 * applies. Any declared effect escalates it to a decision — the `StopAsk` value object decides, and the
 * answer tells the session which one it got, so it knows whether to wait.
 *
 * Validated on THIS call (`askStopFact`): a default naming no option comes back as `ASK_OPTION_UNKNOWN`.
 */
@injectable()
export class AskQuestion extends Handler<typeof AskQuestionInputSchema, typeof AskQuestionOutputSchema> {
	readonly name = 'ask_question' as const
	readonly inputSchema = AskQuestionInputSchema
	readonly outputSchema = AskQuestionOutputSchema

	constructor(private readonly hold: IssueHold) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		await this.hold.assertNotHeld(input.actingIssueId)
		const { event, stopId, kind } = askStopFact({
			ownerId: input.ownerId,
			issueId: input.issueId,
			threadId: input.threadId,
			requested: StopKind.QUESTION_ASKED,
			ask: {
				question: input.question,
				options: input.options,
				default: input.default,
				effects: input.effects,
				addresseeId: input.addresseeId,
			},
		})
		await this.withTransaction(tx, async tx => {
			await this.domainEventRepository.save(event, tx)
		})
		return { stopId, kind }
	}
}
