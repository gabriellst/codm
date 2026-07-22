import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireStoreMember } from '@tenancy/middlewares/RequireStoreMember'
import { AssignTask } from '@task/usecases'

export const AssignTaskControllerInputSchema = z.object({
	params: z.object({
		taskId: z.uuid(),
	}),
	body: z.object({
		assigneeIds: z.array(z.uuid()),
	}),
	ctx: z.object({
		session: z.object({ storeId: z.uuid() }),
	}),
})

export const AssignTaskControllerOutputSchema = z.object({
	taskId: z.uuid(),
})

@injectable()
export class AssignTaskController extends Controller<
	typeof AssignTaskControllerInputSchema,
	typeof AssignTaskControllerOutputSchema
> {
	readonly path = '/tasks/:taskId/assignees'
	readonly method = 'post' as const
	readonly description = 'Assign members to a task'
	readonly inputSchema = AssignTaskControllerInputSchema
	readonly outputSchema = AssignTaskControllerOutputSchema

	override middlewares = [AuthAccountMiddleware, RequireStoreMember]

	constructor(private assignTask: AssignTask) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.assignTask.execute({
			taskId: request.params.taskId,
			assigneeIds: request.body.assigneeIds,
		})
		return { status: HttpStatusCode.OK, data }
	}
}
