import { injectable } from 'tsyringe-neo'
import { execFile } from 'node:child_process'
import { GitWorktreeProbe, parseWorktreeList, type GitWorktree } from './GitWorktreeProbe'

/** A git question that takes longer than this is not answered — and an unanswered question registers nothing. */
const GIT_PROBE_TIMEOUT_MS = 5_000

/** Run git by argv (no shell) in `cwd`; `undefined` on any failure — not a repository, git missing, a timeout. */
function git(cwd: string, args: readonly string[]): Promise<string | undefined> {
	return new Promise(resolve => {
		execFile('git', args, { cwd, timeout: GIT_PROBE_TIMEOUT_MS, windowsHide: true }, (error, stdout) => {
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
}
