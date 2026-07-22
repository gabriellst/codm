import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireStoreMember } from '@tenancy/middlewares/RequireStoreMember'
import { TaskPriority } from '@template/contracts-typescript/wire/enums'
import { CreateTask } from '@task/usecases'

export const CreateTaskControllerInputSchema = z.object({
	body: z.object({
		spaceId: z.uuid(),
		listId: z.uuid(),
		title: z.string().min(1),
		priority: z.enum(TaskPriority).optional(),
		assigneeIds: z.array(z.uuid()).optional(),
	}),
	ctx: z.object({
		session: z.object({ storeId: z.uuid() }),
	}),
})

export const CreateTaskControllerOutputSchema = z.object({
	taskId: z.uuid(),
})

@injectable()
export class CreateTaskController extends Controller<
	typeof CreateTaskControllerInputSchema,
	typeof CreateTaskControllerOutputSchema
> {
	readonly path = '/tasks'
	readonly method = 'post' as const
	readonly description = 'Create a new task'
	readonly inputSchema = CreateTaskControllerInputSchema
	readonly outputSchema = CreateTaskControllerOutputSchema

	override middlewares = [AuthAccountMiddleware, RequireStoreMember]

	constructor(private createTask: CreateTask) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.createTask.execute({
			workspaceId: request.ctx.session.storeId,
			spaceId: request.body.spaceId,
			listId: request.body.listId,
			title: request.body.title,
			priority: request.body.priority ?? TaskPriority.NORMAL,
			assigneeIds: request.body.assigneeIds ?? [],
		})
		return { status: HttpStatusCode.OK, data }
	}
}
