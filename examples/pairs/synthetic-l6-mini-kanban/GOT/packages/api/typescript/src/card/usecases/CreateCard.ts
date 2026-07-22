import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import type { CardErrors } from '../errors'
import { CardRepository } from '../repositories/CardRepository'
import { BoardRepository } from '../../board/repositories/BoardRepository'
import { Card } from '../entities/Card'

export const CreateCardInputSchema = z.object({
	storeId: z.uuid(),
	boardId: z.uuid(),
	listId: z.uuid(),
	title: z.string().min(1).max(500),
})

export const CreateCardOutputSchema = z.object({ cardId: z.uuid() })

@injectable()
export class CreateCard extends Handler<typeof CreateCardInputSchema, typeof CreateCardOutputSchema> {
	readonly name = 'create_card' as const
	readonly inputSchema = CreateCardInputSchema
	readonly outputSchema = CreateCardOutputSchema

	constructor(
		private readonly cards: CardRepository,
		private readonly boards: BoardRepository,
	) { super() }

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const board = await this.boards.findById(input.boardId, tx)
			if (!board) throw new BaseError<CardErrors>('CARD_BOARD_NOT_FOUND')
			if (board.isArchived) throw new BaseError<CardErrors>('CARD_BOARD_ARCHIVED')
			if (!board.hasListId(input.listId)) throw new BaseError<CardErrors>('CARD_LIST_NOT_FOUND')

			const card = Card.create({ boardId: input.boardId, listId: input.listId, title: input.title, storeId: input.storeId })
			await this.cards.save(card, tx)
			return { cardId: card.id.value }
		})
	}
}
