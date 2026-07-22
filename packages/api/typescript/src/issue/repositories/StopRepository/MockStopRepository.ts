import { injectable } from 'tsyringe-neo'
import type { StopResolution } from '@codedm/contracts-typescript/wire/enums'
import { StopRepository, type RaiseStopInput, type StopRow } from './StopRepository'

@injectable()
export class MockStopRepository extends StopRepository {
	private rows: StopRow[] = []

	async raise(input: RaiseStopInput): Promise<StopRow> {
		const row: StopRow = { ...input, raisedAt: new Date(), resolution: undefined, resolvedAt: undefined }
		this.rows.push(row)
		return row
	}
	async findById(stopId: string): Promise<StopRow | undefined> {
		return this.rows.find(r => r.stopId === stopId)
	}
	async openByIssue(issueId: string): Promise<StopRow[]> {
		return this.rows.filter(r => r.issueId === issueId && !r.resolvedAt)
	}
	async openByThread(threadId: string): Promise<StopRow[]> {
		return this.rows.filter(r => r.threadId === threadId && !r.resolvedAt)
	}
	async resolve(stopId: string, resolution: StopResolution): Promise<void> {
		const row = this.rows.find(r => r.stopId === stopId)
		if (row) {
			row.resolution = resolution
			row.resolvedAt = new Date()
		}
	}
}
