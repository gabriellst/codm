import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@codm/core-typescript'
import type { PanelHealth } from '@shared/objects'
import { PanelStore, type PanelBatchRow, type PanelGroupRow, type PanelIssueRow } from './PanelStore'

/** In-memory twin with the same upsert rules: token set once, owner never taken over, no going back in time. */
@injectable()
export class MockPanelStore extends PanelStore {
	private readonly groups = new Map<string, PanelGroupRow>()
	private readonly issues = new Map<string, PanelIssueRow>()
	private readonly daemons = new Map<string, Date>()
	private readonly health = new Map<string, PanelHealth>()
	private readonly batches = new Map<string, PanelBatchRow>()

	async upsertGroup(group: Omit<PanelGroupRow, 'token'>, token: string): Promise<string> {
		const existing = this.groups.get(group.threadId)
		if (!existing) {
			this.groups.set(group.threadId, { ...group, token })
			return token
		}
		if (existing.ownerId !== group.ownerId) return ''
		existing.name = group.name
		return existing.token
	}

	async upsertIssues(issues: readonly PanelIssueRow[]): Promise<void> {
		for (const issue of issues) {
			const existing = this.issues.get(issue.issueId)
			if (existing && (existing.ownerId !== issue.ownerId || existing.updatedAt > issue.updatedAt)) continue
			this.issues.set(issue.issueId, issue)
		}
	}

	async upsertBatches(batches: readonly PanelBatchRow[]): Promise<void> {
		for (const batch of batches) {
			const key = `${batch.threadId}:${batch.code}`
			const existing = this.batches.get(key)
			if (existing && existing.ownerId !== batch.ownerId) continue
			this.batches.set(key, batch)
		}
	}

	async touchDaemon(ownerId: string, at: Date, _tx?: Transaction, health?: PanelHealth): Promise<void> {
		this.daemons.set(ownerId, at)
		if (health) this.health.set(ownerId, health)
	}

	async rotateToken(ownerId: string, threadId: string, token: string): Promise<boolean> {
		const group = this.groups.get(threadId)
		if (!group || group.ownerId !== ownerId) return false
		group.token = token
		return true
	}

	async findIssue(ownerId: string, threadId: string, issueId: string): Promise<PanelIssueRow | undefined> {
		const issue = this.issues.get(issueId)
		return issue && issue.ownerId === ownerId && issue.threadId === threadId ? issue : undefined
	}
}
