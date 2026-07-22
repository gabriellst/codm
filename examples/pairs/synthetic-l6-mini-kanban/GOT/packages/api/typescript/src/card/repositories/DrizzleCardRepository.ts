import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@template/core-typescript'
import { cards as cardsTable } from '@template/contracts/db'
import { Card } from '../entities/Card'
import { CardRepository } from './CardRepository'
import type { Transaction } from '@template/core-typescript'

@injectable()
export class DrizzleCardRepository extends CardRepository {
	constructor(private db: DrizzleClient) { super() }

	async findById(cardId: string, tx?: Transaction): Promise<Card | undefined> {
		const dbc = (tx ?? this.db) as DrizzleClient
		const result = await tryCatchAsync(async () => {
			const rows = await dbc.select().from(cardsTable).where(eq(cardsTable.id, cardId)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async findByBoardId(boardId: string, tx?: Transaction): Promise<Card[]> {
		const dbc = (tx ?? this.db) as DrizzleClient
		const result = await tryCatchAsync(async () => {
			return dbc.select().from(cardsTable).where(eq(cardsTable.boardId, boardId))
		})
		if (!result.success) throw result.error
		return result.data.map(r => this.toDomain(r))
	}

	async save(entity: Card, tx?: Transaction): Promise<Card> {
		entity.incrementVersion()
		const dbc = (tx ?? this.db) as DrizzleClient
		const result = await tryCatchAsync(async () => {
			const data = this.toPersistence(entity)
			await dbc
				.insert(cardsTable)
				.values(data)
				.onConflictDoUpdate({
					target: cardsTable.id,
					set: {
						listId: data.listId,
						title: data.title,
						position: data.position,
						archivedAt: data.archivedAt,
						updatedAt: new Date(),
						version: data.version,
					},
				})
			return entity
		})
		if (!result.success) throw result.error
		return result.data
	}

	async delete(id: string, tx?: Transaction): Promise<void> {
		const dbc = (tx ?? this.db) as DrizzleClient
		const result = await tryCatchAsync(async () => {
			await dbc.delete(cardsTable).where(eq(cardsTable.id, id))
		})
		if (!result.success) throw result.error
	}

	private toDomain(row: typeof cardsTable.$inferSelect): Card {
		return Card.reconstitute({
			id: row.id,
			boardId: row.boardId,
			listId: row.listId,
			title: row.title,
			position: row.position,
			archivedAt: row.archivedAt ?? null,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			version: row.version,
		})
	}

	private toPersistence(entity: Card): typeof cardsTable.$inferInsert {
		return {
			id: entity.id.value,
			boardId: entity.boardId,
			listId: entity.listId,
			title: entity.title,
			position: entity.position,
			archivedAt: entity.archivedAt ?? null,
			version: entity.version,
		}
	}
}
