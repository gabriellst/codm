import { injectable } from 'tsyringe-neo'
import { eq, sql } from 'drizzle-orm'
import { Handler, z, DrizzleClient } from '@template/core-typescript'
import { workspaces, threads } from '@template/contracts/db'
import { WorkspaceBadge } from '@template/contracts-typescript/wire/enums'

export const ListWorkspacesInputSchema = z.object({
	ownerId: z.uuid(),
})

export const ListWorkspacesOutputSchema = z.object({
	workspaces: z.array(
		z.object({
			workspaceId: z.uuid(),
			path: z.string(),
			badges: z.array(z.enum(WorkspaceBadge)),
			threadCount: z.number().int(),
			addedAt: z.date(),
		}),
	),
})

/**
 * Read — Workspaces (T07). The registered folders + their badges and thread counts. Reads the
 * workspace table with a correlated count against `threads` (BFF pattern; a table read, not a
 * cross-context write-model import).
 */
@injectable()
export class ListWorkspaces extends Handler<typeof ListWorkspacesInputSchema, typeof ListWorkspacesOutputSchema> {
	readonly name = 'list_workspaces' as const
	readonly inputSchema = ListWorkspacesInputSchema
	readonly outputSchema = ListWorkspacesOutputSchema

	constructor(private readonly db: DrizzleClient) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const threadCount = sql<number>`cast(count(${threads.id}) as int)`
		const rows = await this.db
			.select({
				workspaceId: workspaces.id,
				path: workspaces.path,
				badges: workspaces.badges,
				addedAt: workspaces.addedAt,
				threadCount,
			})
			.from(workspaces)
			.leftJoin(threads, eq(threads.workspaceId, workspaces.id))
			.where(eq(workspaces.ownerId, input.ownerId))
			.groupBy(workspaces.id)

		return {
			workspaces: rows.map(r => ({
				workspaceId: r.workspaceId,
				path: r.path,
				badges: (r.badges ?? []) as WorkspaceBadge[],
				threadCount: r.threadCount ?? 0,
				addedAt: r.addedAt,
			})),
		}
	}
}
