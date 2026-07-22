import { Handler } from '@template/core-typescript'
import { BaseError } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import {
	InvoicePaymentStrategyRegistry,
	PayInvoicePaymentSchema,
	PayInvoiceResponseSchema,
	type PayInvoiceContext,
} from '@billing/services'
import { InvoiceRepository, SubscriptionRepository, ChargeRepository } from '@billing/repositories'
import type { ApplicationErrors, InterfaceErrors } from '@billing/errors'

export const PayInvoiceInputSchema = z.object({
	ownerId: z.string().min(1),
	engineInvoiceId: z.string().min(1),
	payment: PayInvoicePaymentSchema,
})

export const PayInvoiceOutputSchema = PayInvoiceResponseSchema

/**
 * The ONE manual payment verb: pay an invoice with a `method`-discriminated payment. The usecase
 * resolves the shared context ONCE (invoice + ownership assert + subscription status), then
 * dispatches to the method's InvoicePaymentStrategy via the registry. Each strategy only INITIATES
 * payment — settlement stays webhook-driven (charge.paid / pix paid → external handlers), so no
 * local write happens here and no `withTransaction` ever wraps the provider calls.
 */
@injectable()
export class PayInvoice extends Handler<typeof PayInvoiceInputSchema, typeof PayInvoiceOutputSchema> {
	readonly name = 'pay_invoice' as const
	readonly inputSchema = PayInvoiceInputSchema
	readonly outputSchema = PayInvoiceOutputSchema

	constructor(
		private strategyRegistry: InvoicePaymentStrategyRegistry,
		private invoiceRepository: InvoiceRepository,
		private subscriptionRepository: SubscriptionRepository,
		private chargeRepository: ChargeRepository,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		// Missing invoice and foreign invoice collapse into UNAUTHORIZED (IDOR guard) — same
		// semantics the old PayFirstInvoice had: never confirm someone else's invoice id exists.
		const invoice = await this.invoiceRepository.findByEngineInvoiceId(input.engineInvoiceId)
		if (!invoice || invoice.ownerId.value !== input.ownerId) {
			throw new BaseError<InterfaceErrors>('UNAUTHORIZED')
		}

		// Already-collected guard: a SUCCEEDED charge means real money already settled this invoice
		// — a stale UI or the checkout→settle race window must not initiate a SECOND gateway charge
		// (the checkout CIT's idempotency key `checkout:<id>` never collides with the manual `<id>`).
		// Deliberately a charge-fact check, not the full status derivation: zero-amount invoices
		// derive settled without any charge yet stay legitimately payable (PIX plan-base fallback).
		if (await this.chargeRepository.findSucceededByInvoiceId(invoice.id.value, tx)) {
			throw new BaseError<ApplicationErrors>('INVOICE_ALREADY_PAID')
		}

		const subscription = await this.subscriptionRepository.findByOwnerId(input.ownerId)

		const ctx: PayInvoiceContext = {
			ownerId: input.ownerId,
			invoice,
			subscriptionStatus: subscription?.status,
		}

		const strategy = this.strategyRegistry.for(input.payment.method)
		// The strategy's output IS one leaf of PayInvoiceOutputSchema's union (the unions are
		// composed from the strategies' schemas) — the cast just narrows the base-class erasure.
		return (await strategy.execute(ctx, input.payment, tx)) as this['output']
	}
}
