import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { pages, blocks } from '@template/contracts/db'
import { BlockType } from '@template/contracts-typescript/wire/enums'
import { Page, PageSchema } from '../../entities/Page'
import { buildTree, flattenTree } from '../../objects/Block'
import { PageRepository } from './PageRepository'

@injectable()
export class DrizzlePageRepository extends PageRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	async save(page: Page, tx?: Transaction): Promise<Page> {
		page.incrementVersion()
		const dbc = (tx ?? this.db) as DrizzleClient
		const result = await tryCatchAsync(async () => {
			await dbc
				.insert(pages)
				.values({
					id: page.id.value,
					workspaceId: page.workspaceId,
					parentPageId: page.parentPageId,
					title: page.title,
					version: page.version,
					updatedAt: new Date(),
				})
				.onConflictDoUpdate({
					target: pages.id,
					set: {
						workspaceId: page.workspaceId,
						parentPageId: page.parentPageId,
						title: page.title,
						version: page.version,
						updatedAt: new Date(),
					},
				})

			await dbc.delete(blocks).where(eq(blocks.pageId, page.id.value))

			const rows = flattenTree(page.blocks, null)
			if (rows.length > 0) {
				await dbc.insert(blocks).values(
					rows.map(r => ({
						id: r.id,
						pageId: page.id.value,
						parentBlockId: r.parentBlockId,
						type: r.type,
						content: r.content,
						position: r.position,
					})),
				)
			}

			return page
		})
		if (!result.success) throw result.error
		return result.data
	}

	async findById(id: string, tx?: Transaction): Promise<Page | undefined> {
		const dbc = (tx ?? this.db) as DrizzleClient
		const result = await tryCatchAsync(async () => {
			const pageRows = await dbc.select().from(pages).where(eq(pages.id, id)).limit(1)
			if (pageRows.length === 0) return undefined
			const pageRow = pageRows[0]!

			const blockRows = await dbc.select().from(blocks).where(eq(blocks.pageId, id))
			const tree = buildTree(
				blockRows.map(r => ({
					id: r.id,
					parentBlockId: r.parentBlockId ?? null,
					type: r.type as BlockType,
					content: r.content,
					position: r.position,
				})),
			)

			const parsed = PageSchema.parse({
				workspaceId: pageRow.workspaceId,
				parentPageId: pageRow.parentPageId ?? null,
				title: pageRow.title,
				blocks: tree,
			})

			return new Page({
				...parsed,
				id: pageRow.id,
				createdAt: pageRow.createdAt,
				updatedAt: pageRow.updatedAt,
				version: pageRow.version,
			})
		})
		if (!result.success) return undefined
		return result.data
	}

	async delete(id: string, tx?: Transaction): Promise<void> {
		const dbc = (tx ?? this.db) as DrizzleClient
		const result = await tryCatchAsync(async () => {
			await dbc.delete(blocks).where(eq(blocks.pageId, id))
			await dbc.delete(pages).where(eq(pages.id, id))
		})
		if (!result.success) throw result.error
	}
}
