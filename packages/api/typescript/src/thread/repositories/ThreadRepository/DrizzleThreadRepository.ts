import { injectable } from 'tsyringe-neo'
import { and, eq } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@template/core-typescript'
import { threads } from '@template/contracts/db'
import type { ProviderKind, ContactKind, ThreadStatus, BufferSize } from '@template/contracts-typescript/wire/enums'
import { Thread, ThreadSchema, type MentionGate, type Participant } from '../../entities/Thread'
import { ThreadRepository } from './ThreadRepository'

@injectable()
export class DrizzleThreadRepository extends ThreadRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async findById(id: string, tx?: DrizzleClient): Promise<Thread | undefined> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc.select().from(threads).where(eq(threads.id, id)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async findByChannelContact(channelId: string, contactExternalId: string, tx?: DrizzleClient): Promise<Thread | undefined> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc
				.select()
				.from(threads)
				.where(and(eq(threads.channelId, channelId), eq(threads.contactExternalId, contactExternalId)))
				.limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async listByOwner(ownerId: string, tx?: DrizzleClient): Promise<Thread[]> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => dbc.select().from(threads).where(eq(threads.ownerId, ownerId)))
		if (!result.success || !result.data) return []
		return result.data.map(row => this.toDomain(row))
	}

	async save(entity: Thread, tx?: DrizzleClient): Promise<Thread> {
		entity.incrementVersion()
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const data = this.toPersistence(entity)
			await dbc
				.insert(threads)
				.values(data)
				.onConflictDoUpdate({
					target: threads.id,
					set: {
						providers: data.providers,
						paused: data.paused,
						mentionGateEnabled: data.mentionGateEnabled,
						mentionGateTag: data.mentionGateTag,
						participants: data.participants,
						bufferSize: data.bufferSize,
						status: data.status,
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
			await dbc.delete(threads).where(eq(threads.id, id))
		})
		if (!result.success) throw result.error
	}

	private toDomain(row: typeof threads.$inferSelect): Thread {
		const mentionGate: MentionGate = row.mentionGateEnabled
			? { enabled: true, tag: row.mentionGateTag ?? '' }
			: { enabled: false }
		const parsed = ThreadSchema.parse({
			ownerId: row.ownerId,
			channelId: row.channelId,
			contactRef: { externalId: row.contactExternalId, displayName: row.contactDisplayName, kind: row.contactKind as ContactKind },
			workspaceId: row.workspaceId,
			providers: row.providers as ProviderKind[],
			paused: row.paused,
			mentionGate,
			participants: row.participants as Participant[],
			bufferSize: row.bufferSize as BufferSize,
			status: row.status as ThreadStatus,
		})
		return new Thread({ ...parsed, id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt, version: row.version })
	}

	private toPersistence(entity: Thread): typeof threads.$inferInsert {
		return {
			id: entity.id.value,
			ownerId: entity.ownerId,
			channelId: entity.channelId,
			contactExternalId: entity.contactRef.externalId,
			contactDisplayName: entity.contactRef.displayName,
			contactKind: entity.contactRef.kind,
			workspaceId: entity.workspaceId,
			providers: entity.providers,
			paused: entity.paused,
			mentionGateEnabled: entity.mentionGate.enabled,
			mentionGateTag: entity.mentionGate.enabled ? entity.mentionGate.tag : null,
			participants: entity.participants,
			bufferSize: entity.bufferSize,
			status: entity.status,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
			version: entity.version,
		}
	}
}
