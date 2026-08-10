import { injectable } from 'tsyringe-neo'
import { desc, eq } from 'drizzle-orm'
import { DrizzleDatabaseDriver, tryCatchAsync, DrizzleTransaction } from '@codm/core-typescript'
import { artifacts } from '@codm/contracts/db'
import type { ArtifactKind } from '@codm/contracts-typescript/wire/enums'
import { Artifact, ArtifactSchema } from '../../entities/Artifact'
import { ArtifactRepository } from './ArtifactRepository'

@injectable()
export class DrizzleArtifactRepository extends ArtifactRepository {
	constructor(private driver: DrizzleDatabaseDriver) {
		super()
	}

	async findById(id: string, tx?: DrizzleTransaction): Promise<Artifact | undefined> {
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc.select().from(artifacts).where(eq(artifacts.id, id)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async listByThread(threadId: string, tx?: DrizzleTransaction): Promise<Artifact[]> {
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(async () =>
			dbc.select().from(artifacts).where(eq(artifacts.threadId, threadId)).orderBy(desc(artifacts.recordedAt)),
		)
		if (!result.success || !result.data) return []
		return result.data.map(r => this.toDomain(r))
	}

	async save(entity: Artifact, tx?: DrizzleTransaction): Promise<Artifact> {
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			await dbc.insert(artifacts).values(this.toPersistence(entity)).onConflictDoNothing({ target: artifacts.id })
			return entity
		})
		if (!result.success) throw result.error
		return result.data
	}

	async delete(id: string, tx?: DrizzleTransaction): Promise<void> {
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			await dbc.delete(artifacts).where(eq(artifacts.id, id))
		})
		if (!result.success) throw result.error
	}

	private toDomain(row: typeof artifacts.$inferSelect): Artifact {
		const parsed = ArtifactSchema.parse({
			ownerId: row.ownerId,
			threadId: row.threadId,
			issueId: row.issueId ?? undefined,
			kind: row.kind as ArtifactKind,
			name: row.name,
			ref: row.ref,
			meta: row.meta,
			recordedAt: row.recordedAt,
		})
		return new Artifact({ ...parsed, id: row.id, createdAt: row.createdAt })
	}

	private toPersistence(entity: Artifact): typeof artifacts.$inferInsert {
		return {
			id: entity.id.value,
			ownerId: entity.ownerId,
			threadId: entity.threadId,
			issueId: entity.issueId ?? null,
			kind: entity.kind,
			name: entity.name,
			ref: entity.ref,
			meta: entity.meta,
			recordedAt: entity.recordedAt,
			createdAt: entity.createdAt,
		}
	}
}
