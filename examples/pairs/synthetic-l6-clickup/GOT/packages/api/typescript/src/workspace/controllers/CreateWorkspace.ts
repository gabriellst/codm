import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireStoreMember } from '@tenancy/middlewares/RequireStoreMember'
import { CreateWorkspace } from '../usecases/CreateWorkspace'

export const CreateWorkspaceControllerInputSchema = z.object({
	body: z.object({
		name: z.string().min(1),
	}),
	ctx: z.object({
		session: z.object({ storeId: z.uuid() }),
	}),
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
	readonly description = 'Create or retrieve the workspace for the current store'
	readonly inputSchema = CreateWorkspaceControllerInputSchema
	readonly outputSchema = CreateWorkspaceControllerOutputSchema

	override middlewares = [AuthAccountMiddleware, RequireStoreMember]

	constructor(private useCase: CreateWorkspace) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const { workspaceId } = await this.useCase.execute({
			storeId: request.ctx.session.storeId,
			name: request.body.name,
		})
		return { status: HttpStatusCode.OK, data: { workspaceId } }
	}
}
