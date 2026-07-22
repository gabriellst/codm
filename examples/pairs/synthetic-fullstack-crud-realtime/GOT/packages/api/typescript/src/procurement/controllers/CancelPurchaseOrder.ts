import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireStoreMember } from '@tenancy/middlewares/RequireStoreMember'
import { CancelPurchaseOrder, CancelPurchaseOrderOutputSchema } from '../usecases/CancelPurchaseOrder'

export const CancelPurchaseOrderControllerInputSchema = z.object({
	ctx: z.object({
		user: z.object({ id: z.string() }),
		session: z.object({ storeId: z.uuid() }),
	}),
	params: z.object({
		id: z.uuid(),
	}),
})

export const CancelPurchaseOrderControllerOutputSchema = CancelPurchaseOrderOutputSchema

@injectable()
export class CancelPurchaseOrderController extends Controller<
	typeof CancelPurchaseOrderControllerInputSchema,
	typeof CancelPurchaseOrderControllerOutputSchema
> {
	readonly path = '/purchase-orders/:id/cancel'
	readonly method = 'post' as const
	readonly description = 'Cancel a supplier purchase order'
	readonly inputSchema = CancelPurchaseOrderControllerInputSchema
	readonly outputSchema = CancelPurchaseOrderControllerOutputSchema

	override middlewares = [AuthAccountMiddleware, RequireStoreMember]

	constructor(private cmd: CancelPurchaseOrder) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.cmd.execute({
			userId: request.ctx.user.id,
			purchaseOrderId: request.params.id,
		})
		return { status: HttpStatusCode.OK, data }
	}
}
