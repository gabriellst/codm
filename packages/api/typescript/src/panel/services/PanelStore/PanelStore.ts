import type { Transaction } from '@codm/core-typescript'
import type { IssueLifeState, IssueStatus } from '@codm/contracts-typescript/wire/enums'
import type { Batch, PanelHealth } from '@shared/objects'

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
	/** Fase 5 — a failed turn's next attempt, and the supervisor's last escalation (pg 0009). */
	retryingAt: Date | null
	escalatedAt: Date | null
	archived: boolean
	timeline: unknown
	updatedAt: Date
}

export interface PanelBatchRow {
	threadId: string
	ownerId: string
	code: string
	batch: Batch
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
	/** Replace each batch whole, keyed by (group, code) — never another owner's. */
	abstract upsertBatches(batches: readonly PanelBatchRow[], tx?: Transaction): Promise<void>
	/** The daemon reported: its last contact, and its health badge when it sent one (absent keeps the last). */
	abstract touchDaemon(ownerId: string, at: Date, tx?: Transaction, health?: PanelHealth): Promise<void>
	abstract rotateToken(ownerId: string, threadId: string, token: string, tx?: Transaction): Promise<boolean>
	/** One issue of ONE group as last reported — nothing for an issue of another group or owner. */
	abstract findIssue(ownerId: string, threadId: string, issueId: string, tx?: Transaction): Promise<PanelIssueRow | undefined>
}
