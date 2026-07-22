import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireStoreMember } from '@tenancy/middlewares/RequireStoreMember'
import { TaskStatus } from '@template/contracts-typescript/wire/enums'
import { ChangeTaskStatus } from '@task/usecases'

export const ChangeTaskStatusControllerInputSchema = z.object({
	params: z.object({
		taskId: z.uuid(),
	}),
	body: z.object({
		toStatus: z.enum(TaskStatus),
	}),
	ctx: z.object({
		session: z.object({ storeId: z.uuid() }),
	}),
})

export const ChangeTaskStatusControllerOutputSchema = z.object({
	taskId: z.uuid(),
	status: z.enum(TaskStatus),
})

@injectable()
export class ChangeTaskStatusController extends Controller<
	typeof ChangeTaskStatusControllerInputSchema,
	typeof ChangeTaskStatusControllerOutputSchema
> {
	readonly path = '/tasks/:taskId/status'
	readonly method = 'post' as const
	readonly description = 'Change the status of a task'
	readonly inputSchema = ChangeTaskStatusControllerInputSchema
	readonly outputSchema = ChangeTaskStatusControllerOutputSchema

	override middlewares = [AuthAccountMiddleware, RequireStoreMember]

	constructor(private changeTaskStatus: ChangeTaskStatus) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.changeTaskStatus.execute({
			taskId: request.params.taskId,
			toStatus: request.body.toStatus,
		})
		return { status: HttpStatusCode.OK, data }
	}
}
