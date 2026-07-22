import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError, DrizzleClient } from '@template/core-typescript'
import { eq } from 'drizzle-orm'
import { boards as boardsTable, boardLists as boardListsTable, cards as cardsTable } from '@template/contracts/db'

export const GetBoardInputSchema = z.object({
	storeId: z.uuid(),
	boardId: z.uuid(),
})

const CardItemSchema = z.object({
	id: z.uuid(),
	listId: z.uuid(),
	title: z.string(),
	position: z.number().int(),
})

const ListItemSchema = z.object({
	id: z.uuid(),
	title: z.string(),
	position: z.number().int(),
	cards: z.array(CardItemSchema),
})

export const GetBoardOutputSchema = z.object({
	id: z.uuid(),
	title: z.string(),
	archivedAt: z.string().nullable(),
	lists: z.array(ListItemSchema),
})

@injectable()
export class GetBoard extends Handler<typeof GetBoardInputSchema, typeof GetBoardOutputSchema> {
	readonly name = 'get_board' as const
	readonly inputSchema = GetBoardInputSchema
	readonly outputSchema = GetBoardOutputSchema

	constructor(private readonly db: DrizzleClient) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const boardRows = await this.db.select().from(boardsTable).where(eq(boardsTable.id, input.boardId)).limit(1)
		const board = boardRows[0]
		if (!board) throw new BaseError<'BOARD_NOT_FOUND'>('BOARD_NOT_FOUND')

		const [listRows, cardRows] = await Promise.all([
			this.db.select().from(boardListsTable).where(eq(boardListsTable.boardId, input.boardId)),
			this.db.select().from(cardsTable).where(eq(cardsTable.boardId, input.boardId)),
		])

		const lists = listRows
			.sort((a, b) => a.position - b.position)
			.map(l => ({
				id: l.id,
				title: l.title,
				position: l.position,
				cards: cardRows
					.filter(c => c.listId === l.id)
					.sort((a, b) => a.position - b.position)
					.map(c => ({ id: c.id, listId: c.listId, title: c.title, position: c.position })),
			}))

		return {
			id: board.id,
			title: board.title,
			archivedAt: board.archivedAt?.toISOString() ?? null,
			lists,
		}
	}
}
