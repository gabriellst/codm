import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireStoreMember } from '@tenancy/middlewares/RequireStoreMember'
import { ListBoards, ListBoardsOutputSchema } from '../usecases/ListBoards'

export const ListBoardsControllerInputSchema = z.object({
	ctx: z.object({ session: z.object({ storeId: z.uuid() }) }),
})

export const ListBoardsControllerOutputSchema = ListBoardsOutputSchema

@injectable()
export class ListBoardsController extends Controller<
	typeof ListBoardsControllerInputSchema,
	typeof ListBoardsControllerOutputSchema
> {
	readonly path = '/boards'
	readonly method = 'get' as const
	readonly description = 'List kanban boards for the active store'
	readonly inputSchema = ListBoardsControllerInputSchema
	readonly outputSchema = ListBoardsControllerOutputSchema
	override middlewares = [AuthAccountMiddleware, RequireStoreMember]

	constructor(private readonly query: ListBoards) { super() }

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ storeId: request.ctx.session.storeId })
		return { status: HttpStatusCode.OK, data }
	}
}
