import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codm/core-typescript'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { WorkspaceRepository } from '@workspace/repositories/WorkspaceRepository'
import { IssueAttributesRepository } from '../repositories/IssueAttributesRepository'
import { GitWorktreeProbe } from '../services/GitWorktreeProbe'

export const RecordIssueWorktreeInputSchema = z.object({
	issueId: z.string(),
	threadId: z.string(),
	/** The `cwd` the provider CLI DECLARED on the hook call — where the session's shell command runs. */
	cwd: z.string().min(1),
	/** When the hook saw it. */
	seenAt: z.date(),
})

/** `registered` ⇒ the task's worktree is now `worktreePath`; otherwise nothing was written. */
export const RecordIssueWorktreeOutputSchema = z.object({ registered: z.boolean(), worktreePath: z.string().optional() })

/**
 * REGISTER THE TASK'S WORKTREE (fase 4, item 1) — the link task → worktree is RECORDED from what the CLI declared,
 * never inferred from a folder name (`.claude/worktrees/<x>`) nor from the workspace path (Non-Negotiable 5).
 *
 * codm does not create worktrees: the provider CLI does, inside the workspace's repository. The hook tells us the
 * `cwd` of each shell command, and this use case asks git two questions: the top of the working tree that `cwd` is
 * in, and the worktrees of the WORKSPACE's repository. The top is registered only when it is one of those and NOT
 * the main one — the janitor (S3) may later remove a registered worktree, so a path that is not provably a
 * secondary worktree of this workspace is never written. Any unknown answer (not a repository, git failing, the
 * thread or workspace gone) registers nothing.
 *
 * Called off the hook's response path (`PreToolHookController` answers first, then `WorktreeSightings` schedules
 * this), so git never delays nor decides what the CLI is told.
 */
@injectable()
export class RecordIssueWorktree extends Handler<typeof RecordIssueWorktreeInputSchema, typeof RecordIssueWorktreeOutputSchema> {
	readonly name = 'record_issue_worktree' as const
	readonly inputSchema = RecordIssueWorktreeInputSchema
	readonly outputSchema = RecordIssueWorktreeOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly workspaces: WorkspaceRepository,
		private readonly git: GitWorktreeProbe,
		private readonly attributes: IssueAttributesRepository,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const thread = await this.threads.findById(input.threadId)
		const workspace = thread ? await this.workspaces.findById(thread.workspaceId) : undefined
		if (!workspace) return { registered: false }

		const top = await this.git.topLevel(input.cwd)
		if (!top) return { registered: false }
		const worktrees = await this.git.worktrees(workspace.path)
		const secondary = worktrees?.find(worktree => worktree.path === top && !worktree.main)
		if (!secondary) return { registered: false }

		const attributes = await this.attributes.findByIssueId(input.issueId)
		if (!attributes) return { registered: false }
		attributes.registerWorktree(secondary.path, input.seenAt)
		await this.attributes.save(attributes)
		return { registered: true, worktreePath: secondary.path }
	}
}
