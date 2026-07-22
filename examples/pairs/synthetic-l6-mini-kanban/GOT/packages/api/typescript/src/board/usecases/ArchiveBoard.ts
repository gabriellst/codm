import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import type { BoardErrors } from '../errors'
import { BoardRepository } from '../repositories/BoardRepository'

export const ArchiveBoardInputSchema = z.object({
	storeId: z.uuid(),
	boardId: z.uuid(),
})

export const ArchiveBoardOutputSchema = z.object({ boardId: z.uuid() })

@injectable()
export class ArchiveBoard extends Handler<typeof ArchiveBoardInputSchema, typeof ArchiveBoardOutputSchema> {
	readonly name = 'archive_board' as const
	readonly inputSchema = ArchiveBoardInputSchema
	readonly outputSchema = ArchiveBoardOutputSchema

	constructor(private readonly boards: BoardRepository) { super() }

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const board = await this.boards.findById(input.boardId, tx)
			if (!board) throw new BaseError<BoardErrors>('BOARD_NOT_FOUND')
			board.archive()
			await this.boards.save(board, tx)
			return { boardId: board.id.value }
		})
	}
}
