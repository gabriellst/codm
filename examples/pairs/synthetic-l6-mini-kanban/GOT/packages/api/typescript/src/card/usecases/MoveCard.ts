import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import type { CardErrors } from '../errors'
import { CardRepository } from '../repositories/CardRepository'
import { BoardRepository } from '../../board/repositories/BoardRepository'

export const MoveCardInputSchema = z.object({
	storeId: z.uuid(),
	cardId: z.uuid(),
	toListId: z.uuid(),
})

export const MoveCardOutputSchema = z.object({ cardId: z.uuid() })

@injectable()
export class MoveCard extends Handler<typeof MoveCardInputSchema, typeof MoveCardOutputSchema> {
	readonly name = 'move_card' as const
	readonly inputSchema = MoveCardInputSchema
	readonly outputSchema = MoveCardOutputSchema

	constructor(
		private readonly cards: CardRepository,
		private readonly boards: BoardRepository,
	) { super() }

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const card = await this.cards.findById(input.cardId, tx)
			if (!card) throw new BaseError<CardErrors>('CARD_NOT_FOUND')

			const board = await this.boards.findById(card.boardId, tx)
			if (!board) throw new BaseError<CardErrors>('CARD_BOARD_NOT_FOUND')
			if (board.isArchived) throw new BaseError<CardErrors>('CARD_BOARD_ARCHIVED')
			if (!board.hasListId(input.toListId)) throw new BaseError<CardErrors>('CARD_LIST_NOT_FOUND')

			card.move(input.toListId, input.storeId)
			await this.cards.save(card, tx)
			return { cardId: card.id.value }
		})
	}
}
