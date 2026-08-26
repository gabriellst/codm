import { injectable } from 'tsyringe-neo'
import { and, eq } from 'drizzle-orm'
import { LibSqlDatabaseDriver, tryCatchAsync, LibSqlTransaction } from '@codm/core-typescript'
import { workspaces } from '@codm/contracts/db'
import type { WorkspaceBadge } from '@codm/contracts-typescript/wire/enums'
import { Workspace, WorkspaceSchema } from '../../entities/Workspace'
import { WorkspaceRepository } from './WorkspaceRepository'

@injectable()
export class LibSqlWorkspaceRepository extends WorkspaceRepository {
	constructor(private driver: LibSqlDatabaseDriver) {
		super()
	}

	async findById(id: string, tx?: LibSqlTransaction): Promise<Workspace | undefined> {
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc.select().from(workspaces).where(eq(workspaces.id, id)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async findByOwnerAndPath(ownerId: string, path: string, tx?: LibSqlTransaction): Promise<Workspace | undefined> {
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc
				.select()
				.from(workspaces)
				.where(and(eq(workspaces.ownerId, ownerId), eq(workspaces.path, path)))
				.limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async listByOwner(ownerId: string, tx?: LibSqlTransaction): Promise<Workspace[]> {
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => dbc.select().from(workspaces).where(eq(workspaces.ownerId, ownerId)))
		if (!result.success || !result.data) return []
		return result.data.map(row => this.toDomain(row))
	}

	async save(entity: Workspace, tx?: LibSqlTransaction): Promise<Workspace> {
		entity.incrementVersion()
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			const data = this.toPersistence(entity)
			await dbc
				.insert(workspaces)
				.values(data)
				.onConflictDoUpdate({
					target: workspaces.id,
					set: { path: data.path, badges: data.badges, updatedAt: new Date(), version: data.version },
				})
			return entity
		})
		if (!result.success) throw result.error
		return result.data
	}

	async delete(id: string, tx?: LibSqlTransaction): Promise<void> {
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			await dbc.delete(workspaces).where(eq(workspaces.id, id))
		})
		if (!result.success) throw result.error
	}

	private toDomain(row: typeof workspaces.$inferSelect): Workspace {
		const parsed = WorkspaceSchema.parse({
			ownerId: row.ownerId,
			path: row.path,
			badges: row.badges as WorkspaceBadge[],
			addedAt: row.addedAt,
		})
		return new Workspace({ ...parsed, id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt, version: row.version })
	}

	private toPersistence(entity: Workspace): typeof workspaces.$inferInsert {
		return {
			id: entity.id.value,
			ownerId: entity.ownerId,
			path: entity.path,
			badges: entity.badges,
			addedAt: entity.addedAt,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
			version: entity.version,
		}
	}
}
