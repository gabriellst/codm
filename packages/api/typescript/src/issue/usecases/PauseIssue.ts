import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { IssueControlSource } from '@codm/contracts-typescript/wire/enums'
import { IssueRepository } from '../repositories/IssueRepository'
import { IssuePausedEvent } from '../events/IssuePausedEvent'
import type { ApplicationErrors } from '../errors'

export const PauseIssueInputSchema = z.object({
	ownerId: z.uuid(),
	issueId: z.uuid(),
	source: z.enum(IssueControlSource),
	/** Display name of who asked — the WhatsApp sender as the roster names them, or the console operator. */
	requestedBy: z.string().trim().min(1).optional(),
	/** Roster id of the WhatsApp sender, or the console user id. */
	requestedById: z.string().trim().min(1).optional(),
})
export const PauseIssueOutputSchema = z.void()

/**
 * PauseIssue — HOLD an issue's work, now (fase 2, item 2 — "pausa como comando").
 *
 * Two callers, one rule: the operator's console button (`PauseIssueController`) and a control word in
 * the conversation (`IngestChannelMessage`, inside the ingest transaction — hence the `tx`).
 *
 * The hold itself is the `paused` flag this commits; everything that makes it "vale na hora" reads that
 * flag, so it holds even if nothing else runs: the dispatcher defers the issue's turns (`IssueHold`),
 * and its external tools refuse with ISSUE_PAUSED. The `issue.paused` fact only ACCELERATES — its
 * handler kills a turn that is already running (`AbortIssueTurnOnPause`).
 */
@injectable()
export class PauseIssue extends Handler<typeof PauseIssueInputSchema, typeof PauseIssueOutputSchema> {
	readonly name = 'pause_issue' as const
	readonly inputSchema = PauseIssueInputSchema
	readonly outputSchema = PauseIssueOutputSchema

	constructor(private readonly issues: IssueRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		const issue = await this.issues.findById(input.issueId, tx)
		if (!issue || issue.ownerId !== input.ownerId) throw new BaseError<ApplicationErrors>('ISSUE_NOT_FOUND', `no issue ${input.issueId}`)
		issue.pause()
		await this.withTransaction(tx, async tx => {
			await this.issues.save(issue, tx)
			await this.domainEventRepository.save(
				new IssuePausedEvent({
					entityId: issue.id.value,
					ownerId: issue.ownerId,
					payload: {
						issueId: issue.id.value,
						threadId: issue.threadId,
						source: input.source,
						requestedBy: input.requestedBy,
						requestedById: input.requestedById,
					},
				}),
				tx,
			)
		})
	}
}
