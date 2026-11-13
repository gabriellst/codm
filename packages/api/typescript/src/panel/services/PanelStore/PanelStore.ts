import type { Transaction } from '@codm/core-typescript'
import type { IssueLifeState, IssueStatus } from '@codm/contracts-typescript/wire/enums'

export interface PanelGroupRow {
	threadId: string
	ownerId: string
	name: string
	token: string
}

export interface PanelIssueRow {
	issueId: string
	ownerId: string
	threadId: string
	key: string
	title: string
	status: IssueStatus
	lifeState: IssueLifeState
	waitingForProviderUntil: Date | null
	archived: boolean
	timeline: unknown
	updatedAt: Date
}

/**
 * The cloud snapshot of the daemon's issues, per group. Writes are UPSERTS keyed by id — the daemon may
 * resend anything (a retry, a restart) and the result is the same.
 */
export abstract class PanelStore {
	/** Insert the group with `token` if new, else refresh its name. Returns the group's CURRENT token. */
	abstract upsertGroup(group: Omit<PanelGroupRow, 'token'>, token: string, tx?: Transaction): Promise<string>
	abstract upsertIssues(issues: readonly PanelIssueRow[], tx?: Transaction): Promise<void>
	abstract touchDaemon(ownerId: string, at: Date, tx?: Transaction): Promise<void>
	abstract rotateToken(ownerId: string, threadId: string, token: string, tx?: Transaction): Promise<boolean>
}
