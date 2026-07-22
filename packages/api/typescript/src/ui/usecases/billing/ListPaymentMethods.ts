import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@template/core-typescript'

import { PaymentMethodRepository } from '@billing/repositories'
import { PaymentMethodStatus, PaymentMethodType } from '@template/contracts-typescript/wire/enums'

export const ListPaymentMethodsInputSchema = z.object({ ownerId: z.string().min(1) })
export const ListPaymentMethodsOutputSchema = z.object({
	paymentMethods: z.array(
		z.object({
			id: z.string(),
			brand: z.string(),
			last4: z.string(),
			expMonth: z.number().int(),
			expYear: z.number().int(),
			isDefault: z.boolean(),
			status: z.enum(PaymentMethodStatus),
		}),
	),
})

@injectable()
export class ListPaymentMethods extends Handler<typeof ListPaymentMethodsInputSchema, typeof ListPaymentMethodsOutputSchema> {
	readonly name = 'list_payment_methods' as const
	readonly inputSchema = ListPaymentMethodsInputSchema
	readonly outputSchema = ListPaymentMethodsOutputSchema

	constructor(private paymentMethods: PaymentMethodRepository) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const methods = await this.paymentMethods.findAllByOwnerId(input.ownerId)
		return {
			paymentMethods: methods.map(pm => {
				const { instrument } = pm
				const view =
					instrument.type === PaymentMethodType.CARD
						? { brand: instrument.brand, last4: instrument.last4, expMonth: instrument.expMonth, expYear: instrument.expYear }
						: // wallets: surface last4 and network as brand — same convention as the card view
							{ brand: instrument.network, last4: instrument.last4, expMonth: 0, expYear: 0 }
				return { id: pm.id.value, ...view, isDefault: pm.isDefault, status: pm.status }
			}),
		}
	}
}
