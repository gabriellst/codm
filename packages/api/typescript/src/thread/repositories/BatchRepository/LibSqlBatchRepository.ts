import { injectable } from 'tsyringe-neo'
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm'
import { LibSqlDatabaseDriver, tryCatchAsync, type LibSqlTransaction } from '@codm/core-typescript'
import { batchItems, batches } from '@codm/contracts/db'
import { BatchStatus } from '@codm/contracts-typescript/wire/enums'
import { BatchItemDestinationSchema } from '@shared/objects'
import { Batch, linkedIssueOf } from '../../entities/Batch'
import { BatchRepository } from './BatchRepository'

/**
 * `thread_batches` + `thread_batch_items`. `save` writes the batch row and EVERY item row — destination, the issue it
 * names and `recorded_at` — in the caller's transaction: the issue timeline's `BATCH_LINKED` reads exactly those two
 * item columns (`issue_id`, `recorded_at`), so an item saved without them would never show on the timeline.
 */
@injectable()
export class LibSqlBatchRepository extends BatchRepository {
	constructor(private driver: LibSqlDatabaseDriver) {
		super()
	}

	async findById(id: string, tx?: LibSqlTransaction): Promise<Batch | undefined> {
		const dbc = tx ?? this.driver.db
		const [row] = await dbc.select().from(batches).where(eq(batches.id, id)).limit(1)
		return row ? (await this.hydrate([row], tx))[0] : undefined
	}

	async findByCode(threadId: string, code: string, tx?: LibSqlTransaction): Promise<Batch | undefined> {
		const dbc = tx ?? this.driver.db
		const [row] = await dbc
			.select()
			.from(batches)
			.where(and(eq(batches.threadId, threadId), eq(batches.code, code)))
			.limit(1)
		return row ? (await this.hydrate([row], tx))[0] : undefined
	}

	async findIncomplete(since: Date, until: Date, tx?: LibSqlTransaction): Promise<Batch[]> {
		const dbc = tx ?? this.driver.db
		const rows = await dbc
			.select()
			.from(batches)
			.where(and(eq(batches.status, BatchStatus.INCOMPLETE), gte(batches.createdAt, since), lte(batches.createdAt, until)))
			.orderBy(asc(batches.createdAt))
		return this.hydrate(rows, tx)
	}

	async save(entity: Batch, tx?: LibSqlTransaction): Promise<Batch> {
		const write = async (dbc: LibSqlTransaction) => {
			const row = {
				id: entity.id.value,
				ownerId: entity.ownerId,
				threadId: entity.threadId,
				code: entity.code,
				seq: entity.seq,
				sourceEntryId: entity.sourceEntryId,
				itemCount: entity.items.length,
				status: entity.status,
				receiptEntryId: entity.receiptEntryId ?? null,
				createdAt: entity.createdAt,
				updatedAt: new Date(),
				version: entity.version,
			}
			await dbc
				.insert(batches)
				.values(row)
				.onConflictDoUpdate({
					target: batches.id,
					set: { status: row.status, receiptEntryId: row.receiptEntryId, updatedAt: row.updatedAt, version: row.version },
				})
			for (const item of entity.items) {
				const values = {
					batchId: entity.id.value,
					n: item.n,
					excerpt: item.excerpt,
					destination: item.destination ?? null,
					issueId: item.destination ? (linkedIssueOf(item.destination) ?? null) : null,
					recordedAt: item.recordedAt ?? null,
				}
				await dbc
					.insert(batchItems)
					.values(values)
					.onConflictDoUpdate({
						target: [batchItems.batchId, batchItems.n],
						set: { destination: values.destination, issueId: values.issueId, recordedAt: values.recordedAt },
					})
			}
		}
		const result = await tryCatchAsync(async () => (tx ? write(tx) : this.driver.transaction(write)))
		if (!result.success) throw result.error
		return entity
	}

	async delete(id: string, tx?: LibSqlTransaction): Promise<void> {
		const remove = async (dbc: LibSqlTransaction) => {
			await dbc.delete(batchItems).where(eq(batchItems.batchId, id))
			await dbc.delete(batches).where(eq(batches.id, id))
		}
		await (tx ? remove(tx) : this.driver.transaction(remove))
	}

	private async hydrate(rows: (typeof batches.$inferSelect)[], tx?: LibSqlTransaction): Promise<Batch[]> {
		if (rows.length === 0) return []
		const dbc = tx ?? this.driver.db
		const items = await dbc
			.select()
			.from(batchItems)
			.where(
				inArray(
					batchItems.batchId,
					rows.map(row => row.id),
				),
			)
			.orderBy(asc(batchItems.n))
		return rows.map(
			row =>
				new Batch({
					id: row.id,
					ownerId: row.ownerId,
					threadId: row.threadId,
					seq: row.seq,
					sourceEntryId: row.sourceEntryId,
					status: row.status,
					receiptEntryId: row.receiptEntryId ?? undefined,
					items: items
						.filter(item => item.batchId === row.id)
						.map(item => ({
							n: item.n,
							excerpt: item.excerpt,
							// The JSON column is the TS core's: parsed by the wire schema on the way back in.
							destination: item.destination === null ? undefined : BatchItemDestinationSchema.parse(item.destination),
							recordedAt: item.recordedAt ?? undefined,
						})),
					createdAt: row.createdAt,
					updatedAt: row.updatedAt,
					version: row.version,
				}),
		)
	}
}
