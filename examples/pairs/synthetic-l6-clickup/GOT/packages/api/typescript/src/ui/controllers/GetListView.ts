import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireStoreMember } from '@tenancy/middlewares/RequireStoreMember'
import { GetListView, GetListViewOutputSchema } from '../usecases/GetListView'

export const GetListViewControllerInputSchema = z.object({
	params: z.object({
		spaceId: z.uuid(),
	}),
	ctx: z.object({
		session: z.object({
			storeId: z.uuid(),
		}),
	}),
})

export const GetListViewControllerOutputSchema = GetListViewOutputSchema

@injectable()
export class GetListViewController extends Controller<
	typeof GetListViewControllerInputSchema,
	typeof GetListViewControllerOutputSchema
> {
	readonly path = '/spaces/:spaceId/list-view'
	readonly method = 'get' as const
	readonly description = 'Get list view for a space'
	readonly inputSchema = GetListViewControllerInputSchema
	readonly outputSchema = GetListViewControllerOutputSchema

	override middlewares = [AuthAccountMiddleware, RequireStoreMember]

	constructor(private query: GetListView) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ spaceId: request.params.spaceId })
		return { status: HttpStatusCode.OK, data }
	}
}
