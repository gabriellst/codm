import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { pageViewProjection } from '@template/contracts/db'
import { PageViewProjection, type PageViewProjectionProps } from '../PageView'
import { PageViewProjectionRepository } from './PageViewProjectionRepository'

@injectable()
export class DrizzlePageViewProjectionRepository extends PageViewProjectionRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async findByKey(pageId: string, tx?: Transaction): Promise<PageViewProjection | null> {
		const dbClient = (tx ?? this.db) as DrizzleClient
		const result = await tryCatchAsync(async () => {
			const rows = await dbClient
				.select()
				.from(pageViewProjection)
				.where(eq(pageViewProjection.pageId, pageId))
				.limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return null
		return this.toDomain(result.data)
	}

	async save(projection: PageViewProjection, tx?: Transaction): Promise<void> {
		const dbClient = (tx ?? this.db) as DrizzleClient
		const row = this.toPersistence(projection)
		await dbClient
			.insert(pageViewProjection)
			.values(row)
			.onConflictDoUpdate({
				target: pageViewProjection.pageId,
				set: {
					workspaceId: row.workspaceId,
					title: row.title,
					blockTree: row.blockTree,
					childPages: row.childPages,
					updatedAt: row.updatedAt,
				},
			})
	}

	async insertIfNew(projection: PageViewProjection, tx?: Transaction): Promise<boolean> {
		const dbClient = (tx ?? this.db) as DrizzleClient
		const row = this.toPersistence(projection)
		const result = await dbClient
			.insert(pageViewProjection)
			.values(row)
			.onConflictDoNothing()
			.returning()
		return result.length > 0
	}

	private toDomain(row: {
		pageId: string
		workspaceId: string
		title: string
		blockTree: unknown
		childPages: unknown
		updatedAt: Date
	}): PageViewProjection {
		return new PageViewProjection({
			pageId: row.pageId,
			workspaceId: row.workspaceId,
			title: row.title,
			blockTree: row.blockTree as PageViewProjectionProps['blockTree'],
			childPages: row.childPages as PageViewProjectionProps['childPages'],
		})
	}

	private toPersistence(projection: PageViewProjection) {
		return {
			pageId: projection.props.pageId,
			workspaceId: projection.props.workspaceId,
			title: projection.props.title,
			blockTree: projection.props.blockTree,
			childPages: projection.props.childPages,
			updatedAt: new Date(),
		}
	}
}
