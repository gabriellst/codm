import { injectable } from 'tsyringe-neo'
import { execFile } from 'node:child_process'
import { GitWorktreeProbe, parseWorktreeList, type GitWorktree } from './GitWorktreeProbe'

/** A git question that takes longer than this is not answered — and an unanswered question registers nothing. */
const GIT_PROBE_TIMEOUT_MS = 5_000
/**
 * The janitor's git calls walk or delete a whole working tree — gigabytes of build output in a real task's worktree.
 * A removal killed half-way leaves a tree git then reads as dirty forever, so they get minutes, not seconds.
 */
const GIT_TREE_TIMEOUT_MS = 10 * 60 * 1000

/** Run git by argv (no shell) in `cwd`; `undefined` on any failure — not a repository, git missing, a timeout. */
function git(cwd: string, args: readonly string[], timeout = GIT_PROBE_TIMEOUT_MS): Promise<string | undefined> {
	return new Promise(resolve => {
		execFile('git', args, { cwd, timeout, windowsHide: true, maxBuffer: 64 * 1024 * 1024 }, (error, stdout) => {
			resolve(error ? undefined : stdout)
		})
	})
}

/** The probe that asks git itself. Only the `real` environment binds it. */
@injectable()
export class SystemGitWorktreeProbe extends GitWorktreeProbe {
	async topLevel(cwd: string): Promise<string | undefined> {
		const out = await git(cwd, ['rev-parse', '--show-toplevel'])
		const top = out?.trim()
		return top ? top : undefined
	}

	async worktrees(repositoryPath: string): Promise<readonly GitWorktree[] | undefined> {
		const out = await git(repositoryPath, ['worktree', 'list', '--porcelain'])
		return out === undefined ? undefined : parseWorktreeList(out)
	}

	async isClean(worktreePath: string): Promise<boolean | undefined> {
		const out = await git(worktreePath, ['status', '--porcelain', '--untracked-files=all'], GIT_TREE_TIMEOUT_MS)
		return out === undefined ? undefined : out.trim().length === 0
	}

	async remove(mainWorktreePath: string, worktreePath: string): Promise<boolean> {
		// No `--force`, ever: git refuses a tree with changes, untracked files or a lock — the last line of defence.
		return (await git(mainWorktreePath, ['worktree', 'remove', worktreePath], GIT_TREE_TIMEOUT_MS)) !== undefined
	}
}
