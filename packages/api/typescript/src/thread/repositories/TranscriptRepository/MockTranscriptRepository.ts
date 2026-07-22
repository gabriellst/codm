import { injectable } from 'tsyringe-neo'
import { Id } from '@template/core-typescript'
import { TranscriptRepository, type AppendTranscriptInput, type TranscriptEntryRow } from './TranscriptRepository'

@injectable()
export class MockTranscriptRepository extends TranscriptRepository {
	private rows: TranscriptEntryRow[] = []

	async append(input: AppendTranscriptInput): Promise<TranscriptEntryRow> {
		const row: TranscriptEntryRow = {
			entryId: Id.value(),
			ownerId: input.ownerId,
			threadId: input.threadId,
			kind: input.kind,
			text: input.text,
			issueId: input.issueId,
			quotedEntryId: input.quotedEntryId,
			senderExternalId: input.senderExternalId,
			provider: input.provider,
			classification: input.classification,
			at: input.at ?? new Date(),
		}
		this.rows.push(row)
		return row
	}

	async findById(entryId: string): Promise<TranscriptEntryRow | undefined> {
		return this.rows.find(r => r.entryId === entryId)
	}

	async recentByThread(threadId: string, limit: number): Promise<TranscriptEntryRow[]> {
		return this.rows.filter(r => r.threadId === threadId).slice(-limit)
	}

	async listByThread(threadId: string): Promise<TranscriptEntryRow[]> {
		return this.rows.filter(r => r.threadId === threadId)
	}

	async listByIssue(issueId: string): Promise<TranscriptEntryRow[]> {
		return this.rows.filter(r => r.issueId === issueId)
	}

	async setIssueId(entryId: string, issueId: string): Promise<void> {
		const row = this.rows.find(r => r.entryId === entryId)
		if (row) row.issueId = issueId
	}
}
