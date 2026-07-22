import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireStoreMember } from '@tenancy/middlewares/RequireStoreMember'
import {
	CreatePurchaseOrder,
	CreatePurchaseOrderInputSchema,
	CreatePurchaseOrderOutputSchema,
} from '../usecases/CreatePurchaseOrder'

export const CreatePurchaseOrderControllerInputSchema = z.object({
	ctx: z.object({ user: z.object({ id: z.string() }), session: z.object({ storeId: z.uuid() }) }),
	body: CreatePurchaseOrderInputSchema.omit({ userId: true, storeId: true }),
})

export const CreatePurchaseOrderControllerOutputSchema = CreatePurchaseOrderOutputSchema

@injectable()
export class CreatePurchaseOrderController extends Controller<
	typeof CreatePurchaseOrderControllerInputSchema,
	typeof CreatePurchaseOrderControllerOutputSchema
> {
	readonly path = '/purchase-orders'
	readonly method = 'post' as const
	readonly description = 'Create a supplier purchase order'
	readonly inputSchema = CreatePurchaseOrderControllerInputSchema
	readonly outputSchema = CreatePurchaseOrderControllerOutputSchema

	override middlewares = [AuthAccountMiddleware, RequireStoreMember]

	constructor(private cmd: CreatePurchaseOrder) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.cmd.execute({
			userId: request.ctx.user.id,
			storeId: request.ctx.session.storeId,
			supplierName: request.body.supplierName,
			totalAmount: request.body.totalAmount,
		})
		return { status: HttpStatusCode.CREATED, data }
	}
}
