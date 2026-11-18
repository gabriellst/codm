import { injectable } from 'tsyringe-neo'
import { PanelActionLedger, type PanelActionLedgerRow } from './PanelActionLedger'

/** In-memory twin: first record wins, unreported until marked. */
@injectable()
export class MockPanelActionLedger extends PanelActionLedger {
	private readonly rows = new Map<string, PanelActionLedgerRow & { reportedAt?: Date }>()

	async record(row: PanelActionLedgerRow): Promise<boolean> {
		if (this.rows.has(row.actionId)) return false
		this.rows.set(row.actionId, { ...row })
		return true
	}

	async find(actionId: string): Promise<PanelActionLedgerRow | undefined> {
		const row = this.rows.get(actionId)
		if (!row) return undefined
		const { reportedAt: _reported, ...rest } = row
		return rest
	}

	async unreported(limit: number): Promise<PanelActionLedgerRow[]> {
		return [...this.rows.values()]
			.filter(row => !row.reportedAt)
			.sort((a, b) => a.executedAt.getTime() - b.executedAt.getTime())
			.slice(0, limit)
			.map(({ reportedAt: _reported, ...rest }) => rest)
	}

	async markReported(actionIds: readonly string[], at: Date): Promise<void> {
		for (const id of actionIds) {
			const row = this.rows.get(id)
			if (row) row.reportedAt = at
		}
	}

	async purge(before: Date): Promise<void> {
		for (const [id, row] of this.rows) if (row.reportedAt && row.executedAt < before) this.rows.delete(id)
	}
}
