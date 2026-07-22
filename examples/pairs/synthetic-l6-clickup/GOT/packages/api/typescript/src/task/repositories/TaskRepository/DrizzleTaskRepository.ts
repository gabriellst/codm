import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@template/core-typescript'
import { tasks } from '@template/contracts/db'
import { TaskStatus, TaskPriority } from '@template/contracts-typescript/wire/enums'
import { Task } from '../../entities'
import { TaskRepository } from './TaskRepository'

@injectable()
export class DrizzleTaskRepository extends TaskRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async findById(id: string, tx?: DrizzleClient): Promise<Task | undefined> {
		const dbClient = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbClient.select().from(tasks).where(eq(tasks.id, id)).limit(1)
			if (!rows[0]) return undefined
			return this.toDomain(rows[0])
		})
		if (!result.success || !result.data) return undefined
		return result.data
	}

	async save(entity: Task, tx?: DrizzleClient): Promise<Task> {
		entity.incrementVersion()
		const dbClient = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const data = this.toPersistence(entity)
			await dbClient
				.insert(tasks)
				.values(data)
				.onConflictDoUpdate({
					target: tasks.id,
					set: {
						listId: data.listId,
						title: data.title,
						status: data.status,
						priority: data.priority,
						assigneeIds: data.assigneeIds,
						position: data.position,
						updatedAt: new Date(),
					},
				})
			return entity
		})
		if (!result.success) throw result.error
		return result.data
	}

	async delete(id: string, tx?: DrizzleClient): Promise<void> {
		const dbClient = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			await dbClient.delete(tasks).where(eq(tasks.id, id))
		})
		if (!result.success) throw result.error
	}

	private toDomain(row: typeof tasks.$inferSelect): Task {
		return new Task({
			id: row.id,
			workspaceId: row.workspaceId,
			spaceId: row.spaceId,
			listId: row.listId,
			title: row.title,
			status: row.status as TaskStatus,
			priority: row.priority as TaskPriority,
			assigneeIds: row.assigneeIds,
			position: row.position,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			version: row.version,
		})
	}

	private toPersistence(entity: Task): typeof tasks.$inferInsert {
		return {
			id: entity.id.value,
			workspaceId: entity.workspaceId,
			spaceId: entity.spaceId,
			listId: entity.listId,
			title: entity.title,
			status: entity.status,
			priority: entity.priority,
			assigneeIds: entity.assigneeIds,
			position: entity.position,
			ownerId: entity.workspaceId,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
			version: entity.version,
		}
	}
}
