import { injectable } from 'tsyringe-neo'
import { desc, eq } from 'drizzle-orm'
import { DrizzleClient } from '@codedm/core-typescript'
import { transcriptEntries } from '@codedm/contracts/db'
import type { TranscriptKind, ProviderKind, ClassificationMethod } from '@codedm/contracts-typescript/wire/enums'
import { TranscriptRepository, type AppendTranscriptInput, type TranscriptEntryRow } from './TranscriptRepository'

@injectable()
export class DrizzleTranscriptRepository extends TranscriptRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async append(input: AppendTranscriptInput, tx?: DrizzleClient): Promise<TranscriptEntryRow> {
		const dbc = tx ?? this.db
		const at = input.at ?? new Date()
		const rows = await dbc
			.insert(transcriptEntries)
			.values({
				ownerId: input.ownerId,
				threadId: input.threadId,
				kind: input.kind,
				text: input.text,
				issueId: input.issueId ?? null,
				quotedEntryId: input.quotedEntryId ?? null,
				senderExternalId: input.senderExternalId ?? null,
				provider: input.provider ?? null,
				classification: input.classification ?? null,
				at,
			})
			.returning()
		return this.toRow(rows[0]!)
	}

	async findById(entryId: string, tx?: DrizzleClient): Promise<TranscriptEntryRow | undefined> {
		const dbc = tx ?? this.db
		const rows = await dbc.select().from(transcriptEntries).where(eq(transcriptEntries.id, entryId)).limit(1)
		return rows[0] ? this.toRow(rows[0]) : undefined
	}

	async recentByThread(threadId: string, limit: number, tx?: DrizzleClient): Promise<TranscriptEntryRow[]> {
		const dbc = tx ?? this.db
		const rows = await dbc
			.select()
			.from(transcriptEntries)
			.where(eq(transcriptEntries.threadId, threadId))
			.orderBy(desc(transcriptEntries.at))
			.limit(limit)
		return rows.map(r => this.toRow(r)).reverse()
	}

	async listByThread(threadId: string, tx?: DrizzleClient): Promise<TranscriptEntryRow[]> {
		const dbc = tx ?? this.db
		const rows = await dbc.select().from(transcriptEntries).where(eq(transcriptEntries.threadId, threadId)).orderBy(transcriptEntries.at)
		return rows.map(r => this.toRow(r))
	}

	async listByIssue(issueId: string, tx?: DrizzleClient): Promise<TranscriptEntryRow[]> {
		const dbc = tx ?? this.db
		const rows = await dbc.select().from(transcriptEntries).where(eq(transcriptEntries.issueId, issueId)).orderBy(transcriptEntries.at)
		return rows.map(r => this.toRow(r))
	}

	async setIssueId(entryId: string, issueId: string, tx?: DrizzleClient): Promise<void> {
		const dbc = tx ?? this.db
		await dbc.update(transcriptEntries).set({ issueId }).where(eq(transcriptEntries.id, entryId))
	}

	private toRow(row: typeof transcriptEntries.$inferSelect): TranscriptEntryRow {
		return {
			entryId: row.id,
			ownerId: row.ownerId,
			threadId: row.threadId,
			kind: row.kind as TranscriptKind,
			text: row.text,
			issueId: row.issueId ?? undefined,
			quotedEntryId: row.quotedEntryId ?? undefined,
			senderExternalId: row.senderExternalId ?? undefined,
			provider: (row.provider ?? undefined) as ProviderKind | undefined,
			classification: (row.classification ?? undefined) as ClassificationMethod | undefined,
			at: row.at,
		}
	}
}
