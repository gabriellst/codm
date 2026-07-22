import { z } from '@template/core-typescript'
import { Controller } from '@template/core-typescript'
import { HttpStatusCode } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireOwner } from '@owner/middlewares'
import { SetDefaultPaymentMethod } from '@billing/usecases'

export const SetDefaultPaymentMethodControllerInput = z
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

export const SetDefaultPaymentMethodControllerOutput = z.object({ ok: z.boolean() }).example([{ ok: true }])

@injectable()
export class SetDefaultPaymentMethodController extends Controller<
	typeof SetDefaultPaymentMethodControllerInput,
	typeof SetDefaultPaymentMethodControllerOutput
> {
	readonly path = '/payment-methods/:paymentMethodId/default'
	readonly method = 'post'
	readonly description = 'Make a stored payment method the wallet default (renewals charge the default)'
	readonly inputSchema = SetDefaultPaymentMethodControllerInput
	readonly outputSchema = SetDefaultPaymentMethodControllerOutput

	override middlewares = [AuthAccountMiddleware, RequireOwner]

	constructor(private setDefaultPaymentMethod: SetDefaultPaymentMethod) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.setDefaultPaymentMethod.execute({
			ownerId: request.ctx.session.ownerId,
			paymentMethodId: request.params.paymentMethodId,
		})

		return {
			status: HttpStatusCode.OK,
			data,
		}
	}
}
