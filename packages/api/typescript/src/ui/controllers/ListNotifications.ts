import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { ListNotifications, ListNotificationsOutputSchema } from '../usecases/ListNotifications'

export const ListNotificationsControllerInputSchema = z.object({
	ctx: z.object({
		user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
		session: z.object({ ownerId: z.uuid().nullable() }),
	}),
	query: z.paginatedQuery({
		unreadOnly: z.stringToBoolean().optional(),
	}),
})

export const ListNotificationsControllerOutputSchema = ListNotificationsOutputSchema

@injectable()
export class ListNotificationsController extends Controller<
	typeof ListNotificationsControllerInputSchema,
	typeof ListNotificationsControllerOutputSchema
> {
	readonly path = '/ui/notifications'
	readonly method = 'get' as const
	readonly description = 'Header notifications list'
	readonly inputSchema = ListNotificationsControllerInputSchema
	readonly outputSchema = ListNotificationsControllerOutputSchema

	override middlewares = [AuthAccountMiddleware]

	constructor(private query: ListNotifications) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({
			userId: request.ctx.user.id,
			unreadOnly: request.query.unreadOnly,
			page: request.query.page,
			limit: request.query.limit,
			search: request.query.search,
		})
		return { status: HttpStatusCode.OK, data }
	}
}
