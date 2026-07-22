import crypto from 'node:crypto'
import { injectable } from 'tsyringe-neo'
import type Z from 'zod'
import { z } from '@template/core-typescript'
import { BaseError } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { Config } from '@template/core-typescript'
import { ProductConfig } from '@shared/config'

import { PaymentProviderFactory } from '@billing/services/PaymentProvider'
import { CheckoutSessionRecorder } from '@billing/services/CheckoutSessionRecorder'
import { BILLING_MESSAGES } from '@billing/i18n'
import { PaymentMethodRepository, BillingProfileRepository } from '@billing/repositories'
import type { PaymentMethod } from '@billing/entities'
import type { ApplicationErrors } from '@billing/errors'
import { InvoicePaymentStrategy, type PayInvoiceContext } from './InvoicePaymentStrategy'
import { CheckoutIntent, PaymentMethodStatus, PaymentMethodType, SubscriptionStatus } from '@template/contracts-typescript/wire/enums'

export const CardPayInvoiceInputSchema = z.object({
	method: z.literal(PaymentMethodType.CARD),
	// A specific wallet card; omitted → the wallet default.
	paymentMethodId: z.string().min(1).optional(),
	// "Pay with a NEW card": force the hosted-checkout path (mint a session that collects this
	// invoice AND vaults the new card) even when the owner already has stored cards. Without it,
	// a saved-card owner always charges an existing card — there was no way to reach checkout.
	newCard: z.boolean().optional(),
})

// Sync card decline is STATE (`ok: false`), not a thrown error. Settlement stays webhook-driven
// (`charge.paid` → ExternalCardChargeSucceededHandler) — the FE polls the invoice either way.
// `checkoutUrl` is present when the owner has NO stored card: nothing was charged (`ok: false`);
// the hosted checkout pays this invoice AND vaults the card (same session, CIT with mandate).
export const CardPayInvoiceOutputSchema = z.object({
	method: z.literal(PaymentMethodType.CARD),
	ok: z.boolean(),
	gatewayTxId: z.string().optional(),
	checkoutUrl: z.string().optional(),
})

/**
 * Manual card payment. With a stored credential: a charge on it — cycle matches the auto-saga's
 * rule (ExternalInvoiceIssuedHandler): subscription still INCOMPLETE → `'first'` (CIT establishing
 * the mandate), anything else → `'subsequent'` (MIT-shaped off-session charge). idemKey is
 * per-ATTEMPT (`${engineInvoiceId}:${uuid}` — see the comment at the call site): a fixed
 * invoice-scoped key replayed the first attempt's decline forever; cross-path dedup against the
 * auto-saga is the INVOICE_SETTLED claim + dup-refund, not gateway-key equality.
 *
 * Without a stored credential (and no explicit paymentMethodId): checkout-first — mint a hosted
 * checkout session for THIS invoice (decide() routes the new payment relationship) and return its
 * URL. Settlement + vault arrive via webhook (checkout.session.completed).
 *
 * Like the old PayFirstInvoice, this only INITIATES payment — no local Charge row is persisted
 * here; the authoritative outcome is recorded off the gateway webhooks.
 */
@injectable()
export class CardInvoicePaymentStrategy extends InvoicePaymentStrategy<
	typeof CardPayInvoiceInputSchema,
	typeof CardPayInvoiceOutputSchema
