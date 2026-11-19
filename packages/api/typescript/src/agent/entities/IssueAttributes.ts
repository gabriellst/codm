import { BaseEntity, z } from '@codm/core-typescript'
import type Z from 'zod'
import { AgentModelId, IssuePriority, IssueWorkKind, PriorityReason } from '@codm/contracts-typescript/wire/enums'

export const IssueAttributesSchema = z.object({
	ownerId: z.string().min(1),
	threadId: z.string().min(1),
	priority: z.enum(IssuePriority),
	priorityReason: z.enum(PriorityReason),
	workKind: z.enum(IssueWorkKind),
	/** Absent ⇒ the task inherits the conversation's model (every task until slice S7). */
	model: z.enum(AgentModelId).optional(),
	/**
	 * The git worktree the task's session works in, as REGISTERED from the hook's declared `cwd` — only when git
	 * lists it as a secondary worktree of the workspace; never inferred from a folder name. Absent ⇒ nothing is
	 * ever removed for this task.
	 */
	worktreePath: z.string().min(1).optional(),
	worktreeSeenAt: z.date().optional(),
	/** When the task was completed or archived — the start of its worktree's grace period. */
	closedAt: z.date().optional(),
})
export type IssueAttributesProps = Z.input<typeof IssueAttributesSchema>

/** What a birth declares — the task's id and conversation, and what it is born with. */
export type IssueBirth = { issueId: string } & Pick<
	IssueAttributesProps,
	'ownerId' | 'threadId' | 'priority' | 'priorityReason' | 'workKind' | 'model'
>

/**
 * What a task is born with when its birth declares nothing — the spec's `NORMAL` / `DEFAULT` / `CHANGE`, the same
 * values migration 0037 backfilled for every issue that existed before the table. One declaration, read by every
 * birth (`ForkIssue`, `DeclareIssueOpen` — and through it `CreateIssue`).
 */
export const ISSUE_ATTRIBUTE_DEFAULTS = {
	priority: IssuePriority.NORMAL,
	priorityReason: PriorityReason.DEFAULT,
	workKind: IssueWorkKind.CHANGE,
} as const satisfies Pick<IssueAttributesProps, 'priority' | 'priorityReason' | 'workKind'>

/**
 * `IssueAttributes` (agent, fase 4) — what the agent runtime fixed about a task when it was BORN (priority and why,
 * kind of work, model), plus what it learned about it since: the worktree its session registered and when it closed.
 * Identity is the issue's id. One row of `agent_issue_attributes`.
 *
 * The birth is WRITE-ONCE: nothing here changes priority, reason, kind or model after `born`, and the repository's
 * upsert never touches those columns. What moves are the two stamps, through the two behaviors below. No version
 * column on the table: the stamps are last-writer-wins by nature (the latest worktree seen, the latest closing),
 * so there is no concurrent edit to arbitrate.
 */
export class IssueAttributes extends BaseEntity<typeof IssueAttributesSchema> {
	static override schema = IssueAttributesSchema

	declare ownerId: string
	declare threadId: string
	declare priority: IssuePriority
	declare priorityReason: PriorityReason
	declare workKind: IssueWorkKind
	declare model: AgentModelId | undefined
	declare worktreePath: string | undefined
	declare worktreeSeenAt: Date | undefined
	declare closedAt: Date | undefined

	/** A task's attributes at birth — what its birth declared (defaults applied by the caller). */
	static born({ issueId, ...birth }: IssueBirth): IssueAttributes {
		return new IssueAttributes({ ...birth, id: issueId })
	}

	get issueId(): string {
		return this.id.value
	}

	/** The session works in `worktreePath` (registered from the hook), seen at `seenAt`. The latest sighting wins. */
	registerWorktree(worktreePath: string, seenAt: Date): void {
		this.worktreePath = worktreePath
		this.worktreeSeenAt = seenAt
	}

	/** The task completed or was archived at `closedAt`. A task reopened and closed again moves it forward. */
	close(closedAt: Date): void {
		this.closedAt = closedAt
	}
}
