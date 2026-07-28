import { injectable } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { Handler, z } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { StopKind } from '@codedm/contracts-typescript/wire/enums'
import { AgentRunStopRaisedEvent } from '../events/AgentRunStopRaisedEvent'
import { FactSource } from '../enums'

export const AskOperatorInputSchema = z.object({
	ownerId: z.uuid(),
	issueId: z.uuid(),
	threadId: z.uuid(),
	question: z.string().trim().min(1).max(4000),
})

export const AskOperatorOutputSchema = z.object({ delivered: z.literal(true), stopId: z.uuid() })

/**
 * The agent asks a human a question (GOAL-agent-abstraction §4.4; the tool is `AskOperator`).
 *
 * ### FIRE-AND-FORGET, and this is a correctness decision rather than an ergonomic one
 * The call returns AS SOON AS the question is durable. It does NOT wait for an answer. On a night
 * with nobody awake a blocking "wait for the human" tool would hang the run until the watchdog killed
 * it — the worst failure mode available, since the operator would wake to a dead run instead of a
 * question. The model is told, in the tool's own response text, not to expect an answer this turn and
 * to raise a stop if it genuinely cannot proceed.
 *
 * ### Why it is NOT the same operation as `RaiseStop`
 * The `kind` is fixed HERE, by the handler, at `HUMAN_REQUESTED` — the model does not choose it, and
 * the generated tool's `inputSchema` has no `kind` key to choose with (AC-6.10(c)). `RaiseStop`
 * carries `kind` in its body precisely because choosing it is the point there. One operation cannot
 * both accept and forbid the same key, which is why the design amendment's "three new operations" was
 * a miscount and there are four.
 *
 * ### It mints no new vocabulary
 * The same `AgentRunStopRaisedEvent`, the same bridge, the same frozen
 * `integration.issue.stop_raised`. The question travels as `detail`, and `MaterializeIssueFromExecution`
 * promotes it to the Needs-you card's TITLE because `kind === HUMAN_REQUESTED` — so the operator reads
 * the question itself rather than a generic "A participant asked for a human". Without the additive
 * `detail` field this phase adds to the frozen event, that whole paragraph would be an empty promise.
 */
@injectable()
export class AskOperator extends Handler<typeof AskOperatorInputSchema, typeof AskOperatorOutputSchema> {
	readonly name = 'ask_operator' as const
	readonly inputSchema = AskOperatorInputSchema
	readonly outputSchema = AskOperatorOutputSchema

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
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
						kind: StopKind.HUMAN_REQUESTED,
						detail: input.question,
						source: FactSource.DECLARED,
					},
				}),
				tx,
			)
		})
		return { delivered: true, stopId }
	}
}
