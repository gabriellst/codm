import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { Handler, z, DrizzleClient } from '@template/core-typescript'
import { TaskStatus, TaskPriority } from '@template/contracts-typescript/wire/enums'
import { clickupBoardView } from '@template/contracts/db'

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
export const GetBoardViewInputSchema = z.object({
	spaceId: z.uuid(),
})

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
export const GetBoardViewOutputSchema = z.object({
	spaceId: z.uuid(),
	columns: z.array(
		z.object({
			status: z.enum(TaskStatus),
			tasks: z.array(
				z.object({
					taskId: z.uuid(),
					title: z.string(),
					priority: z.enum(TaskPriority),
					assigneeIds: z.array(z.uuid()),
					listId: z.uuid(),
				}),
			),
		}),
	),
})

/**
 * `GetBoardView` — returns the Kanban board layout for a given ClickUp space.
 * One column is emitted per `TaskStatus` value (including empty columns) so
 * the frontend can render a stable board regardless of data sparsity.
 */
@injectable()
export class GetBoardView extends Handler<typeof GetBoardViewInputSchema, typeof GetBoardViewOutputSchema> {
	readonly name = 'get_board_view' as const
	readonly inputSchema = GetBoardViewInputSchema
	readonly outputSchema = GetBoardViewOutputSchema

	constructor(private readonly db: DrizzleClient) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const taskRows = await this.db
			.select()
			.from(clickupBoardView)
			.where(eq(clickupBoardView.spaceId, input.spaceId))

		const columns = Object.values(TaskStatus).map(status => ({
			status,
			tasks: taskRows
				.filter(t => t.status === status)
				.map(t => ({
					taskId: t.taskId,
					title: t.title,
					priority: t.priority as TaskPriority,
					assigneeIds: t.assigneeIds,
					listId: t.listId,
				})),
		}))

		return { spaceId: input.spaceId, columns }
	}
}
