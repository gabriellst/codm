import { injectable } from 'tsyringe-neo'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { BaseError, Handler, LibSqlDatabaseDriver, z } from '@codm/core-typescript'
import { batchItems, batches, issues } from '@codm/contracts/db'
import { BatchItemDestinationSchema, BatchSchema } from '@shared/objects'
import type { ApplicationErrors } from '../errors'

export const GetBatchInputSchema = z.object({ ownerId: z.uuid(), threadId: z.uuid(), batchCode: BatchSchema.shape.code })

/** The batch, plus the key and title of every issue its destinations name — what the screen links to. */
export const GetBatchOutputSchema = z.object({
	...BatchSchema.shape,
	issues: z.array(z.object({ issueId: z.uuid(), key: z.string(), title: z.string() })),
})

/**
 * Read — ONE BATCH of a conversation (fase 4, item 5), for the console's batch screen: every listed item, where it
 * went (absent while the batch is `INCOMPLETE`), and the issues those destinations name. Query side: it reads the
 * batch tables and the issue projection directly (BFF), never the aggregate.
 *
 * An issue forked in the batch's own turn may not have its projection row yet — it is simply not in `issues` until
 * it does, and the screen shows the item without the link.
 */
@injectable()
export class GetBatch extends Handler<typeof GetBatchInputSchema, typeof GetBatchOutputSchema> {
	readonly name = 'get_batch' as const
	readonly inputSchema = GetBatchInputSchema
	readonly outputSchema = GetBatchOutputSchema

	constructor(private readonly driver: LibSqlDatabaseDriver) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const [batch] = await this.driver.db
			.select()
			.from(batches)
			.where(and(eq(batches.threadId, input.threadId), eq(batches.code, input.batchCode), eq(batches.ownerId, input.ownerId)))
			.limit(1)
		if (!batch) throw new BaseError<ApplicationErrors>('BATCH_NOT_FOUND', `no batch ${input.batchCode} in this conversation`)
		const items = await this.driver.db.select().from(batchItems).where(eq(batchItems.batchId, batch.id)).orderBy(asc(batchItems.n))
		const linked = [...new Set(items.flatMap(item => (item.issueId ? [item.issueId] : [])))]
		const named =
			linked.length === 0
				? []
				: await this.driver.db
						.select({ issueId: issues.id, key: issues.key, title: issues.title })
						.from(issues)
						.where(and(inArray(issues.id, linked), eq(issues.ownerId, input.ownerId)))
		return {
			code: batch.code,
			status: batch.status,
			sourceEntryId: batch.sourceEntryId,
			items: items.map(item => ({
				n: item.n,
				excerpt: item.excerpt,
				...(item.destination !== null && { destination: BatchItemDestinationSchema.parse(item.destination) }),
			})),
			issues: named,
		}
	}
}
