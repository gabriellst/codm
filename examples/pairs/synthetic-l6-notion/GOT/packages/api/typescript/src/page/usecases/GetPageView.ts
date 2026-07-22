import { injectable } from 'tsyringe-neo'
import { Handler, z, DrizzleClient, BaseError } from '@template/core-typescript'
import Z from 'zod'
import { eq } from 'drizzle-orm'
import { pageViewProjection } from '@template/contracts/db'
import { BlockType } from '@template/contracts-typescript/wire/enums'
import type { PageApplicationErrors } from '../errors'

export const GetPageViewInputSchema = z.object({
	pageId: z.uuid(),
	ownerId: z.uuid(),
})

export type BlockNode = { id: string; type: BlockType; content: string; order: number; children: BlockNode[] }
export const BlockNodeSchema: Z.ZodType<BlockNode> = z.lazy(() =>
	z.object({
		id: z.uuid(),
		type: z.enum(BlockType),
		content: z.string(),
		order: z.number().int(),
		children: z.array(BlockNodeSchema),
	}),
) as Z.ZodType<BlockNode>

export const GetPageViewOutputSchema = z.object({
	pageId: z.uuid(),
	workspaceId: z.uuid(),
	title: z.string(),
	blocks: z.array(BlockNodeSchema),
	childPages: z.array(z.object({ id: z.uuid(), title: z.string() })),
})

@injectable()
export class GetPageView extends Handler<
	typeof GetPageViewInputSchema,
	typeof GetPageViewOutputSchema
> {
	readonly name = 'get_page_view' as const
	readonly inputSchema = GetPageViewInputSchema
	readonly outputSchema = GetPageViewOutputSchema

	constructor(private readonly db: DrizzleClient) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const rows = await this.db
			.select()
			.from(pageViewProjection)
			.where(eq(pageViewProjection.pageId, input.pageId))
			.limit(1)

		const row = rows[0]
		if (!row) {
			throw new BaseError<PageApplicationErrors>('PAGE_NOT_FOUND')
		}

		return {
			pageId: row.pageId,
			workspaceId: row.workspaceId,
			title: row.title,
			blocks: row.blockTree as BlockNode[],
			childPages: row.childPages as Array<{ id: string; title: string }>,
		}
	}
}
