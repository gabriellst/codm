import { injectable } from 'tsyringe-neo'
import { and, eq, isNull } from 'drizzle-orm'
import { DrizzleClient } from '@template/core-typescript'
import { threadClarifications } from '@template/contracts/db'
import { ClarificationRepository, type ClarificationRow, type OpenClarificationInput } from './ClarificationRepository'

@injectable()
export class DrizzleClarificationRepository extends ClarificationRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async open(input: OpenClarificationInput, tx?: DrizzleClient): Promise<ClarificationRow> {
		const dbc = tx ?? this.db
		const rows = await dbc
			.insert(threadClarifications)
			.values({
				ownerId: input.ownerId,
				threadId: input.threadId,
				entryId: input.entryId,
				senderExternalId: input.senderExternalId,
				question: input.question,
				candidateIssueIds: input.candidateIssueIds,
			})
			.returning()
		return this.toRow(rows[0]!)
	}

	async findOpen(threadId: string, senderExternalId: string, tx?: DrizzleClient): Promise<ClarificationRow | undefined> {
		const dbc = tx ?? this.db
		const rows = await dbc
			.select()
			.from(threadClarifications)
			.where(
				and(
					eq(threadClarifications.threadId, threadId),
					eq(threadClarifications.senderExternalId, senderExternalId),
					isNull(threadClarifications.resolvedAt),
				),
			)
			.limit(1)
		return rows[0] ? this.toRow(rows[0]) : undefined
	}

	async resolve(id: string, tx?: DrizzleClient): Promise<void> {
		const dbc = tx ?? this.db
		await dbc.update(threadClarifications).set({ resolvedAt: new Date() }).where(eq(threadClarifications.id, id))
	}

	private toRow(row: typeof threadClarifications.$inferSelect): ClarificationRow {
		return {
			id: row.id,
			ownerId: row.ownerId,
			threadId: row.threadId,
			entryId: row.entryId,
			senderExternalId: row.senderExternalId,
			question: row.question,
			candidateIssueIds: row.candidateIssueIds as string[],
			askedAt: row.askedAt,
			resolvedAt: row.resolvedAt ?? undefined,
		}
	}
}