> {
	readonly method = PaymentMethodType.CARD
	readonly inputSchema = CardPayInvoiceInputSchema
	readonly outputSchema = CardPayInvoiceOutputSchema

	constructor(
		private providerFactory: PaymentProviderFactory,
		private paymentMethods: PaymentMethodRepository,
		private billingProfiles: BillingProfileRepository,
		private checkoutSessionRecorder: CheckoutSessionRecorder,
	) {
		super()
	}

	async execute(
		ctx: PayInvoiceContext,
		input: Z.output<typeof CardPayInvoiceInputSchema>,
		_tx?: Transaction,
	): Promise<Z.output<typeof CardPayInvoiceOutputSchema>> {
		const engineInvoiceId = ctx.invoice.id.value
		const amountCents = ctx.invoice.amountCents

		// `newCard` forces the checkout path (undefined = mint a session) regardless of stored cards.
		const paymentMethod = input.newCard ? undefined : await this.resolvePaymentMethod(ctx, input.paymentMethodId)

		// Checkout-first: no stored card → the hosted checkout collects this invoice and vaults
		// the card in one session. Nothing charged yet (`ok: false`).
		if (!paymentMethod) {
			const provider = await this.providerFactory.decideForPaymentMethod(PaymentMethodType.CARD, { ownerId: ctx.ownerId })
			const owner = await this.billingProfiles.findByOwnerId(ctx.ownerId)
			// Same branding contract as the subscribe mint: plan title when the invoice carries a
			// plan, generic invoice title otherwise — always in the OWNER's language, with the
			// brand image when configured.
			const presentation = {
				title: ctx.invoice.planName
					? BILLING_MESSAGES.subscriptionLineTitle(owner?.language, { planName: ctx.invoice.planName })
					: BILLING_MESSAGES.invoiceFallbackTitle(owner?.language, { invoiceId: engineInvoiceId }),
				description: ctx.invoice.planName
					? BILLING_MESSAGES.checkoutSubscriptionDescription(owner?.language)
					: BILLING_MESSAGES.checkoutInvoiceDescription(owner?.language),
				...(ProductConfig.env.BILLING_CHECKOUT_IMAGE_URL ? { imageUrl: ProductConfig.env.BILLING_CHECKOUT_IMAGE_URL } : {}),
			}
			const session = await provider.createCheckoutSession({
				ownerId: ctx.ownerId,
				owner: owner ?? undefined,
				intent: CheckoutIntent.PAYMENT,
				engineInvoiceId,
				amountCents,
				presentation,
				successUrl: `${Config.env.APP_URL}/account?checkout=success`,
				cancelUrl: `${Config.env.APP_URL}/account?checkout=canceled`,
				// Per-ATTEMPT key: each pay click mints a FRESH session. An invoice-scoped key
				// (`checkout:<id>`) bricked the invoice after an abandoned checkout — Stripe pins a
				// key to its first params for 24h (the subscribe mint carries a different title →
				// 400 on every retry) and would otherwise replay the abandoned/expired session.
				// Same-request safety is the SDK's own retry reusing this one computed key; paying
				// two live sessions is settled once (INVOICE_SETTLED claim) + the loser auto-refunds.
				idemKey: `checkout:${engineInvoiceId}:${crypto.randomUUID()}`,
			})

			// Post-gateway, own tx (Decision 2 — molde da expectativa de refund): record the minted
			// session as a local CheckoutSession + arm its reconcile alarm so a lost completion webhook
			// still resolves in minutes.
			await this.checkoutSessionRecorder.record({
				sessionRef: session.sessionRef,
				ownerId: ctx.ownerId,
				platform: provider.platform,
				intent: CheckoutIntent.PAYMENT,
				engineInvoiceId,
				expiresAt: session.expiresAt,
			})

			return { method: PaymentMethodType.CARD, ok: false, checkoutUrl: session.url }
		}

		const cycle = ctx.subscriptionStatus === SubscriptionStatus.INCOMPLETE ? ('first' as const) : ('subsequent' as const)

		// Per-ATTEMPT idempotency key (one computed UUID per pay click), NOT a fixed
		// `engineInvoiceId`: the gateway pins a key to its first PaymentIntent for 24h, so a fixed
		// key REPLAYED the first attempt's decline on every later retry — the user could never
		// retry a declined invoice with a different card. Same rule the checkout path already
		// follows above. Same-request safety is the SDK's own retry reusing this one computed key;
		// a manual pay racing the automatic renewal is settled once (INVOICE_SETTLED claim) and the
		// duplicate charge auto-refunds — the established cross-path safety net, not gateway-key dedup.
		const idemKey = `${engineInvoiceId}:${crypto.randomUUID()}`

		// Charges on an EXISTING instrument stay pinned to the platform it was vaulted on —
		// never re-`decide()` (same rule as the MIT handler / RefundInvoice).
		const provider = this.providerFactory.for(paymentMethod.platform)
		const result =
			cycle === 'first'
				? await provider.chargeStoredOnSession({
						pmRef: paymentMethod.instrument.pmRef,
						ownerId: ctx.ownerId,
						amountCents,
						engineInvoiceId,
						idemKey,
					})
				: await provider.chargeOffSession({
						pmRef: paymentMethod.instrument.pmRef,
						amountCents,
						idemKey,
						code: engineInvoiceId,
						...(paymentMethod.instrument.originGatewayTxId ? { originGatewayTxId: paymentMethod.instrument.originGatewayTxId } : {}),
					})

		return { method: PaymentMethodType.CARD, ok: result.ok, ...(result.ok ? { gatewayTxId: result.gatewayTxId } : {}) }
	}

	// An EXPLICIT paymentMethodId that is foreign/missing/non-ACTIVE still throws (IDOR guard —
	// never confirm a pm id exists for another owner). Only the "no default" case flows to
	// checkout: `undefined` here means "mint a session".
	private async resolvePaymentMethod(ctx: PayInvoiceContext, paymentMethodId?: string): Promise<PaymentMethod | undefined> {
		if (paymentMethodId) {
			const paymentMethod = await this.paymentMethods.findById(paymentMethodId)
			if (!paymentMethod || paymentMethod.ownerId !== ctx.ownerId || paymentMethod.status !== PaymentMethodStatus.ACTIVE) {
				throw new BaseError<ApplicationErrors>('PAYMENT_METHOD_NOT_FOUND')
			}
			return paymentMethod
		}
		return (await this.paymentMethods.findDefaultByOwnerId(ctx.ownerId)) ?? undefined
	}
}
