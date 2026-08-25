import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { IssueStatus, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { Issue } from '../entities/Issue'
import { IssueRepository } from '../repositories/IssueRepository'

export const OpenIssueInputSchema = z.object({
	issueId: z.uuid(),
	ownerId: z.uuid(),
	threadId: z.uuid(),
	key: z.string().trim().min(1),
	title: z.string().trim().min(1),
	provider: z.enum(ProviderKind),
	/**
	 * Provenance, present ONLY on the fork path (§7.2): the entry that asked, and the words it asked in.
	 *
	 * Optional because this use case now has two callers with different knowledge.
	 * `integration.issue.created` (the fork) carries both; `integration.issue.opened` (a worker
	 * spawning a turn on work an agent separated out mid-run) carries neither and never will. The
	 * early-return below, plus the repository leaving these two columns out of its upsert `set`, is what
	 * keeps the second path from blanking what the first wrote (§6.2).
	 */
	originEntryId: z.uuid().optional(),
	goal: z.string().trim().min(1).optional(),
})

export const OpenIssueOutputSchema = z.object({ issueId: z.uuid(), key: z.string() })

/**
 * C21 OpenIssue — materializes the Issue aggregate from the terminal engine's
 * `integration.issue.opened` (the engine mints the issueId + slug key when it spawns the session).
 * Idempotent: a redelivered issue.opened for an existing issue is a no-op. BC5 does NOT re-publish
 * issue.opened — the terminal owns that execution fact.
 */
@injectable()
export class OpenIssue extends Handler<typeof OpenIssueInputSchema, typeof OpenIssueOutputSchema> {
	readonly name = 'open_issue' as const
	readonly inputSchema = OpenIssueInputSchema
	readonly outputSchema = OpenIssueOutputSchema

	constructor(private readonly issues: IssueRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const existing = await this.issues.findById(input.issueId)
		if (existing) return { issueId: existing.id.value, key: existing.key }

		return this.withTransaction(tx, async tx => {
			const issue = new Issue({
				ownerId: input.ownerId,
				threadId: input.threadId,
				key: input.key,
				title: input.title,
				status: IssueStatus.WORKING,
				provider: input.provider,
				archived: false,
				originEntryId: input.originEntryId,
				goal: input.goal,
				id: input.issueId,
			})
			await this.issues.save(issue, tx)
			return { issueId: issue.id.value, key: issue.key }
		})
	}
}
