import { injectable } from 'tsyringe-neo'
import { Handler, z, DrizzleClient } from '@template/core-typescript'
import Z from 'zod'
import { eq } from 'drizzle-orm'
import { pages } from '@template/contracts/db'

export const GetWorkspacePageTreeInputSchema = z.object({
	workspaceId: z.uuid(),
	ownerId: z.uuid(),
})

export type PageTreeNode = { id: string; title: string; children: PageTreeNode[] }
export const PageTreeNodeSchema: Z.ZodType<PageTreeNode> = z.lazy(() =>
	z.object({ id: z.uuid(), title: z.string(), children: z.array(PageTreeNodeSchema) }),
) as Z.ZodType<PageTreeNode>

export const GetWorkspacePageTreeOutputSchema = z.object({
	pages: z.array(PageTreeNodeSchema),
})

@injectable()
export class GetWorkspacePageTree extends Handler<
	typeof GetWorkspacePageTreeInputSchema,
	typeof GetWorkspacePageTreeOutputSchema
> {
	readonly name = 'get_workspace_page_tree' as const
	readonly inputSchema = GetWorkspacePageTreeInputSchema
	readonly outputSchema = GetWorkspacePageTreeOutputSchema

	constructor(private readonly db: DrizzleClient) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const rows = await this.db
			.select({ id: pages.id, title: pages.title, parentPageId: pages.parentPageId })
			.from(pages)
			.where(eq(pages.workspaceId, input.workspaceId))

		const childrenByParent = new Map<string | null, typeof rows>()
		for (const row of rows) {
			const parentId = row.parentPageId ?? null
			if (!childrenByParent.has(parentId)) {
				childrenByParent.set(parentId, [])
			}
			childrenByParent.get(parentId)!.push(row)
		}

		const buildNodes = (parentId: string | null): PageTreeNode[] => {
			const children = childrenByParent.get(parentId) ?? []
			return children.map(row => ({
				id: row.id,
				title: row.title,
				children: buildNodes(row.id),
			}))
		}

		return { pages: buildNodes(null) }
	}
}
