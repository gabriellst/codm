import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireOwner } from '@owner/middlewares'

import { ListPaymentMethods, ListPaymentMethodsOutputSchema } from '../usecases/billing/ListPaymentMethods'
import { PaymentMethodStatus } from '@template/contracts-typescript/wire/enums'

export const ListPaymentMethodsControllerInput = z
	.object({
		ctx: z.object({
			session: z.object({
				ownerId: z.string(),
			}),
		}),
	})
	.example([{ ctx: { session: { ownerId: 'owner-uuid' } } }])

export const ListPaymentMethodsControllerOutput = ListPaymentMethodsOutputSchema.example([
	{
		paymentMethods: [
			{
				id: 'pm-uuid',
				brand: 'visa',
				last4: '4242',
				expMonth: 12,
				expYear: 2030,
				isDefault: true,
				status: PaymentMethodStatus.ACTIVE,
			},
		],
	},
])

@injectable()
export class ListPaymentMethodsController extends Controller<
	typeof ListPaymentMethodsControllerInput,
	typeof ListPaymentMethodsControllerOutput
> {
	readonly path = '/ui/billing/payment-methods'
	readonly method = 'get' as const
	readonly description = 'List the authenticated owner wallet: stored payment methods, default first'
	readonly inputSchema = ListPaymentMethodsControllerInput
	readonly outputSchema = ListPaymentMethodsControllerOutput

	override middlewares = [AuthAccountMiddleware, RequireOwner]

	constructor(private listPaymentMethods: ListPaymentMethods) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.listPaymentMethods.execute({ ownerId: request.ctx.session.ownerId })

		return {
			status: HttpStatusCode.OK,
			data,
		}
	}
}
