import { injectable } from 'tsyringe-neo'
import { and, eq, lte } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@codedm/core-typescript'
import { issues } from '@codedm/contracts/db'
import { IssueStatus, ProviderKind, IssueArchiveReason } from '@codedm/contracts-typescript/wire/enums'
import { Issue, IssueSchema } from '../../entities/Issue'
import { IssueRepository } from './IssueRepository'

@injectable()
export class DrizzleIssueRepository extends IssueRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async findById(id: string, tx?: DrizzleClient): Promise<Issue | undefined> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc.select().from(issues).where(eq(issues.id, id)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async findByThreadAndKey(threadId: string, key: string, tx?: DrizzleClient): Promise<Issue | undefined> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc.select().from(issues).where(and(eq(issues.threadId, threadId), eq(issues.key, key))).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async listByThread(threadId: string, tx?: DrizzleClient): Promise<Issue[]> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => dbc.select().from(issues).where(eq(issues.threadId, threadId)))
		if (!result.success || !result.data) return []
		return result.data.map(r => this.toDomain(r))
	}

	async existingKeys(threadId: string, tx?: DrizzleClient): Promise<string[]> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => dbc.select({ key: issues.key }).from(issues).where(eq(issues.threadId, threadId)))
		if (!result.success || !result.data) return []
		return result.data.map(r => r.key)
	}

	async completedBefore(cutoff: Date, tx?: DrizzleClient): Promise<Issue[]> {
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () =>
			dbc
				.select()
				.from(issues)
				.where(and(eq(issues.status, IssueStatus.COMPLETED), eq(issues.archived, false), lte(issues.completedAt, cutoff))),
		)
		if (!result.success || !result.data) return []
		return result.data.map(r => this.toDomain(r))
	}

	async save(entity: Issue, tx?: DrizzleClient): Promise<Issue> {
		entity.incrementVersion()
		const dbc = tx ?? this.db
		const result = await tryCatchAsync(async () => {
			const data = this.toPersistence(entity)
			await dbc
				.insert(issues)
				.values(data)
				.onConflictDoUpdate({
					target: issues.id,
					set: {
						title: data.title,
						status: data.status,
						meta: data.meta,
						archived: data.archived,
						archiveReason: data.archiveReason,
						completedAt: data.completedAt,
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
			await dbc.delete(issues).where(eq(issues.id, id))
		})
		if (!result.success) throw result.error
	}

	private toDomain(row: typeof issues.$inferSelect): Issue {
		const parsed = IssueSchema.parse({
			ownerId: row.ownerId,
			threadId: row.threadId,
			key: row.key,
			title: row.title,
			status: row.status as IssueStatus,
			provider: row.provider as ProviderKind,
			meta: row.meta ?? undefined,
			archived: row.archived,
			archiveReason: (row.archiveReason ?? undefined) as IssueArchiveReason | undefined,
			completedAt: row.completedAt ?? undefined,
		})
		return new Issue({ ...parsed, id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt, version: row.version })
	}

	private toPersistence(entity: Issue): typeof issues.$inferInsert {
		return {
			id: entity.id.value,
			ownerId: entity.ownerId,
			threadId: entity.threadId,
			key: entity.key,
			title: entity.title,
			status: entity.status,
			provider: entity.provider,
			meta: entity.meta ?? null,
			archived: entity.archived,
			archiveReason: entity.archiveReason ?? null,
			completedAt: entity.completedAt ?? null,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
			version: entity.version,
		}
	}
}
