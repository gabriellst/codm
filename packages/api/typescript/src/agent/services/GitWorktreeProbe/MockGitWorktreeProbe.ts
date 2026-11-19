import { injectable } from 'tsyringe-neo'
import { GitWorktreeProbe, type GitWorktree } from './GitWorktreeProbe'

/**
 * The scripted probe of the test environments — never spawns git. Knows nothing until a test scripts it: a `cwd`
 * with no scripted top is "not a repository", a repository with no scripted list has no worktrees to offer. A top
 * may be scripted as a pending answer (a promise), which is how a test stands in for a git call that hangs.
 */
@injectable()
export class MockGitWorktreeProbe extends GitWorktreeProbe {
	private readonly tops = new Map<string, string | Promise<string | undefined>>()
	private readonly lists = new Map<string, readonly GitWorktree[]>()

	/** Script `cwd` as lying inside the working tree whose top is `top` — or as a git answer still pending. */
	scriptTopLevel(cwd: string, top: string | Promise<string | undefined>): void {
		this.tops.set(cwd, top)
	}

	/** Script the worktree list of the repository at `repositoryPath` (main first). */
	scriptWorktrees(repositoryPath: string, worktrees: readonly GitWorktree[]): void {
		this.lists.set(repositoryPath, worktrees)
	}

	async topLevel(cwd: string): Promise<string | undefined> {
		return this.tops.get(cwd)
	}

	async worktrees(repositoryPath: string): Promise<readonly GitWorktree[] | undefined> {
		return this.lists.get(repositoryPath)
	}
}
