import { Handler } from '@template/core-typescript'
import { BaseError } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'

import { PaymentMethodRepository } from '@billing/repositories'
import type { ApplicationErrors, InterfaceErrors } from '@billing/errors'
import { PaymentMethodStatus } from '@template/contracts-typescript/wire/enums'

export const SetDefaultPaymentMethodInputSchema = z.object({
	ownerId: z.string().min(1),
	paymentMethodId: z.string().min(1),
})

export const SetDefaultPaymentMethodOutputSchema = z.object({ ok: z.boolean() })

/**
 * Moves the wallet's default flag to the given payment method (spec Decision 7).
 *
 * The target must belong to the owner and be ACTIVE — the default is what MIT
 * renewals charge, so an EXPIRED card can never be promoted. The flag move is
 * atomic: `setDefault` demotes the current default and promotes the target
 * inside one transaction.
 */
@injectable()
export class SetDefaultPaymentMethod extends Handler<
	typeof SetDefaultPaymentMethodInputSchema,
	typeof SetDefaultPaymentMethodOutputSchema
> {
	readonly name = 'set_default_payment_method' as const
	readonly inputSchema = SetDefaultPaymentMethodInputSchema
	readonly outputSchema = SetDefaultPaymentMethodOutputSchema

	constructor(private paymentMethods: PaymentMethodRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const paymentMethod = await this.paymentMethods.findById(input.paymentMethodId, tx)
			if (!paymentMethod || paymentMethod.ownerId !== input.ownerId) {
				throw new BaseError<InterfaceErrors>('UNAUTHORIZED')
			}
			if (paymentMethod.status !== PaymentMethodStatus.ACTIVE) {
				throw new BaseError<ApplicationErrors>('PAYMENT_METHOD_NOT_FOUND', 'Only an active payment method can become the default')
			}
			await this.paymentMethods.setDefault(input.paymentMethodId, input.ownerId, tx)
			return { ok: true }
		})
	}
}
