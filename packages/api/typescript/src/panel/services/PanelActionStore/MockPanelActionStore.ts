import { injectable } from 'tsyringe-neo'
import type { PanelActionOutcome } from '@shared/schemas'
import { PanelActionStore, type PanelActionRow } from './PanelActionStore'

/** In-memory twin with the same conditional rules (owner-scoped, handed out once per window, first outcome wins). */
@injectable()
export class MockPanelActionStore extends PanelActionStore {
	private readonly rows = new Map<string, PanelActionRow>()

	async insert(row: PanelActionRow): Promise<void> {
		this.rows.set(row.id, structuredClone(row))
	}

	async requestTimes(sessionHash: string, since: Date): Promise<Date[]> {
		return [...this.rows.values()].filter(row => row.sessionHash === sessionHash && row.requestedAt >= since).map(row => row.requestedAt)
	}

	async find(id: string): Promise<PanelActionRow | undefined> {
		const row = this.rows.get(id)
		return row ? structuredClone(row) : undefined
	}

	async handOut(ownerId: string, now: Date, askedSince: Date, redeliverBefore: Date): Promise<PanelActionRow[]> {
		const due = [...this.rows.values()]
			.filter(
				row =>
					row.ownerId === ownerId &&
					row.outcome === null &&
					row.requestedAt >= askedSince &&
					(row.deliveredAt === null || row.deliveredAt < redeliverBefore),
			)
			.sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime())
		for (const row of due) row.deliveredAt = now
		return due.map(row => structuredClone(row))
	}

	async recordOutcome(ownerId: string, outcome: PanelActionOutcome, at: Date): Promise<boolean> {
		const row = this.rows.get(outcome.actionId)
		if (!row || row.ownerId !== ownerId || row.outcome !== null) return false
		Object.assign(row, { outcome: outcome.status, outcomeCode: outcome.code ?? null, outcomeAt: at })
		return true
	}

	async revokeGroup(threadId: string): Promise<void> {
		for (const [id, row] of this.rows) if (row.threadId === threadId) this.rows.delete(id)
	}

	async purge(ownerId: string, before: Date): Promise<void> {
		for (const [id, row] of this.rows) if (row.ownerId === ownerId && row.requestedAt < before) this.rows.delete(id)
	}
}
