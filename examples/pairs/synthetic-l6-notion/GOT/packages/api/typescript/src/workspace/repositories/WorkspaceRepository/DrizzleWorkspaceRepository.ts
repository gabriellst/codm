import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@template/core-typescript'
import { workspaces } from '@template/contracts/db'
import { Workspace, WorkspaceSchema } from '../../entities/Workspace'
import { WorkspaceRepository } from './WorkspaceRepository'

@injectable()
export class DrizzleWorkspaceRepository extends WorkspaceRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async findById(id: string, tx?: DrizzleClient): Promise<Workspace | undefined> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc.select().from(workspaces).where(eq(workspaces.id, id)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async save(entity: Workspace, tx?: DrizzleClient): Promise<Workspace> {
		entity.incrementVersion()
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const data = this.toPersistence(entity)
			await dbc
				.insert(workspaces)
				.values(data)
				.onConflictDoUpdate({
					target: workspaces.id,
					set: {
						name: data.name,
						ownerId: data.ownerId,
						updatedAt: new Date(),
						version: data.version,
					},
				})
			return entity
		})
		if (!result.success) throw result.error
		return result.data
	}

	async delete(id: string, tx?: DrizzleClient): Promise<void> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			await dbc.delete(workspaces).where(eq(workspaces.id, id))
		})
		if (!result.success) throw result.error
	}

	private toDomain(row: typeof workspaces.$inferSelect): Workspace {
		const parsed = WorkspaceSchema.parse({
			name: row.name,
			ownerId: row.ownerId,
		})
		return new Workspace({
			...parsed,
			id: row.id,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			version: row.version,
		})
	}

	private toPersistence(entity: Workspace): typeof workspaces.$inferInsert {
		return {
			id: entity.id.value,
			name: entity.name,
			ownerId: entity.ownerId.value,
			version: entity.version,
		}
	}
}
