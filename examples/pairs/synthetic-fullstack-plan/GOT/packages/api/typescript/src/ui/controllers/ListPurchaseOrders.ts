import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireStoreMember } from '@tenancy/middlewares/RequireStoreMember'
import { PurchaseOrderStatus } from '@codedm/contracts-typescript/wire/enums'
import { ListPurchaseOrders, ListPurchaseOrdersOutputSchema } from '../usecases/ListPurchaseOrders'

export const ListPurchaseOrdersControllerInputSchema = z.object({
	ctx: z.object({
		session: z.object({ storeId: z.uuid() }),
	}),
	query: z.paginatedQuery({
		status: z.enum(PurchaseOrderStatus).optional(),
	}),
})

export const ListPurchaseOrdersControllerOutputSchema = ListPurchaseOrdersOutputSchema

@injectable()
export class ListPurchaseOrdersController extends Controller<
	typeof ListPurchaseOrdersControllerInputSchema,
	typeof ListPurchaseOrdersControllerOutputSchema
> {
	readonly path = '/purchase-orders'
	readonly method = 'get' as const
	readonly description = 'Purchase orders table read'
	readonly inputSchema = ListPurchaseOrdersControllerInputSchema
	readonly outputSchema = ListPurchaseOrdersControllerOutputSchema

	override middlewares = [AuthAccountMiddleware, RequireStoreMember]

	constructor(private query: ListPurchaseOrders) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({
			storeId: request.ctx.session.storeId,
			status: request.query.status,
			page: request.query.page,
			limit: request.query.limit,
			search: request.query.search,
		})
		return { status: HttpStatusCode.OK, data }
	}
}
