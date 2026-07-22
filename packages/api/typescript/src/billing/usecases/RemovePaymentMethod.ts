import { Handler } from '@template/core-typescript'
import { BaseError } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'

import { PaymentMethodRepository } from '@billing/repositories'
import type { InterfaceErrors } from '@billing/errors'
import { PaymentMethodStatus } from '@template/contracts-typescript/wire/enums'

export const RemovePaymentMethodInputSchema = z.object({
	ownerId: z.string().min(1),
	paymentMethodId: z.string().min(1),
})

export const RemovePaymentMethodOutputSchema = z.object({ ok: z.boolean() })

/**
 * Removes a stored payment method from the owner's wallet.
 *
 * Invariants (spec Decision 7): the wallet may never empty out (renewals charge it),
 * and the default is what MIT charges — removing it demands an explicit hand-off first.
 */
@injectable()
export class RemovePaymentMethod extends Handler<typeof RemovePaymentMethodInputSchema, typeof RemovePaymentMethodOutputSchema> {
	readonly name = 'remove_payment_method' as const
	readonly inputSchema = RemovePaymentMethodInputSchema
	readonly outputSchema = RemovePaymentMethodOutputSchema

	constructor(private paymentMethods: PaymentMethodRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const paymentMethod = await this.paymentMethods.findById(input.paymentMethodId, tx)
			if (!paymentMethod || paymentMethod.ownerId !== input.ownerId) {
				throw new BaseError<InterfaceErrors>('UNAUTHORIZED')
			}
			// The entity decides removability (Tell Don't Ask) — the usecase only supplies the
			// wallet fact it can't see: how many OTHER active methods remain.
			const actives = (await this.paymentMethods.findAllByOwnerId(input.ownerId, tx)).filter(pm => pm.status === PaymentMethodStatus.ACTIVE)
			paymentMethod.remove({ otherActiveCount: actives.filter(pm => pm.id.value !== paymentMethod.id.value).length })
			await this.paymentMethods.save(paymentMethod, tx)
			return { ok: true }
		})
	}
}
