import { Repository } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import type { Card } from '../entities/Card'

export abstract class CardRepository extends Repository<Card> {
	abstract findById(cardId: string, tx?: Transaction): Promise<Card | undefined>
	abstract findByBoardId(boardId: string, tx?: Transaction): Promise<Card[]>
}
