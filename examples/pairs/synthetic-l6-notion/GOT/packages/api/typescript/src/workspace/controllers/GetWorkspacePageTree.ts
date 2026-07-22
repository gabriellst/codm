import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { GetWorkspacePageTree, GetWorkspacePageTreeOutputSchema, PageTreeNodeSchema } from '../usecases/GetWorkspacePageTree'

export const GetWorkspacePageTreeControllerInputSchema = z.object({
	ctx: z.object({ user: z.object({ id: z.string() }) }),
	params: z.object({ workspaceId: z.uuid() }),
})

export const GetWorkspacePageTreeControllerOutputSchema = GetWorkspacePageTreeOutputSchema

export { PageTreeNodeSchema }

@injectable()
export class GetWorkspacePageTreeController extends Controller<
	typeof GetWorkspacePageTreeControllerInputSchema,
	typeof GetWorkspacePageTreeControllerOutputSchema
> {
	readonly path = '/workspaces/:workspaceId/page-tree'
	readonly method = 'get' as const
	readonly description = 'Get the page tree for a workspace'
	readonly inputSchema = GetWorkspacePageTreeControllerInputSchema
	readonly outputSchema = GetWorkspacePageTreeControllerOutputSchema

	override middlewares = [AuthAccountMiddleware]

	constructor(private query: GetWorkspacePageTree) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({
			workspaceId: request.params.workspaceId,
			ownerId: request.ctx.user.id,
		})
		return { status: HttpStatusCode.OK, data }
	}
}
