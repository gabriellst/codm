import { injectable } from 'tsyringe-neo'
import { Handler, z, DrizzleClient } from '@template/core-typescript'
import { boards as boardsTable, boardLists as boardListsTable } from '@template/contracts/db'
import { eq, sql } from 'drizzle-orm'

export const ListBoardsInputSchema = z.object({
	storeId: z.uuid(),
})

export const ListBoardsOutputSchema = z.object({
	items: z.array(
		z.object({
			id: z.uuid(),
			title: z.string(),
			archivedAt: z.string().nullable(),
			listCount: z.number().int(),
		}),
	),
})

@injectable()
export class ListBoards extends Handler<typeof ListBoardsInputSchema, typeof ListBoardsOutputSchema> {
	readonly name = 'list_boards' as const
	readonly inputSchema = ListBoardsInputSchema
	readonly outputSchema = ListBoardsOutputSchema

	constructor(private readonly db: DrizzleClient) { super() }

	protected async handle(input: this['input']): Promise<this['output']> {
		const rows = await this.db
			.select({
				id: boardsTable.id,
				title: boardsTable.title,
				archivedAt: boardsTable.archivedAt,
				listCount: sql<number>`count(${boardListsTable.id})::int`,
			})
			.from(boardsTable)
			.leftJoin(boardListsTable, eq(boardListsTable.boardId, boardsTable.id))
			.where(eq(boardsTable.storeId, input.storeId))
			.groupBy(boardsTable.id, boardsTable.title, boardsTable.archivedAt)

		return {
			items: rows.map(b => ({
				id: b.id,
				title: b.title,
				archivedAt: b.archivedAt?.toISOString() ?? null,
				listCount: b.listCount,
			})),
		}
	}
}
