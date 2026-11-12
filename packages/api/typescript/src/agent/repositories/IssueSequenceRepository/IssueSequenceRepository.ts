import type { Transaction } from '@codm/core-typescript'

/**
 * Hands out the number behind an issue's short key (`<PREFIX>-<n>`), per workspace, gap-free in practice
 * and never reused.
 *
 * Called inside the write transaction that forks the issue, so the number and the WORK item commit
 * together: SQLite serializes writers, so two forks never draw the same number, and a rolled-back fork
 * returns its number with it.
 */
export abstract class IssueSequenceRepository {
	/** The next number for `workspaceId` — 1 for a workspace's first issue. */
	abstract next(workspaceId: string, tx?: Transaction): Promise<number>
}
