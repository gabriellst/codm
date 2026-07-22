// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
import { injectable } from 'tsyringe-neo'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@template/core-typescript'
import { ownerInvitations } from '@template/contracts/db'
import { OwnerInvitation } from '../../entities/OwnerInvitation'
import { OwnerInvitationRepository } from './OwnerInvitationRepository'

@injectable()
export class DrizzleOwnerInvitationRepository extends OwnerInvitationRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async findById(id: string, tx?: DrizzleClient): Promise<OwnerInvitation | undefined> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc.select().from(ownerInvitations).where(eq(ownerInvitations.id, id)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async findPendingByOwnerAndEmail(ownerId: string, email: string, tx?: DrizzleClient): Promise<OwnerInvitation | undefined> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc
				.select()
				.from(ownerInvitations)
				.where(
					and(
						eq(ownerInvitations.ownerId, ownerId),
						eq(ownerInvitations.email, email),
						isNull(ownerInvitations.acceptedAt),
						gt(ownerInvitations.expiresAt, sql`now()`),
					),
				)
				.limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async findPendingByOwnerId(ownerId: string, tx?: DrizzleClient): Promise<OwnerInvitation[]> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			return dbc
				.select()
				.from(ownerInvitations)
				.where(and(eq(ownerInvitations.ownerId, ownerId), isNull(ownerInvitations.acceptedAt), gt(ownerInvitations.expiresAt, sql`now()`)))
		})
		if (!result.success || !result.data) return []
		return result.data.map(r => this.toDomain(r))
	}

	async findByToken(tokenHash: string, tx?: DrizzleClient): Promise<OwnerInvitation | undefined> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc.select().from(ownerInvitations).where(eq(ownerInvitations.token, tokenHash)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async save(entity: OwnerInvitation, tx?: DrizzleClient): Promise<OwnerInvitation> {
		entity.incrementVersion()
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const data = this.toPersistence(entity)
			await dbc
				.insert(ownerInvitations)
				.values(data)
				.onConflictDoUpdate({
					target: ownerInvitations.id,
					set: {
						ownerId: data.ownerId,
						email: data.email,
						role: data.role,
						token: data.token,
						expiresAt: data.expiresAt,
						acceptedAt: data.acceptedAt,
						acceptedByUserId: data.acceptedByUserId,
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
			await dbc.delete(ownerInvitations).where(eq(ownerInvitations.id, id))
		})
		if (!result.success) throw result.error
	}

	private toDomain(row: typeof ownerInvitations.$inferSelect): OwnerInvitation {
		const parsed = OwnerInvitation.schema.parse({
			ownerId: row.ownerId,
			email: row.email,
			role: row.role,
			token: row.token,
			expiresAt: row.expiresAt,
			acceptedAt: row.acceptedAt ?? undefined,
			acceptedByUserId: row.acceptedByUserId ?? undefined,
		})
		return new OwnerInvitation({
			...parsed,
			id: row.id,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			version: row.version,
		})
	}

	private toPersistence(entity: OwnerInvitation): typeof ownerInvitations.$inferInsert {
		return {
			id: entity.id.value,
			ownerId: entity.ownerId.value,
			email: entity.email,
			role: entity.role,
			token: entity.token,
			expiresAt: entity.expiresAt,
			acceptedAt: entity.acceptedAt ?? null,
			acceptedByUserId: entity.acceptedByUserId?.value ?? null,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
			version: entity.version,
		}
	}
}
