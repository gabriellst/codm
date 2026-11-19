/** One worktree of a repository, as `git worktree list --porcelain` lists it. */
export interface GitWorktree {
	/** The worktree's top directory, as git prints it. */
	path: string
	/** The repository's MAIN worktree — listed first by git; never a task's worktree. */
	main: boolean
	/** `git worktree lock`ed (`locked` or `locked <reason>`) — somebody asked git to keep it; never removed. */
	locked: boolean
}

/** Where a working tree stands (fase 4, item 6a — the derived handoff notes): its branch and what changed. */
export interface GitWorkingState {
	/** The checked-out branch; absent on a detached HEAD. */
	branch?: string
	/** `git status --porcelain` lines (`XY path`), in git's order. */
	changes: readonly string[]
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

	/**
	 * Whether the working tree at `worktreePath` has NOTHING to lose — `git status --porcelain --untracked-files=all`
	 * prints nothing: no change, staged or not, and no untracked file. `undefined` when git cannot say.
	 */
	abstract isClean(worktreePath: string): Promise<boolean | undefined>

	/**
	 * `git worktree remove <worktreePath>` from the main worktree — WITHOUT `--force`, so git itself refuses a dirty
	 * or locked tree, and the branch is kept (its commits stay in the repository). `true` only when git removed it.
	 */
	abstract remove(mainWorktreePath: string, worktreePath: string): Promise<boolean>

	/**
	 * The branch and the changes of the working tree at `cwd` (`git status --porcelain --branch`) — what a fresh session
	 * needs to know about the tree it continues in. `undefined` when git cannot say.
	 */
	abstract workingState(cwd: string): Promise<GitWorkingState | undefined>
}

/**
 * Parse `git status --porcelain --branch`: the `## ` header names the branch (`main...origin/main [ahead 1]`,
 * `No commits yet on main`, `HEAD (no branch)` when detached); every other line is a change.
 */
export function parseWorkingState(porcelain: string): GitWorkingState {
	const lines = porcelain.split('\n').filter(line => line.length > 0)
	const header = lines.find(line => line.startsWith('## '))?.slice('## '.length)
	const changes = lines.filter(line => !line.startsWith('## '))
	if (!header || header.startsWith('HEAD (no branch)')) return { changes }
	const unborn = 'No commits yet on '
	const named = header.startsWith(unborn) ? header.slice(unborn.length) : header
	const branch = named.split('...')[0]?.split(' ')[0]
	return branch ? { branch, changes } : { changes }
}

/**
 * Parse `git worktree list --porcelain`: blocks separated by a blank line, each opening with `worktree <path>`. The
 * first block is the main worktree (git's documented order). `locked` (bare, or followed by a reason) marks a locked
 * worktree; the lines this reader does not need (`HEAD`, `branch`, `prunable`, `bare`) are ignored.
 */
export function parseWorktreeList(porcelain: string): GitWorktree[] {
	const blocks = porcelain
		.split(/\n\s*\n/)
		.map(block => block.split('\n').filter(line => line.length > 0))
		.filter(lines => lines[0]?.startsWith('worktree '))
	return blocks.map((lines, index) => ({
		path: lines[0]!.slice('worktree '.length),
		main: index === 0,
		locked: lines.some(line => line === 'locked' || line.startsWith('locked ')),
	}))
}
