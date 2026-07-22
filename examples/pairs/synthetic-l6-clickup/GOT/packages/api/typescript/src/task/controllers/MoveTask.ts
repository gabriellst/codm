import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireStoreMember } from '@tenancy/middlewares/RequireStoreMember'
import { MoveTask } from '@task/usecases'

export const MoveTaskControllerInputSchema = z.object({
	params: z.object({
		taskId: z.uuid(),
	}),
	body: z.object({
		listId: z.uuid(),
	}),
	ctx: z.object({
		session: z.object({ storeId: z.uuid() }),
	}),
})

export const MoveTaskControllerOutputSchema = z.object({
	taskId: z.uuid(),
})

@injectable()
export class MoveTaskController extends Controller<
	typeof MoveTaskControllerInputSchema,
	typeof MoveTaskControllerOutputSchema
> {
	readonly path = '/tasks/:taskId/move'
	readonly method = 'post' as const
	readonly description = 'Move a task to a different list'
	readonly inputSchema = MoveTaskControllerInputSchema
	readonly outputSchema = MoveTaskControllerOutputSchema

	override middlewares = [AuthAccountMiddleware, RequireStoreMember]

	constructor(private moveTask: MoveTask) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.moveTask.execute({
			taskId: request.params.taskId,
			listId: request.body.listId,
		})
		return { status: HttpStatusCode.OK, data }
	}
}
