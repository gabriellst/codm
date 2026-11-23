/**
 * WHY THE WORKTREE JANITOR LEFT A CLOSED TASK'S WORKTREE ON DISK (fase 4, item 1) — logged, never told to the group.
 * Every doubt is one of these, and every one of them keeps the folder.
 *  - `NOT_LISTED` — the folder is gone, or git no longer lists it as a worktree of its repository.
 *  - `MAIN` — it is the repository's main worktree.
 *  - `LOCKED` — somebody locked it (`git worktree lock`).
 *  - `DIRTY` — it has a change or an untracked file, or git could not say.
 *  - `GIT_REFUSED` — `git worktree remove` (without `--force`) refused.
 */
export enum WorktreeKept {
	NOT_LISTED = 'NOT_LISTED',
	MAIN = 'MAIN',
	LOCKED = 'LOCKED',
	DIRTY = 'DIRTY',
	GIT_REFUSED = 'GIT_REFUSED',
}
