import { z } from '@template/core-typescript'
import { Controller } from '@template/core-typescript'
import { HttpStatusCode } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireOwner } from '@owner/middlewares'
import { RemovePaymentMethod } from '@billing/usecases'

export const RemovePaymentMethodControllerInput = z
	.object({
		params: z.object({
			paymentMethodId: z.string(),
		}),
		ctx: z.object({
			session: z.object({
				ownerId: z.string(),
			}),
		}),
	})
	.example([
		{
			params: { paymentMethodId: 'pm-uuid' },
			ctx: { session: { ownerId: 'owner-uuid' } },
		},
	])

export const RemovePaymentMethodControllerOutput = z.object({ ok: z.boolean() }).example([{ ok: true }])

@injectable()
export class RemovePaymentMethodController extends Controller<
	typeof RemovePaymentMethodControllerInput,
	typeof RemovePaymentMethodControllerOutput
> {
	readonly path = '/payment-methods/:paymentMethodId'
	readonly method = 'delete'
	readonly description = 'Remove a non-default stored payment method from the wallet (the last active card cannot be removed)'
	readonly inputSchema = RemovePaymentMethodControllerInput
	readonly outputSchema = RemovePaymentMethodControllerOutput

	override middlewares = [AuthAccountMiddleware, RequireOwner]

	constructor(private removePaymentMethod: RemovePaymentMethod) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.removePaymentMethod.execute({
			ownerId: request.ctx.session.ownerId,
			paymentMethodId: request.params.paymentMethodId,
		})

		return {
			status: HttpStatusCode.OK,
			data,
		}
	}
}
