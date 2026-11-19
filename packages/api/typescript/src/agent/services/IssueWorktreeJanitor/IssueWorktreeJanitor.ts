import { injectable } from 'tsyringe-neo'
import { realpathSync, statfsSync } from 'node:fs'
import { DatabaseDriver, DomainEventRepository, LoggingService } from '@codm/core-typescript'
import { IssueAttributesRepository } from '../../repositories/IssueAttributesRepository'
import { AgentWorktreeRemovedEvent } from '../../events/AgentWorktreeRemovedEvent'
import { GitWorktreeProbe } from '../GitWorktreeProbe'
import type { IssueAttributes } from '../../entities/IssueAttributes'
import { WorktreeKept } from '../../enums/WorktreeKept'

/** How long a task stays closed before its worktree may be removed — the owner's decision (19/11): seven days. */
export const WORKTREE_CLEANUP_AFTER_MS = 7 * 24 * 60 * 60 * 1000
/** How often the janitor sweeps (besides the boot): the disk it frees feeds the task slots' disk gate. */
export const WORKTREE_JANITOR_INTERVAL_MS = 60 * 60 * 1000

/** One sweep, counted. */
export interface WorktreeSweep {
	removed: number
	kept: number
}

/** The real path of a folder, or `undefined` when it does not exist (any doubt keeps the folder). */
function realPathOf(path: string): string | undefined {
	try {
		return realpathSync(path)
	} catch {
		return undefined
	}
}

/** Free bytes of the volume holding `path` — 0 when it cannot be read (a removal then reports 0 freed). */
function freeBytesAt(path: string): number {
	try {
		const stats = statfsSync(path)
		return Number(stats.bavail) * Number(stats.bsize)
	} catch {
		return 0
	}
}

/**
 * THE WORKTREE JANITOR (fase 4, item 1 — decisão do dono, 19/11): removes the git worktree of a task closed for more
 * than `WORKTREE_CLEANUP_AFTER_MS`, so the disk the task slots 5–6 need is freed by cleaning, never by lowering the
 * gate. The codm creates no worktree itself — the provider CLI does, inside the repository — so only a worktree
 * REGISTERED for the task (`agent_issue_attributes.worktree_path`, from the hook's declared `cwd`) is ever a
 * candidate; a folder's name means nothing.
 *
 * Every doubt keeps the folder. The database half (`worktreeCandidates`): registered, closed long enough, no queue
 * item after the closing (a reopening), no unclosed task sharing it. The git half, asked right before removing: git
 * still lists it, it is not the main worktree, it is not locked, and `git status --porcelain --untracked-files=all`
 * is empty. Then `git worktree remove` WITHOUT `--force` — git refuses a dirty tree on its own — and the branch is
 * kept. A removal is the fact `agent.worktree.removed { issueId, freedBytes }`.
 */
@injectable()
export class IssueWorktreeJanitor {
	constructor(
		private readonly attributes: IssueAttributesRepository,
		private readonly git: GitWorktreeProbe,
		private readonly driver: DatabaseDriver,
		private readonly events: DomainEventRepository,
		private readonly logging: LoggingService,
	) {}

	/** Sweep once at `now`: every candidate is judged and, when nothing is in doubt, removed. Never rejects. */
	async sweep(now: Date = new Date()): Promise<WorktreeSweep> {
		const result: WorktreeSweep = { removed: 0, kept: 0 }
		let candidates: IssueAttributes[]
		try {
			candidates = await this.attributes.worktreeCandidates(new Date(now.getTime() - WORKTREE_CLEANUP_AFTER_MS))
		} catch (error) {
			this.logging.error({ content: { message: 'worktree janitor could not read its candidates', error: String(error) } })
			return result
		}
		for (const candidate of candidates) {
			try {
				const kept = await this.removeIfSafe(candidate)
				if (kept === undefined) result.removed++
				else {
					result.kept++
					this.logging.info({ content: { message: 'worktree janitor kept a closed task’s worktree', issueId: candidate.issueId, kept } })
				}
			} catch (error) {
				result.kept++
				this.logging.error({
					content: { message: 'worktree janitor failed on a candidate — kept', issueId: candidate.issueId, error: String(error) },
				})
			}
		}
		return result
	}

	/** Remove the candidate's worktree when git confirms nothing is in doubt; otherwise say why it was kept. */
	private async removeIfSafe(candidate: IssueAttributes): Promise<WorktreeKept | undefined> {
		const registered = candidate.worktreePath
		const real = registered ? realPathOf(registered) : undefined
		if (!registered || !real) return WorktreeKept.NOT_LISTED
		const listing = await this.git.worktrees(real)
		const entry = listing?.find(worktree => realPathOf(worktree.path) === real)
		const main = listing?.find(worktree => worktree.main)
		if (!entry || !main) return WorktreeKept.NOT_LISTED
		if (entry.main) return WorktreeKept.MAIN
		if (entry.locked) return WorktreeKept.LOCKED
		if ((await this.git.isClean(entry.path)) !== true) return WorktreeKept.DIRTY

		const freeBefore = freeBytesAt(main.path)
		if (!(await this.git.remove(main.path, entry.path))) return WorktreeKept.GIT_REFUSED
		const freedBytes = Math.max(0, freeBytesAt(main.path) - freeBefore)

		candidate.forgetWorktree()
		await this.driver.unitOfWorkFactory.create().transaction(async tx => {
			await this.attributes.save(candidate, tx)
			await this.events.save(
				new AgentWorktreeRemovedEvent({
					entityId: candidate.issueId,
					ownerId: candidate.ownerId,
					payload: { issueId: candidate.issueId, freedBytes },
				}),
				tx,
			)
		})
		this.logging.info({ content: { message: 'worktree janitor removed a closed task’s worktree', issueId: candidate.issueId, freedBytes } })
		return undefined
	}
}
