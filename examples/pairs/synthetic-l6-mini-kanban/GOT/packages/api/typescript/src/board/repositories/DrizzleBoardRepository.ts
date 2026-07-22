import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@codedm/core-typescript'
import { boards as boardsTable, boardLists as boardListsTable } from '@codedm/contracts/db'
import { Board } from '../entities/Board'
import { BoardList } from '../entities/BoardList'
import { BoardRepository } from './BoardRepository'

@injectable()
export class DrizzleBoardRepository extends BoardRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async findById(boardId: string, tx?: DrizzleClient): Promise<Board | undefined> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const [rows, listRows] = await Promise.all([
				dbc.select().from(boardsTable).where(eq(boardsTable.id, boardId)).limit(1),
				dbc.select().from(boardListsTable).where(eq(boardListsTable.boardId, boardId)),
			])
			return { board: rows[0], lists: listRows }
		})
		if (!result.success || !result.data.board) return undefined
		return this.toDomain(result.data.board, result.data.lists)
	}

	async findByStoreId(storeId: string, tx?: DrizzleClient): Promise<Board[]> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc.select().from(boardsTable).where(eq(boardsTable.storeId, storeId))
			if (rows.length === 0) return []
			const boardIds = rows.map(r => r.id)
			const allListRows = await Promise.all(
				boardIds.map(id => dbc.select().from(boardListsTable).where(eq(boardListsTable.boardId, id))),
			)
			const listsByBoard = new Map<string, (typeof boardListsTable.$inferSelect)[]>()
			for (let i = 0; i < boardIds.length; i++) {
				listsByBoard.set(boardIds[i]!, allListRows[i] ?? [])
			}
			return rows.map(row => this.toDomain(row, listsByBoard.get(row.id) ?? []))
		})
		if (!result.success) throw result.error
		return result.data
	}

	async save(entity: Board, tx?: DrizzleClient): Promise<Board> {
		entity.incrementVersion()
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const data = this.toPersistence(entity)
			await dbc
				.insert(boardsTable)
				.values(data)
				.onConflictDoUpdate({
					target: boardsTable.id,
					set: {
						storeId: data.storeId,
						title: data.title,
						archivedAt: data.archivedAt,
						updatedAt: new Date(),
						version: data.version,
					},
				})
			// Replace board_lists: delete existing rows, re-insert current state
			await dbc.delete(boardListsTable).where(eq(boardListsTable.boardId, entity.id.value))
			const lists = entity.lists
			if (lists.length > 0) {
				await dbc.insert(boardListsTable).values(
					lists.map(l => ({
						id: l.id,
						boardId: l.boardId,
						title: l.title,
						position: l.position,
					})),
				)
			}
			return entity
		})
		if (!result.success) throw result.error
		return result.data
	}

	async delete(id: string, tx?: DrizzleClient): Promise<void> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			await dbc.delete(boardListsTable).where(eq(boardListsTable.boardId, id))
			await dbc.delete(boardsTable).where(eq(boardsTable.id, id))
		})
		if (!result.success) throw result.error
	}

	private toDomain(
		row: typeof boardsTable.$inferSelect,
		listRows: (typeof boardListsTable.$inferSelect)[],
	): Board {
		const lists = listRows
			.sort((a, b) => a.position - b.position)
			.map(l => BoardList.reconstitute({ id: l.id, boardId: l.boardId, title: l.title, position: l.position }))
		return Board.reconstitute({
			id: row.id,
			storeId: row.storeId,
			title: row.title,
			archivedAt: row.archivedAt ?? null,
			lists,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			version: row.version,
		})
	}

	private toPersistence(entity: Board): typeof boardsTable.$inferInsert {
		return {
			id: entity.id.value,
			storeId: entity.storeId,
			title: entity.title,
			archivedAt: entity.archivedAt ?? null,
			version: entity.version,
		}
	}
}
