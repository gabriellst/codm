import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { OperatorMiddleware } from '@auth/middlewares'
import { ListWorkspaces, ListWorkspacesOutputSchema } from '../usecases/ListWorkspaces'

export const ListWorkspacesControllerInputSchema = z.object({
	ctx: z.object({ ownerId: z.uuid() }),
})

export const ListWorkspacesControllerOutputSchema = ListWorkspacesOutputSchema

@injectable()
export class ListWorkspacesController extends Controller<
	typeof ListWorkspacesControllerInputSchema,
	typeof ListWorkspacesControllerOutputSchema
> {
	readonly path = '/workspaces'
	readonly method = 'get' as const
	readonly description = 'List registered workspaces with badges and thread counts (T07)'
	readonly inputSchema = ListWorkspacesControllerInputSchema
	readonly outputSchema = ListWorkspacesControllerOutputSchema

	override middlewares = [OperatorMiddleware]

	constructor(private listWorkspaces: ListWorkspaces) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.listWorkspaces.execute({ ownerId: request.ctx.ownerId })
		return { status: HttpStatusCode.OK, data }
	}
}
