import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@template/core-typescript'
import { spaces, lists } from '@template/contracts/db'
import { Space } from '../../entities'
import { SpaceList } from '../../objects/SpaceList'
import { SpaceRepository } from './SpaceRepository'

@injectable()
export class DrizzleSpaceRepository extends SpaceRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async findById(id: string, tx?: DrizzleClient): Promise<Space | undefined> {
		const dbClient = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbClient.select().from(spaces).where(eq(spaces.id, id)).limit(1)
			if (!rows[0]) return undefined
			const row = rows[0]
			const listRows = await dbClient
				.select()
				.from(lists)
				.where(eq(lists.spaceId, id))
				.orderBy(lists.position)
			return this.toDomain(row, listRows)
		})
		if (!result.success || !result.data) return undefined
		return result.data
	}

	async save(entity: Space, tx?: DrizzleClient): Promise<Space> {
		entity.incrementVersion()
		const dbClient = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const data = this.toPersistence(entity)
			await dbClient
				.insert(spaces)
				.values(data)
				.onConflictDoUpdate({
					target: spaces.id,
					set: {
						name: data.name,
						updatedAt: new Date(),
					},
				})

			// Sync lists: delete all existing, then re-insert current state
			await dbClient.delete(lists).where(eq(lists.spaceId, entity.id.value))

			if (entity.lists.length > 0) {
				await dbClient.insert(lists).values(
					entity.lists.map(l => ({
						id: l.id,
						spaceId: entity.id.value,
						name: l.name,
						position: l.position,
						ownerId: entity.workspaceId,
					})),
				)
			}

			return entity
		})
		if (!result.success) throw result.error
		return result.data
	}

	async delete(id: string, tx?: DrizzleClient): Promise<void> {
		const dbClient = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			await dbClient.delete(spaces).where(eq(spaces.id, id))
		})
		if (!result.success) throw result.error
	}

	private toDomain(
		row: typeof spaces.$inferSelect,
		listRows: (typeof lists.$inferSelect)[],
	): Space {
		const spaceLists = listRows.map(
			l => new SpaceList({ id: l.id, name: l.name, position: l.position }),
		)
		return new Space({
			id: row.id,
			workspaceId: row.workspaceId,
			name: row.name,
			lists: spaceLists,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			version: row.version,
		})
	}

	private toPersistence(entity: Space): typeof spaces.$inferInsert {
		return {
			id: entity.id.value,
			workspaceId: entity.workspaceId,
			name: entity.name,
			ownerId: entity.workspaceId,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
		}
	}
}
