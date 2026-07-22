import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { clickupBoardView } from '@codedm/contracts/db'
import { TaskStatus, TaskPriority } from '@codedm/contracts-typescript/wire/enums'
import { BoardViewProjection, type BoardViewProjectionProps } from './BoardViewProjection'

// ---------------------------------------------------------------------------
// Abstract
// ---------------------------------------------------------------------------

export abstract class BoardViewProjectionRepository {
	abstract findByKey(taskId: string, tx?: Transaction): Promise<BoardViewProjection | null>
	abstract save(projection: BoardViewProjection, tx?: Transaction): Promise<void>
	abstract insertIfNew(projection: BoardViewProjection, tx?: Transaction): Promise<boolean>
}

// ---------------------------------------------------------------------------
// Drizzle implementation
// ---------------------------------------------------------------------------

@injectable()
export class DrizzleBoardViewProjectionRepository extends BoardViewProjectionRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async findByKey(taskId: string, tx?: Transaction): Promise<BoardViewProjection | null> {
		const dbClient = (tx as DrizzleClient | undefined) ?? this.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbClient
				.select()
				.from(clickupBoardView)
				.where(eq(clickupBoardView.taskId, taskId))
				.limit(1)
			if (!rows[0]) return null
			return this.toDomain(rows[0])
		})
		if (!result.success) return null
		return result.data
	}

	async save(projection: BoardViewProjection, tx?: Transaction): Promise<void> {
		const dbClient = (tx as DrizzleClient | undefined) ?? this.db
		const row = this.toPersistence(projection)
		const result = await tryCatchAsync(async () => {
			await dbClient
				.insert(clickupBoardView)
				.values(row)
				.onConflictDoUpdate({
					target: clickupBoardView.taskId,
					set: {
						status: row.status,
						listId: row.listId,
						assigneeIds: row.assigneeIds,
						title: row.title,
						priority: row.priority,
					},
				})
		})
		if (!result.success) throw result.error
	}

	async insertIfNew(projection: BoardViewProjection, tx?: Transaction): Promise<boolean> {
		const dbClient = (tx as DrizzleClient | undefined) ?? this.db
		const row = this.toPersistence(projection)
		const result = await tryCatchAsync(async () => {
			const inserted = await dbClient
				.insert(clickupBoardView)
				.values(row)
				.onConflictDoNothing()
				.returning()
			return inserted.length > 0
		})
		if (!result.success) return false
		return result.data
	}

	private toPersistence(projection: BoardViewProjection): typeof clickupBoardView.$inferInsert {
		return {
			taskId: projection.props.taskId,
			spaceId: projection.props.spaceId,
			status: projection.props.status,
			listId: projection.props.listId,
			title: projection.props.title,
			priority: projection.props.priority,
			assigneeIds: projection.props.assigneeIds,
		}
	}

	private toDomain(row: typeof clickupBoardView.$inferSelect): BoardViewProjection {
		return new BoardViewProjection({
			taskId: row.taskId,
			spaceId: row.spaceId,
			status: row.status as TaskStatus,
			listId: row.listId,
			title: row.title,
			priority: row.priority as TaskPriority,
			assigneeIds: row.assigneeIds,
		})
	}
}

// ---------------------------------------------------------------------------
// Mock implementation
// ---------------------------------------------------------------------------

@injectable()
export class MockBoardViewProjectionRepository extends BoardViewProjectionRepository {
	private store = new Map<string, BoardViewProjectionProps>()

	async findByKey(taskId: string): Promise<BoardViewProjection | null> {
		const props = this.store.get(taskId)
		if (!props) return null
		return new BoardViewProjection({ ...props })
	}

	async save(projection: BoardViewProjection): Promise<void> {
		this.store.set(projection.props.taskId, { ...projection.props })
	}

	async insertIfNew(projection: BoardViewProjection): Promise<boolean> {
		if (this.store.has(projection.props.taskId)) return false
		this.store.set(projection.props.taskId, { ...projection.props })
		return true
	}
}
