import { injectable } from 'tsyringe-neo'
import { and, eq, isNull } from 'drizzle-orm'
import { DrizzleClient } from '@codedm/core-typescript'
import { threadClarifications } from '@codedm/contracts/db'
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
				// The id is minted HERE, in the repository. The sqlite schema has no db-side default
				// (the Go side owns the DDL and mints ids in code too), and `$defaultFn(randomUUID)`
				// on an id column is banned: an aggregate's identity must never be invented by the
				// persistence layer behind the caller's back. This table has no aggregate, so the
				// repository is the right place.
				id: crypto.randomUUID(),
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
