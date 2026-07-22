// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { injectable } from 'tsyringe-neo'
import { and, eq, sql } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@template/core-typescript'
import { ownerMemberships, users as authUsers } from '@template/contracts/db'
import { Role as OwnerRole } from '../../enums/Role'
import { OwnerMembership } from '../../entities/OwnerMembership'
import { OwnerMembershipRepository } from './OwnerMembershipRepository'

@injectable()
export class DrizzleOwnerMembershipRepository extends OwnerMembershipRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async findByOwnerAndUser(ownerId: string, userId: string, tx?: DrizzleClient): Promise<OwnerMembership | undefined> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc
				.select()
				.from(ownerMemberships)
				.where(and(eq(ownerMemberships.ownerId, ownerId), eq(ownerMemberships.userId, userId)))
				.limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async findById(membershipId: string, tx?: DrizzleClient): Promise<OwnerMembership | undefined> {
		const [ownerId, userId] = membershipId.split(':')
		if (!ownerId || !userId) return undefined
		return this.findByOwnerAndUser(ownerId, userId, tx)
	}

	async findByOwnerId(ownerId: string, tx?: DrizzleClient): Promise<OwnerMembership[]> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			return dbc.select().from(ownerMemberships).where(eq(ownerMemberships.ownerId, ownerId))
		})
		if (!result.success || !result.data) return []
		return result.data.map(r => this.toDomain(r))
	}

	async findByUserId(userId: string, tx?: DrizzleClient): Promise<OwnerMembership[]> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			return dbc.select().from(ownerMemberships).where(eq(ownerMemberships.userId, userId))
		})
		if (!result.success || !result.data) return []
		return result.data.map(r => this.toDomain(r))
	}

	async countOwnersByOwnerId(ownerId: string, tx?: DrizzleClient): Promise<number> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc
				.select({ n: sql<number>`count(*)::int` })
				.from(ownerMemberships)
				.where(and(eq(ownerMemberships.ownerId, ownerId), eq(ownerMemberships.role, OwnerRole.RESPONSIBLE)))
			return rows[0]?.n ?? 0
		})
		if (!result.success) throw result.error
		return Number(result.data ?? 0)
	}

	async findByOwnerAndEmail(ownerId: string, email: string, tx?: DrizzleClient): Promise<OwnerMembership | undefined> {
		const dbc = tx ?? this.db
		// Two-step lookup instead of cross-schema inner-join. Drizzle's join
		// builder didn't materialize rows reliably across the auth + owner
		// pgSchemas in PGlite; explicit email→userId then membership lookup
		// keeps the same semantic with predictable behavior.
		const result = await tryCatchAsync(async () => {
			const userRows = await dbc.select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.email, email)).limit(1)
			const userId = userRows[0]?.id
			if (!userId) return undefined
			const rows = await dbc
				.select()
				.from(ownerMemberships)
				.where(and(eq(ownerMemberships.ownerId, ownerId), eq(ownerMemberships.userId, userId)))
				.limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async save(entity: OwnerMembership, tx?: DrizzleClient): Promise<OwnerMembership> {
		entity.incrementVersion()
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const data = this.toPersistence(entity)
			await dbc
				.insert(ownerMemberships)
				.values(data)
				.onConflictDoUpdate({
					target: [ownerMemberships.ownerId, ownerMemberships.userId],
					set: {
						role: data.role,
						updatedAt: new Date(),
						version: data.version,
					},
				})
			return entity
		})
		if (!result.success) throw result.error
		return result.data
	}

	async removeByOwnerAndUser(ownerId: string, userId: string, tx?: DrizzleClient): Promise<void> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			await dbc.delete(ownerMemberships).where(and(eq(ownerMemberships.ownerId, ownerId), eq(ownerMemberships.userId, userId)))
		})
		if (!result.success) throw result.error
	}

	async delete(membershipId: string, tx?: DrizzleClient): Promise<void> {
		const [ownerId, userId] = membershipId.split(':')
		if (!ownerId || !userId) return
		return this.removeByOwnerAndUser(ownerId, userId, tx)
	}

	private toDomain(row: {
		ownerId: string
		userId: string
		role: string
		createdAt: Date
		updatedAt: Date
		version: number
	}): OwnerMembership {
		return new OwnerMembership({
			ownerId: row.ownerId,
			userId: row.userId,
			role: row.role as OwnerRole,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			version: row.version,
		})
	}

	private toPersistence(entity: OwnerMembership): typeof ownerMemberships.$inferInsert {
		return {
			ownerId: entity.ownerId.value,
			userId: entity.userId.value,
			role: entity.role,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
			version: entity.version,
		}
	}
}
