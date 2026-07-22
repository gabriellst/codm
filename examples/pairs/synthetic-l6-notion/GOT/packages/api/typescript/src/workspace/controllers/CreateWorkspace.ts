import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { CreateWorkspace } from '../usecases/CreateWorkspace'

export const CreateWorkspaceControllerInputSchema = z.object({
	ctx: z.object({ user: z.object({ id: z.string() }) }),
	body: z.object({ name: z.string().min(1) }),
})

export const CreateWorkspaceControllerOutputSchema = z.object({
	workspaceId: z.uuid(),
})

@injectable()
export class CreateWorkspaceController extends Controller<
	typeof CreateWorkspaceControllerInputSchema,
	typeof CreateWorkspaceControllerOutputSchema
> {
	readonly path = '/workspaces'
	readonly method = 'post' as const
	readonly description = 'Create a new workspace'
	readonly inputSchema = CreateWorkspaceControllerInputSchema
	readonly outputSchema = CreateWorkspaceControllerOutputSchema

	override middlewares = [AuthAccountMiddleware]

	constructor(private cmd: CreateWorkspace) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.cmd.execute({
			ownerId: request.ctx.user.id,
			name: request.body.name,
		})
		return { status: HttpStatusCode.CREATED, data }
	}
}
