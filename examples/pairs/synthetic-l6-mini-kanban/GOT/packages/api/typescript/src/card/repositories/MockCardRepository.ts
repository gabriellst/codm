import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@codedm/core-typescript'
import { Card } from '../entities/Card'
import { CardRepository } from './CardRepository'

@injectable()
export class MockCardRepository extends CardRepository {
	private store = new Map<string, Card>()

	async findById(cardId: string, _tx?: Transaction): Promise<Card | undefined> {
		return this.store.get(cardId)
	}

	async findByBoardId(boardId: string, _tx?: Transaction): Promise<Card[]> {
		return Array.from(this.store.values()).filter(c => c.boardId === boardId)
	}

	async save(entity: Card, _tx?: Transaction): Promise<Card> {
		entity.incrementVersion()
		this.store.set(entity.id.value, entity)
		return entity
	}

	async delete(id: string, _tx?: Transaction): Promise<void> {
		this.store.delete(id)
	}
}
