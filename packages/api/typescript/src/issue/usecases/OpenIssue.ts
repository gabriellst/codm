import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import {
	AgentModelId,
	IssuePriority,
	IssueStatus,
	IssueWorkKind,
	PriorityReason,
	ProviderKind,
} from '@codm/contracts-typescript/wire/enums'
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
	/**
	 * Fase 4 — the read copy of what the task was born with, carried by `issue.created` only (absent on
	 * `issue.opened` and on facts from before fase 4). Write-once per field (`Issue.recordBirthAttributes`).
	 */
	priority: z.enum(IssuePriority).optional(),
	priorityReason: z.enum(PriorityReason).optional(),
	workKind: z.enum(IssueWorkKind).optional(),
	model: z.enum(AgentModelId).optional(),
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
		const birth = { priority: input.priority, priorityReason: input.priorityReason, workKind: input.workKind, model: input.model }
		const existing = await this.issues.findById(input.issueId)
		if (existing) {
			// The two births reconcile on one row in either order (§6.2): when `issue.opened` got here first, the row
			// has no birth attributes yet and `issue.created` fills them — and only them (write-once per field).
			if (Object.values(birth).some(value => value !== undefined)) {
				existing.recordBirthAttributes(birth)
				await this.withTransaction(tx, tx => this.issues.save(existing, tx))
			}
			return { issueId: existing.id.value, key: existing.key }
		}

		return this.withTransaction(tx, async tx => {
			const issue = new Issue({
				ownerId: input.ownerId,
				threadId: input.threadId,
				key: input.key,
				title: input.title,
				status: IssueStatus.WORKING,
				provider: input.provider,
				archived: false,
				paused: false,
				originEntryId: input.originEntryId,
				goal: input.goal,
				...birth,
				id: input.issueId,
			})
			await this.issues.save(issue, tx)
			return { issueId: issue.id.value, key: issue.key }
		})
	}
}
