import { injectable } from 'tsyringe-neo'
import type Z from 'zod'
import { z } from '@template/core-typescript'
import { BaseError } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'

import { PaymentProviderFactory } from '@billing/services/PaymentProvider'
import { SubscriptionRepository, BillingProfileRepository } from '@billing/repositories'
import { PlanRegistry } from '@billing/objects'
import type { ApplicationErrors, InterfaceErrors } from '@billing/errors'
import { InvoicePaymentStrategy, type PayInvoiceContext } from './InvoicePaymentStrategy'
import { PaymentMethodType } from '@template/contracts-typescript/wire/enums'

export const PixPayInvoiceInputSchema = z.object({
	method: z.literal(PaymentMethodType.PIX),
})

// EMV QR + BR Code + TTL — the one-off, per-invoice Pix artifact (absorbed from the deleted
// CreatePaymentSession's pix branch). Not stored, not reusable, no pmRef.
export const PixPayInvoiceOutputSchema = z.object({
	method: z.literal(PaymentMethodType.PIX),
	pixId: z.string(),
	qr: z.string(),
	copyPaste: z.string(),
	expiresAt: z.date(),
})

/**
 * Pix is a one-off rail: "paying" an invoice with Pix mints the charge artifact (QR + copy-paste);
 * settlement arrives via the gateway's pix-paid webhook → ExternalPixPaidHandler. idemKey
 * `pix:{invoiceId}` — a retried/replayed call never mints a second Pix charge for the same invoice.
 */
@injectable()
export class PixInvoicePaymentStrategy extends InvoicePaymentStrategy<typeof PixPayInvoiceInputSchema, typeof PixPayInvoiceOutputSchema> {
	readonly method = PaymentMethodType.PIX
	readonly inputSchema = PixPayInvoiceInputSchema
	readonly outputSchema = PixPayInvoiceOutputSchema

	constructor(
		private providerFactory: PaymentProviderFactory,
		private subscriptionRepository: SubscriptionRepository,
		private billingProfiles: BillingProfileRepository,
	) {
		super()
	}

	async execute(
		ctx: PayInvoiceContext,
		_input: Z.output<typeof PixPayInvoiceInputSchema>,
		_tx?: Transaction,
	): Promise<Z.output<typeof PixPayInvoiceOutputSchema>> {
		const invoiceId = ctx.invoice.id.value
		const amountCents = ctx.invoice.amountCents || (await this.fallbackAmountCents(ctx.ownerId))

		// Pix mints a NEW payment relationship for the invoice — routed per-method so Pix can go to a
		// gateway with Pix enabled (BILLING_GATEWAY_PIX) even when cards use a different default.
		const provider = await this.providerFactory.decideForPaymentMethod(PaymentMethodType.PIX, { ownerId: ctx.ownerId })
		// Fail fast (422) before any network call when the routed gateway can't do Pix — the UI
		// shows "Pix indisponível" instead of a raw provider error. (The Stripe adapter also maps a
		// per-account Pix-not-enabled rejection to the same code, since capability is static here.)
		if (!provider.supportedMethods.has(PaymentMethodType.PIX)) {
			throw new BaseError<InterfaceErrors>('PROVIDER_CAPABILITY_UNSUPPORTED', `${provider.platform} does not support Pix`)
		}
		// Pix settlement needs the payer's document — resolve it from the owner's auth user
		// (best-effort; absent when the owner record has no document on file).
		const owner = await this.billingProfiles.findByOwnerId(ctx.ownerId)
		const pix = await provider.createPix({
			externalReference: invoiceId,
			amountCents,
			idemKey: `pix:${invoiceId}`,
			...(owner ? { payer: owner } : {}),
		})

		return {
			method: PaymentMethodType.PIX,
			pixId: pix.pixId,
			qr: pix.qr,
			copyPaste: pix.copyPaste,
			expiresAt: pix.expiresAt,
		}
	}

	// Defensive fallback — real invoices always carry a nonzero amountCents; this only
	// covers an invoice row landing with a 0/absent amount before the plan basePrice.
	private async fallbackAmountCents(ownerId: string): Promise<number> {
		const subscription = await this.subscriptionRepository.findByOwnerId(ownerId)
		if (!subscription) {
			throw new BaseError<ApplicationErrors>('SUBSCRIPTION_NOT_FOUND')
		}
		return PlanRegistry.get(subscription.planName).basePrice.amountCents
	}
}
