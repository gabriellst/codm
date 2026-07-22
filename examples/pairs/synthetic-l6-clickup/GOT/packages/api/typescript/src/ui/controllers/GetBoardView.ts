import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireStoreMember } from '@tenancy/middlewares/RequireStoreMember'
import { GetBoardView, GetBoardViewOutputSchema } from '../usecases/GetBoardView'

export const GetBoardViewControllerInputSchema = z.object({
	params: z.object({
		spaceId: z.uuid(),
	}),
	ctx: z.object({
		session: z.object({
			storeId: z.uuid(),
		}),
	}),
})

export const GetBoardViewControllerOutputSchema = GetBoardViewOutputSchema

@injectable()
export class GetBoardViewController extends Controller<
	typeof GetBoardViewControllerInputSchema,
	typeof GetBoardViewControllerOutputSchema
> {
	readonly path = '/spaces/:spaceId/board-view'
	readonly method = 'get' as const
	readonly description = 'Get board view for a space'
	readonly inputSchema = GetBoardViewControllerInputSchema
	readonly outputSchema = GetBoardViewControllerOutputSchema

	override middlewares = [AuthAccountMiddleware, RequireStoreMember]

	constructor(private query: GetBoardView) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ spaceId: request.params.spaceId })
		return { status: HttpStatusCode.OK, data }
	}
}
