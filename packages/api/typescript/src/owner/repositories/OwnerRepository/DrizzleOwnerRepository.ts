import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@codm/core-typescript'
import { owners } from '@codm/contracts/db'
import type { OwnerKind } from '@codm/contracts-typescript/wire/enums'
import { Owner, OwnerSchema } from '../../entities/Owner'
import { OwnerRepository } from './OwnerRepository'

@injectable()
export class DrizzleOwnerRepository extends OwnerRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async findById(id: string, tx?: DrizzleClient): Promise<Owner | undefined> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc.select().from(owners).where(eq(owners.id, id)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async findByOwnerId(ownerId: string, tx?: DrizzleClient): Promise<Owner | null> {
		return (await this.findById(ownerId, tx)) ?? null
	}

	async findByResponsibleUserId(userId: string, tx?: DrizzleClient): Promise<Owner[]> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			return dbc.select().from(owners).where(eq(owners.responsibleUserId, userId))
		})
		if (!result.success || !result.data) return []
		return result.data.map(row => this.toDomain(row))
	}

	async save(entity: Owner, tx?: DrizzleClient): Promise<Owner> {
		entity.incrementVersion()
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const data = this.toPersistence(entity)
			await dbc
				.insert(owners)
				.values(data)
				.onConflictDoUpdate({
					target: owners.id,
					set: {
						name: data.name,
						kind: data.kind,
						responsibleUserId: data.responsibleUserId,
						pictureUrl: data.pictureUrl,
						timezone: data.timezone,
						isDisabled: data.isDisabled,
						disabledReason: data.disabledReason,
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
			await dbc.delete(owners).where(eq(owners.id, id))
		})
		if (!result.success) throw result.error
	}

	private toDomain(row: typeof owners.$inferSelect): Owner {
		const parsed = OwnerSchema.parse({
			name: row.name,
			kind: row.kind as OwnerKind,
			responsibleUserId: row.responsibleUserId,
			pictureUrl: row.pictureUrl ?? undefined,
			timezone: row.timezone ?? undefined,
			isDisabled: row.isDisabled,
			disabledReason: row.disabledReason ?? undefined,
		})
		return new Owner({
			...parsed,
			id: row.id,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			version: row.version,
		})
	}

	private toPersistence(entity: Owner): typeof owners.$inferInsert {
		return {
			id: entity.id.value,
			name: entity.name,
			kind: entity.kind,
			responsibleUserId: entity.responsibleUserId,
			pictureUrl: entity.pictureUrl ?? null,
			timezone: entity.timezone ?? null,
			isDisabled: entity.isDisabled,
			disabledReason: entity.disabledReason ?? null,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
			version: entity.version,
		}
	}
}
