import { injectable } from 'tsyringe-neo'
import { BaseError, Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { IssueStatus, StopKind } from '@codm/contracts-typescript/wire/enums'
import { CloudSession } from '@shared/services/CloudSession'
import { ArtifactRepository } from '@artifact/repositories/ArtifactRepository'
import { ArtifactSendability } from '@artifact/services/ArtifactSendability'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { THREAD_MESSAGES } from '@thread/i18n/messages'
import { AgentRunCompletedEvent } from '../events/AgentRunCompletedEvent'
import { FactSource } from '../enums'
import type { ApplicationErrors } from '../errors'
import { askQuestionOf, askStopFact, conversationLanguage } from '../utils/issueAsk'

export const DeclareIssueCompleteInputSchema = z.object({
	ownerId: z.uuid(),
	issueId: z.uuid(),
	threadId: z.uuid(),
	/** The target lifecycle state the agent is declaring. */
	status: z.enum(IssueStatus),
	/**
	 * The agent's own words: the completion note on `COMPLETED`, the reason it needs input on
	 * `NEEDS_INPUT`. Empty is legal — a declaration with no prose is still a declaration.
	 */
	summary: z.string().trim().max(4000).default(''),
	/**
	 * The issue's thread-unique slug key. OPTIONAL, and deliberately so: the frozen
	 * `integration.issue.completed` carries `key` but VERIFIED to have no consumer that reads it
	 * (`MaterializeIssueFromExecution` forwards only `issueId` to `CompleteIssue`; the SSE broadcaster
	 * re-emits the raw envelope since B5, with no consumer destructuring `key` out of it). It is a
	 * LABEL, not identity — identity is `issueId`, which the MCP router validates against the run
	 * token's claims. A caller that knows the key passes it; one that does not passes nothing rather
	 * than inventing one.
	 */
	key: z.string().trim().default(''),
	/**
	 * The artifact that IS the result (fase 3) — the page, the print of what went live — sent with the closing
	 * line in the group. Only on `COMPLETED`; an artifact this issue recorded, checked here (the same checks as
	 * `RequestFeedback`), so a refusal reaches the session instead of a dead-lettered delivery.
	 */
	finalArtifactId: z.uuid().optional(),
})

export const DeclareIssueCompleteOutputSchema = z.object({ issueId: z.uuid(), status: z.enum(IssueStatus) })

/**
 * The agent DECLARES the lifecycle state of the issue it is working (GOAL-agent-abstraction §4.4;
 * the tool is `TransitionIssueStatus`). This is the inversion the whole phase exists for: the fact
 * that an issue is done stops being INFERRED from a process exiting cleanly and starts being SAID.
 *
 * ### The event classes are the ones that already exist
 * `AgentRunCompletedEvent` / `AgentRunStopRaisedEvent`, unchanged, so the write-side bridge gains no
 * branch and there is still exactly ONE publisher per frozen integration event (§4.3 rule 7). What
 * changes is `source`: `DECLARED` here, `INFERRED` when `RunIssueTurn` derives the same fact from a
 * terminal outcome. That field is the whole visible difference between the two modes, and it is why
 * "how many issues closed by inference?" is a `SELECT` rather than a promise.
 *
 * ### The switch is exhaustive over the frozen `IssueStatus`, and each branch is honest
 *  - `COMPLETED` → the completion fact.
 *  - `NEEDS_INPUT` → a decision (fase 3: an ALIAS of `AskDecision`, sessions in flight still call it) —
 *    a `DECISION_REQUESTED` stop whose ask is the summary with no options (the answer is free text). The
 *    output policy puts it in the group with its code; the `HUMAN_REQUESTED` it used to raise said nothing
 *    there by itself. A summary is optional on this call, an ask's question is not: an empty one asks in the
 *    group's language what the decision title says, so the declaration still reaches somebody.
 *  - `WORKING` → NO FACT. An agent announcing that it is still working has told us nothing that was
 *    not already true; minting an event for it would put noise in a durable ledger. Returning the
 *    state rather than erroring keeps the tool honest about having accepted the call.
 */
@injectable()
export class DeclareIssueComplete extends Handler<typeof DeclareIssueCompleteInputSchema, typeof DeclareIssueCompleteOutputSchema> {
	readonly name = 'declare_issue_complete' as const
	readonly inputSchema = DeclareIssueCompleteInputSchema
	readonly outputSchema = DeclareIssueCompleteOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly session: CloudSession,
		private readonly artifacts: ArtifactRepository,
		private readonly sendability: ArtifactSendability,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const { ownerId, issueId, threadId, status, summary, key, finalArtifactId } = input

		if (status === IssueStatus.COMPLETED) {
			if (finalArtifactId) await this.assertSendableResult(input, finalArtifactId)
			await this.withTransaction(tx, async tx => {
				await this.domainEventRepository.save(
					new AgentRunCompletedEvent({
						entityId: issueId,
						ownerId,
						payload: { issueId, threadId, key, completedAt: new Date(), source: FactSource.DECLARED, summary, finalArtifactId },
					}),
					tx,
				)
			})
			return { issueId, status }
		}

		if (status === IssueStatus.NEEDS_INPUT) {
			const question =
				summary.length > 0
					? askQuestionOf(summary)
					: THREAD_MESSAGES.stopTitle(await conversationLanguage(this.threads, this.session, threadId), {
							kind: StopKind.DECISION_REQUESTED,
						})
			const { event } = askStopFact({
				ownerId,
				issueId,
				threadId,
				requested: StopKind.DECISION_REQUESTED,
				ask: { question, options: [], effects: [] },
				detail: summary,
			})
			await this.withTransaction(tx, async tx => {
				await this.domainEventRepository.save(event, tx)
			})
			return { issueId, status }
		}

		return { issueId, status }
	}

	/** The final artifact is this issue's and can go to the group — `RequestFeedback`'s checks, one answer for all. */
	private async assertSendableResult(input: this['input'], artifactId: string): Promise<void> {
		const artifact = await this.artifacts.findById(artifactId)
		if (!artifact || artifact.ownerId !== input.ownerId || artifact.threadId !== input.threadId || artifact.issueId !== input.issueId)
			throw new BaseError<ApplicationErrors>('ARTIFACT_NOT_FOUND', `no artifact ${artifactId} recorded by issue ${input.issueId}`)
		await this.sendability.check({ id: artifactId, kind: artifact.kind, ref: artifact.ref })
	}
}
