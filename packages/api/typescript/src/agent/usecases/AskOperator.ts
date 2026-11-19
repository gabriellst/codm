import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { IssueHold } from '@issue/services/IssueHold'
import { StopKind } from '@codm/contracts-typescript/wire/enums'
import { askQuestionOf, askStopFact } from '../utils/issueAsk'

export const AskOperatorInputSchema = z.object({
	ownerId: z.uuid(),
	issueId: z.uuid(),
	threadId: z.uuid(),
	question: z.string().trim().min(1).max(4000),
	/**
	 * The issue whose RUN is calling, read off the run identity by the controller — absent for the
	 * orchestrator and the console. A held issue's run is refused here (ISSUE_PAUSED, `IssueHold`).
	 * Never part of the tool's arguments: the controller omits it from the body.
	 */
	actingIssueId: z.uuid().optional(),
})

export const AskOperatorOutputSchema = z.object({ delivered: z.literal(true), stopId: z.uuid() })

/**
 * The agent asks a human a question (GOAL-agent-abstraction §4.4; the tool is `AskOperator`).
 *
 * ### Since fase 3 it is an ALIAS of a decision
 * Sessions already running still call it, so it stays — and raises what `AskDecision` raises: a
 * `DECISION_REQUESTED` stop whose ask is the question with NO options (the answer is free text) and no
 * declared effect. The output policy then puts it in the group with its code, where a quoted reply
 * answers it; the legacy `HUMAN_REQUESTED` it used to raise said nothing in the group by itself. The ask
 * is built on this call (`askStopFact`), and a question longer than an ask's is cut there — the full
 * words stay in the stop's `detail`.
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
 * The same `AgentRunStopRaisedEvent`, the same bridge, the same frozen `integration.thread.stop_raised`
 * — with the `ask` fase 3 added to both.
 */
@injectable()
export class AskOperator extends Handler<typeof AskOperatorInputSchema, typeof AskOperatorOutputSchema> {
	readonly name = 'ask_operator' as const
	readonly inputSchema = AskOperatorInputSchema
	readonly outputSchema = AskOperatorOutputSchema

	constructor(private readonly hold: IssueHold) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		// A HELD issue's run does not get to raise anything visible (fase 2, item 2 — pausa como comando).
		await this.hold.assertNotHeld(input.actingIssueId)
		const { event, stopId } = askStopFact({
			ownerId: input.ownerId,
			issueId: input.issueId,
			threadId: input.threadId,
			requested: StopKind.DECISION_REQUESTED,
			ask: { question: askQuestionOf(input.question), options: [], effects: [] },
			detail: input.question,
		})
		await this.withTransaction(tx, async tx => {
			await this.domainEventRepository.save(event, tx)
		})
		return { delivered: true, stopId }
	}
}
