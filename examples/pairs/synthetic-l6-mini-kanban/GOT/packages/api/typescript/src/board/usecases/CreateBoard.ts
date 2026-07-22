import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codedm/core-typescript'
import { Board } from '../entities/Board'
import { BoardList } from '../entities/BoardList'
import { BoardRepository } from '../repositories/BoardRepository'
import type { Transaction } from '@codedm/core-typescript'

export const CreateBoardInputSchema = z.object({
	storeId: z.uuid(),
	title: z.string().min(1).max(255),
	lists: z.array(z.object({ title: z.string().min(1).max(255) })).default([
		{ title: 'To Do' }, { title: 'In Progress' }, { title: 'Done' },
	]),
})

export const CreateBoardOutputSchema = z.object({ boardId: z.uuid() })

@injectable()
export class CreateBoard extends Handler<typeof CreateBoardInputSchema, typeof CreateBoardOutputSchema> {
	readonly name = 'create_board' as const
	readonly inputSchema = CreateBoardInputSchema
	readonly outputSchema = CreateBoardOutputSchema

	constructor(private readonly boards: BoardRepository) { super() }

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const board = Board.create({ storeId: input.storeId, title: input.title })
			for (let i = 0; i < input.lists.length; i++) {
				board.addList(BoardList.create({
					boardId: board.id.value,
					title: input.lists[i]!.title,
					position: i,
				}))
			}
			await this.boards.save(board, tx)
			return { boardId: board.id.value }
		})
	}
}
