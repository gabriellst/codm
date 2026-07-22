import { injectable } from 'tsyringe-neo'
import { eq, asc } from 'drizzle-orm'
import { Handler, z, DrizzleClient } from '@codedm/core-typescript'
import { TaskStatus, TaskPriority } from '@codedm/contracts-typescript/wire/enums'
import { clickupListView, lists, spaces } from '@codedm/contracts/db'

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
export const GetListViewInputSchema = z.object({
	spaceId: z.uuid(),
})

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
export const GetListViewOutputSchema = z.object({
	spaceId: z.uuid(),
	spaceName: z.string(),
	lists: z.array(
		z.object({
			listId: z.uuid(),
			name: z.string(),
			position: z.number().int(),
			tasks: z.array(
				z.object({
					taskId: z.uuid(),
					title: z.string(),
					status: z.enum(TaskStatus),
					priority: z.enum(TaskPriority),
					assigneeIds: z.array(z.uuid()),
					position: z.number().int(),
				}),
			),
		}),
	),
})

/**
 * `GetListView` — returns the full list-view layout for a given ClickUp space:
 * the space name, all lists ordered by position, and their tasks grouped and
 * ordered by position within each list.
 */
@injectable()
export class GetListView extends Handler<typeof GetListViewInputSchema, typeof GetListViewOutputSchema> {
	readonly name = 'get_list_view' as const
	readonly inputSchema = GetListViewInputSchema
	readonly outputSchema = GetListViewOutputSchema

	constructor(private readonly db: DrizzleClient) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const [space] = await this.db.select().from(spaces).where(eq(spaces.id, input.spaceId)).limit(1)
		const spaceName = space?.name ?? ''

		const listRows = await this.db
			.select()
			.from(lists)
			.where(eq(lists.spaceId, input.spaceId))
			.orderBy(asc(lists.position))

		const taskRows = await this.db
			.select()
			.from(clickupListView)
			.where(eq(clickupListView.spaceId, input.spaceId))
			.orderBy(asc(clickupListView.position))

		const mappedLists = listRows.map(l => ({
			listId: l.id,
			name: l.name,
			position: l.position,
			tasks: taskRows
				.filter(t => t.listId === l.id)
				.map(t => ({
					taskId: t.taskId,
					title: t.title,
					status: t.status as TaskStatus,
					priority: t.priority as TaskPriority,
					assigneeIds: t.assigneeIds,
					position: t.position,
				})),
		}))

		return { spaceId: input.spaceId, spaceName, lists: mappedLists }
	}
}
