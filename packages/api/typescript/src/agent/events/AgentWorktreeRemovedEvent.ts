import { BaseDomainEvent, z } from '@codm/core-typescript'

export const AgentWorktreeRemovedEventSchema = z.domainEvent({
	issueId: z.string(),
	/** How much the data volume's free space grew across the removal — measured, not estimated. */
	freedBytes: z.number().int().nonnegative(),
})

/**
 * OBSERVED FACT: the janitor removed a closed task's git worktree (fase 4, item 1 — decisão do dono, 19/11). Only a
 * worktree REGISTERED for the task, closed for longer than `WORKTREE_CLEANUP_AFTER_MS`, listed by git, not locked and
 * clean — removed by `git worktree remove` without `--force`, its branch kept. The path stays out of the fact (it
 * names the owner's folders); the refusals stay in the log, never in the group.
 */
export class AgentWorktreeRemovedEvent extends BaseDomainEvent<typeof AgentWorktreeRemovedEventSchema> {
	static override readonly name = 'agent.worktree.removed' as const
	static readonly schema = AgentWorktreeRemovedEventSchema
}
