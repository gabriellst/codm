// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-order-detail-read
// task:        synthetic-order-detail-read
// stamp:       agent-wave1-38ff876
// docTreeHash: c7182ff522b7
// model:       default
// graded:      2026-07-21T18:31:33.664Z
// source:      packages/api/typescript/src/ui/controllers/GetOrder.ts (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireOwner } from '@owner/middlewares'
import { CurrencyCode, OrderStatus } from '@template/contracts-typescript/wire/enums'

import { GetOrder, GetOrderOutputSchema } from '../usecases/GetOrder'

export const GetOrderControllerInput = z
	.object({
		params: z.object({
			orderId: z.string(),
		}),
		ctx: z.object({
			session: z.object({
				ownerId: z.string(),
			}),
		}),
	})
	.example([{ params: { orderId: 'order-uuid' }, ctx: { session: { ownerId: 'owner-uuid' } } }])

export const GetOrderControllerOutput = GetOrderOutputSchema.example([
	{
		id: 'order-uuid',
		status: OrderStatus.PAID,
		totalCents: 12900,
		currency: CurrencyCode.BRL,
		createdAt: new Date('2026-07-01T00:00:00Z'),
	},
])

@injectable()
export class GetOrderController extends Controller<typeof GetOrderControllerInput, typeof GetOrderControllerOutput> {
	readonly path = '/orders/:orderId'
	readonly method = 'get' as const
	readonly description = 'Get the detail of a single order owned by the authenticated owner'
	readonly inputSchema = GetOrderControllerInput
	readonly outputSchema = GetOrderControllerOutput

	override middlewares = [AuthAccountMiddleware, RequireOwner]

	constructor(private getOrder: GetOrder) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.getOrder.execute({
			ownerId: request.ctx.session.ownerId,
			orderId: request.params.orderId,
		})

		return {
			status: HttpStatusCode.OK,
			data,
		}
	}
}
