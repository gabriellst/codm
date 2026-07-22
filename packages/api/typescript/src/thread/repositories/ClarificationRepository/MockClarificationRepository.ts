import { injectable } from 'tsyringe-neo'
import { Id } from '@template/core-typescript'
import { ClarificationRepository, type ClarificationRow, type OpenClarificationInput } from './ClarificationRepository'

@injectable()
export class MockClarificationRepository extends ClarificationRepository {
	private rows: ClarificationRow[] = []

	async open(input: OpenClarificationInput): Promise<ClarificationRow> {
		const row: ClarificationRow = { id: Id.value(), askedAt: new Date(), resolvedAt: undefined, ...input }
		this.rows.push(row)
		return row
	}

	async findOpen(threadId: string, senderExternalId: string): Promise<ClarificationRow | undefined> {
		return this.rows.find(r => r.threadId === threadId && r.senderExternalId === senderExternalId && !r.resolvedAt)
	}

	async resolve(id: string): Promise<void> {
		const row = this.rows.find(r => r.id === id)
		if (row) row.resolvedAt = new Date()
	}
}
