/** One worktree of a repository, as `git worktree list --porcelain` lists it. */
export interface GitWorktree {
	/** The worktree's top directory, as git prints it. */
	path: string
	/** The repository's MAIN worktree — listed first by git; never a task's worktree. */
	main: boolean
}

/**
 * What the daemon asks git about worktrees (fase 4, item 1) — a QUERY, never a convention: a task's worktree is the
 * one git lists for the workspace, not a folder whose name looks like one (`.claude/worktrees/<x>`).
 *
 * `real` runs git; `mock` and `integration` are scripted and never spawn a process. Every answer git cannot give
 * (not a repository, git missing, a timeout) is `undefined` — and an unknown answer never registers anything.
 */
export abstract class GitWorktreeProbe {
	/** The top of the working tree that contains `cwd` (`git rev-parse --show-toplevel`). */
	abstract topLevel(cwd: string): Promise<string | undefined>

	/** The worktrees of the repository at `repositoryPath` (`git worktree list --porcelain`), the main one first. */
	abstract worktrees(repositoryPath: string): Promise<readonly GitWorktree[] | undefined>
}

/**
 * Parse `git worktree list --porcelain`: blocks separated by a blank line, each opening with `worktree <path>`. The
 * first block is the main worktree (git's documented order). Lines this reader does not need (`HEAD`, `branch`,
 * `locked`, `prunable`, `bare`) are ignored here; the janitor (S3) reads `locked` from the same output.
 */
export function parseWorktreeList(porcelain: string): GitWorktree[] {
	const paths = porcelain
		.split('\n')
		.filter(line => line.startsWith('worktree '))
		.map(line => line.slice('worktree '.length))
	return paths.map((path, index) => ({ path, main: index === 0 }))
}
