import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireStoreMember } from '@tenancy/middlewares/RequireStoreMember'
import { GetBoard, GetBoardOutputSchema } from '../usecases/GetBoard'

export const GetBoardControllerInputSchema = z.object({
	ctx: z.object({ session: z.object({ storeId: z.uuid() }) }),
	params: z.object({ boardId: z.uuid() }),
})

export const GetBoardControllerOutputSchema = GetBoardOutputSchema

@injectable()
export class GetBoardController extends Controller<
	typeof GetBoardControllerInputSchema,
	typeof GetBoardControllerOutputSchema
> {
	readonly path = '/boards/:boardId'
	readonly method = 'get' as const
	readonly description = 'Get a kanban board with its lists and cards'
	readonly inputSchema = GetBoardControllerInputSchema
	readonly outputSchema = GetBoardControllerOutputSchema
	override middlewares = [AuthAccountMiddleware, RequireStoreMember]

	constructor(private readonly query: GetBoard) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({
			storeId: request.ctx.session.storeId,
			boardId: request.params.boardId,
		})
		return { status: HttpStatusCode.OK, data }
	}
}
