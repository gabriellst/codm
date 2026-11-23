import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { StopKind } from '@codm/contracts-typescript/wire/enums'
import { ASK_OPTIONS_MAX, AskOptionSchema, StopAskSchema } from '@shared/objects'
import { IssueHold } from '@issue/services/IssueHold'
import { askStopFact } from '../utils/issueAsk'

export const AskDecisionInputSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	issueId: z.uuid(),
	/**
	 * The issue whose RUN is calling, read off the run identity by the controller — absent for the console.
	 * A held issue's run is refused (ISSUE_PAUSED, `IssueHold`). Never part of the tool's arguments.
	 */
	actingIssueId: z.uuid().optional(),
	// A decision has no default and no deadline: it holds the issue until someone answers. Two to six options;
	// `effects` is required (may be empty) so the model always states what the answer authorizes.
	...StopAskSchema.pick({ question: true, effects: true, addresseeId: true, onPublished: true }).shape,
	options: z.array(AskOptionSchema).min(2).max(ASK_OPTIONS_MAX),
})
export const AskDecisionOutputSchema = z.object({ stopId: z.uuid() })

/**
 * The issue asks the group to DECIDE (fase 3, item 1) — a stop `DECISION_REQUESTED` that holds the issue
 * until someone answers; with a declared effect only someone who may release can answer it. The output
 * policy puts it in the group with its code (`APP-12 · D1`) and its numbered options.
 *
 * The ask is validated on THIS call (`askStopFact` → the `StopAsk` value object): two options with the
 * same id come back to the model as `ASK_OPTIONS_DUPLICATED`, never as a stop fact the thread later
 * refuses. Fire-and-forget like `AskOperator`: it returns as soon as the decision is durable.
 */
@injectable()
export class AskDecision extends Handler<typeof AskDecisionInputSchema, typeof AskDecisionOutputSchema> {
	readonly name = 'ask_decision' as const
	readonly inputSchema = AskDecisionInputSchema
	readonly outputSchema = AskDecisionOutputSchema

	constructor(private readonly hold: IssueHold) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		await this.hold.assertNotHeld(input.actingIssueId)
		const { event, stopId } = askStopFact({
			ownerId: input.ownerId,
			issueId: input.issueId,
			threadId: input.threadId,
			requested: StopKind.DECISION_REQUESTED,
			ask: {
				question: input.question,
				options: input.options,
				effects: input.effects,
				addresseeId: input.addresseeId,
				onPublished: input.onPublished,
			},
		})
		await this.withTransaction(tx, async tx => {
			await this.domainEventRepository.save(event, tx)
		})
		return { stopId }
	}
}
