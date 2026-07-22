import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { clickupListView } from '@template/contracts/db'
import { TaskStatus, TaskPriority } from '@template/contracts-typescript/wire/enums'
import { ListViewProjection, type ListViewProjectionProps } from './ListViewProjection'

// ---------------------------------------------------------------------------
// Abstract
// ---------------------------------------------------------------------------

export abstract class ListViewProjectionRepository {
	abstract findByKey(taskId: string, tx?: Transaction): Promise<ListViewProjection | null>
	abstract save(projection: ListViewProjection, tx?: Transaction): Promise<void>
	abstract insertIfNew(projection: ListViewProjection, tx?: Transaction): Promise<boolean>
}

// ---------------------------------------------------------------------------
// Drizzle implementation
// ---------------------------------------------------------------------------

@injectable()
export class DrizzleListViewProjectionRepository extends ListViewProjectionRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async findByKey(taskId: string, tx?: Transaction): Promise<ListViewProjection | null> {
		const dbClient = (tx as DrizzleClient | undefined) ?? this.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbClient
				.select()
				.from(clickupListView)
				.where(eq(clickupListView.taskId, taskId))
				.limit(1)
			if (!rows[0]) return null
			return this.toDomain(rows[0])
		})
		if (!result.success) return null
		return result.data
	}

	async save(projection: ListViewProjection, tx?: Transaction): Promise<void> {
		const dbClient = (tx as DrizzleClient | undefined) ?? this.db
		const row = this.toPersistence(projection)
		const result = await tryCatchAsync(async () => {
			await dbClient
				.insert(clickupListView)
				.values(row)
				.onConflictDoUpdate({
					target: clickupListView.taskId,
					set: {
						status: row.status,
						listId: row.listId,
						assigneeIds: row.assigneeIds,
						title: row.title,
						priority: row.priority,
						position: row.position,
					},
				})
		})
		if (!result.success) throw result.error
	}

	async insertIfNew(projection: ListViewProjection, tx?: Transaction): Promise<boolean> {
		const dbClient = (tx as DrizzleClient | undefined) ?? this.db
		const row = this.toPersistence(projection)
		const result = await tryCatchAsync(async () => {
			const inserted = await dbClient
				.insert(clickupListView)
				.values(row)
				.onConflictDoNothing()
				.returning()
			return inserted.length > 0
		})
		if (!result.success) return false
		return result.data
	}

	private toPersistence(projection: ListViewProjection): typeof clickupListView.$inferInsert {
		return {
			taskId: projection.props.taskId,
			spaceId: projection.props.spaceId,
			listId: projection.props.listId,
			title: projection.props.title,
			status: projection.props.status,
			priority: projection.props.priority,
			assigneeIds: projection.props.assigneeIds,
			position: projection.props.position,
		}
	}

	private toDomain(row: typeof clickupListView.$inferSelect): ListViewProjection {
		return new ListViewProjection({
			taskId: row.taskId,
			spaceId: row.spaceId,
			listId: row.listId,
			title: row.title,
			status: row.status as TaskStatus,
			priority: row.priority as TaskPriority,
			assigneeIds: row.assigneeIds,
			position: row.position,
		})
	}
}

// ---------------------------------------------------------------------------
// Mock implementation
// ---------------------------------------------------------------------------

@injectable()
export class MockListViewProjectionRepository extends ListViewProjectionRepository {
	private store = new Map<string, ListViewProjectionProps>()

	async findByKey(taskId: string): Promise<ListViewProjection | null> {
		const props = this.store.get(taskId)
		if (!props) return null
		return new ListViewProjection({ ...props })
	}

	async save(projection: ListViewProjection): Promise<void> {
		this.store.set(projection.props.taskId, { ...projection.props })
	}

	async insertIfNew(projection: ListViewProjection): Promise<boolean> {
		if (this.store.has(projection.props.taskId)) return false
		this.store.set(projection.props.taskId, { ...projection.props })
		return true
	}
}
