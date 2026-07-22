import Stripe from 'stripe'
import { injectable } from 'tsyringe-neo'
import { BaseError } from '@template/core-typescript'
import type { InterfaceErrors } from '@billing/errors'
import { ProductConfig } from '@shared/config'
import { Language } from '@template/contracts-typescript/wire/enums'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { BILLING_MESSAGES } from '@billing/i18n'

import type { PaymentInstrument } from '@billing/objects/PaymentInstrument'
import { CaptureOrigin } from '@billing/enums/CaptureOrigin'
import { BillingPlatform, CheckoutIntent, DeclineReason, PaymentMethodType } from '@template/contracts-typescript/wire/enums'
import {
	PaymentProvider,
	type ChargeResult,
	type RefundStatus,
	type ChargebackStatus,
	type CheckoutSessionResult,
	type CheckoutSessionStatusResult,
	type BillingCustomerIdentity,
	type EnsureCustomerParams,
	type CreateCheckoutSessionParams,
	type ChargeOffSessionParams,
	type ChargeStoredOnSessionParams,
	type CancelChargeParams,
	type CreatePixParams,
} from '../PaymentProvider'

/**
 * Stripe gateway adapter. Parallels the other adapters' port surface but talks the Stripe node SDK
 * instead of raw gateway HTTP. The customer is keyed by the `ownerId` metadata on the Stripe
 * Customer (resolvable each call — nothing new to store), and each charge/refund carries an
 * Idempotency-Key so a replay never double-charges.
 *
 * Multi-account: every port method accepts optional `credentials` — absent, the PLATFORM account
 * (ProductConfig.env.STRIPE_API_KEY) is used; present, the call runs against that account's client
 * (cached per key). This keeps the provider usable beyond plan billing.
 */
@injectable()
export class StripePaymentProvider extends PaymentProvider {
	readonly platform = BillingPlatform.STRIPE
	readonly capabilities = { hostedCardCheckout: true, cardVaulting: true }
	readonly supportedMethods = new Set([PaymentMethodType.CARD, PaymentMethodType.PIX])

	// One lazily-created client per API key (platform key + any per-call credential keys).
	private readonly clients = new Map<string, Stripe>()

	/**
	 * Lazily construct the SDK so merely RESOLVING this provider (the PaymentProviderFactory graph
	 * builds it in every environment, incl. tests) never news up Stripe with an empty key. Unit
	 * tests override this to return a fake client (and observe the per-call key).
	 */
	protected stripe(apiKey?: string): Stripe {
		const key = apiKey ?? ProductConfig.env.STRIPE_API_KEY
		let client = this.clients.get(key)
		if (!client) {
			client = new Stripe(key)
			this.clients.set(key, client)
		}
		return client
	}

	// Stripe expects lowercase ISO currency codes; the port speaks the shared CurrencyCode enum.
	private currencyCode(currency?: CurrencyCode): string {
		return (currency ?? CurrencyCode.BRL).toLowerCase()
	}

	// The hosted checkout's PAGE CHROME language ("Pay", "Card number", receipts). Billing OWNS this
	// mapping: the account's canonical Language (the single contracts enum) → Stripe's own locale
	// string. 'auto' (browser detection) covers the null/unknown case. A product that widens Language
	// (in contracts) adds the corresponding Stripe locale here — the enum never speaks gateway strings.
	private checkoutLocale(language?: Language | null): Stripe.Checkout.SessionCreateParams.Locale {
		switch (language) {
			case Language.PT_BR:
				return 'pt-BR'
			case Language.EN_US:
				return 'en'
			default:
				return 'auto'
		}
	}

	// The Stripe Customer whose metadata['ownerId'] matches — the single lookup both ensure/vault
	// use. Search is eventually consistent, but ensureCustomer runs before the first vault so a
	// just-created customer is found on the vault call that follows.
	private async findCustomerId(ownerId: string, apiKey?: string): Promise<string | undefined> {
		const found = await this.stripe(apiKey).customers.search({ query: `metadata['ownerId']:'${ownerId}'` })
		return found.data[0]?.id
	}

	// Upsert the Stripe Customer keyed by ownerId metadata and return its id. When `owner` is present
	// its name/email are written and the CPF/CNPJ is stamped on metadata (Stripe has no first-class
	// document field) so charges/receipts carry it; when absent (a capture that couldn't resolve the
	// auth user) a bare metadata-only customer is minted so the SetupIntent still has a customer.
	private async ensureCustomerId(ownerId: string, owner?: BillingCustomerIdentity, apiKey?: string): Promise<string> {
		const customer = owner ? this.buildCustomer(owner) : undefined
		const metadata = { ownerId, ...(customer?.document ? { document: customer.document } : {}) }
		const existingId = await this.findCustomerId(ownerId, apiKey)
		if (existingId) {
			if (customer) {
				await this.stripe(apiKey).customers.update(existingId, { name: customer.name, email: customer.email, metadata })
			}
			return existingId
		}
		// Idempotency-keyed by ownerId: customers.search is eventually consistent, so two racing
		// callers can both see "no customer" — the key makes the second create return the first
		// customer instead of minting a duplicate (which would split vaulted cards across records).
		const created = customer
			? await this.stripe(apiKey).customers.create(
					{ name: customer.name, email: customer.email, metadata },
					{ idempotencyKey: `customer:${ownerId}` },
				)
			: await this.stripe(apiKey).customers.create({ metadata }, { idempotencyKey: `customer:${ownerId}` })
		return created.id
	}

	async ensureCustomer(p: EnsureCustomerParams): Promise<void> {
		await this.ensureCustomerId(p.ownerId, p.owner, p.credentials?.apiKey)
	}

	async createCheckoutSession(p: CreateCheckoutSessionParams): Promise<CheckoutSessionResult> {
		// intent=payment pays a specific invoice — both identifiers are required to stamp the PI
		// metadata (the webhook resolves ownership off the invoice by engineInvoiceId). Narrowed
		// into `payment` so the branch below reads proven-present values instead of casting.
		let payment: { engineInvoiceId: string; amountCents: number } | undefined
		if (p.intent === CheckoutIntent.PAYMENT) {
			if (!p.engineInvoiceId || !p.amountCents) {
				throw new Error('createCheckoutSession: intent=payment requires engineInvoiceId + amountCents')
			}
			payment = { engineInvoiceId: p.engineInvoiceId, amountCents: p.amountCents }
		}

		const apiKey = p.credentials?.apiKey

		// A Checkout Session requires a customer so the vaulted pm_ lands attached to it.
		const customer = await this.ensureCustomerId(p.ownerId, p.owner, apiKey)

		const session = await this.stripe(apiKey).checkout.sessions.create(
			{
				mode: p.intent === CheckoutIntent.PAYMENT ? 'payment' : 'setup',
				customer,
				locale: this.checkoutLocale(p.owner?.language),
				success_url: p.successUrl,
				cancel_url: p.cancelUrl,
				// Session metadata: the webhook reads ownerId (setup has no invoice to resolve it from)
				// and intent; engineInvoiceId rides along for the payment join.
				metadata: {
					ownerId: p.ownerId,
					intent: p.intent,
					...(p.engineInvoiceId ? { engineInvoiceId: p.engineInvoiceId } : {}),
				},
				...(payment
					? {
							line_items: [
								{
									price_data: {
										currency: this.currencyCode(p.currency),
										product_data: {
											// Callers brand what is being paid; the generic invoice label is the fallback,
											// localized to the owner's language (PT when unknown).
											name:
												p.presentation?.title ??
												BILLING_MESSAGES.invoiceFallbackTitle(p.owner?.language, { invoiceId: payment.engineInvoiceId }),
											...(p.presentation?.description ? { description: p.presentation.description } : {}),
											...(p.presentation?.imageUrl ? { images: [p.presentation.imageUrl] } : {}),
										},
										unit_amount: payment.amountCents,
									},
									quantity: 1,
								},
							],
							// setup_future_usage records the off-session mandate at the CIT — renewals
							// (chargeOffSession) then succeed without authentication_required.
							payment_intent_data: {
								setup_future_usage: 'off_session',
								metadata: { ownerId: p.ownerId, engineInvoiceId: payment.engineInvoiceId },
							},
						}
					: {
							payment_method_types: ['card'],
							setup_intent_data: { metadata: { ownerId: p.ownerId } },
						}),
			},
			{ idempotencyKey: p.idemKey },
		)

		if (!session.url) throw new Error(`createCheckoutSession: session ${session.id} has no url`)
		return {
			url: session.url,
			sessionRef: session.id,
			expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : undefined,
		}
	}

	async chargeOffSession(p: ChargeOffSessionParams): Promise<ChargeResult> {
		// MIT (subsequent): Stripe infers the mandate from the stored pm + off_session — there is no
		// explicit cycle flag. ownerId isn't on the port here, so it's read off the customer metadata
		// to enrich the webhook. The mandate itself was established at vault time
		// (checkout.session.completed, off_session usage).
		return this.charge({
			pmRef: p.pmRef,
			amountCents: p.amountCents,
			currency: p.currency,
			idemKey: p.idemKey,
			engineInvoiceId: p.code,
			apiKey: p.credentials?.apiKey,
		})
	}

	async chargeStoredOnSession(p: ChargeStoredOnSessionParams): Promise<ChargeResult> {
		// CIT (first) on a stored credential: Stripe needs no distinct cycle flag — the same
		// off_session confirm establishes/continues the mandate. ownerId + engineInvoiceId are known
		// here, so they ride the PI metadata directly. Because vaulting already recorded the
		// off_session mandate, this FIRST off_session charge now succeeds instead of declining
		// with authentication_required.
		return this.charge({
			pmRef: p.pmRef,
			amountCents: p.amountCents,
			currency: p.currency,
			idemKey: p.idemKey,
			ownerId: p.ownerId,
			engineInvoiceId: p.engineInvoiceId,
			apiKey: p.credentials?.apiKey,
		})
	}

	// Shared PaymentIntent confirm. The stored pm_ is attached to a customer, so Stripe requires
	// that customer on the intent — resolve it off the pm. A synchronous decline surfaces either as
	// a thrown StripeCardError or a non-succeeded status; both map to { ok: false, reason }.
	private async charge(p: {
		pmRef: string
		amountCents: number
		currency?: CurrencyCode
		idemKey: string
		ownerId?: string
		engineInvoiceId?: string
		apiKey?: string
	}): Promise<ChargeResult> {
		try {
			const pm = await this.stripe(p.apiKey).paymentMethods.retrieve(p.pmRef)
			const customer = typeof pm.customer === 'string' ? pm.customer : pm.customer?.id
			let ownerId = p.ownerId
			if (!ownerId && customer) ownerId = await this.ownerIdOfCustomer(customer, p.apiKey)
			const metadata: Record<string, string> = {}
			if (p.engineInvoiceId) metadata.engineInvoiceId = p.engineInvoiceId
			if (ownerId) metadata.ownerId = ownerId

			const pi = await this.stripe(p.apiKey).paymentIntents.create(
				{
					amount: p.amountCents,
					currency: this.currencyCode(p.currency),
					...(customer ? { customer } : {}),
					payment_method: p.pmRef,
					off_session: true,
					confirm: true,
					metadata,
				},
				{ idempotencyKey: p.idemKey },
			)
			if (pi.status === 'succeeded') return { ok: true, gatewayTxId: pi.id }
			// requires_action / requires_payment_method on an off_session confirm = a decline.
			return {
				ok: false,
				reason: pi.last_payment_error?.message ?? pi.status,
				declineCode: this.declineReasonFrom(pi.last_payment_error?.decline_code, pi.last_payment_error?.code),
			}
		} catch (e) {
			// Off-session declines (insufficient_funds, authentication_required, …) throw StripeCardError.
			if (e instanceof Stripe.errors.StripeCardError) {
				// A StripeCardError IS a card decline — classify by its codes, generic decline otherwise.
				return { ok: false, reason: e.message, declineCode: this.declineReasonFrom(e.decline_code, e.code) ?? DeclineReason.CARD_DECLINED }
			}
			return { ok: false, reason: e instanceof Error ? e.message : 'PROVIDER_ERROR' }
		}
	}

	// Stripe's `decline_code` (issuer-level) is more specific than `code` ('card_declined'), so it
	// is checked first. Unmapped/absent codes → undefined; the caller decides the fallback.
	private declineReasonFrom(...codes: (string | null | undefined)[]): DeclineReason | undefined {
		for (const code of codes) {
			switch (code) {
				case 'insufficient_funds':
					return DeclineReason.INSUFFICIENT_FUNDS
				case 'expired_card':
					return DeclineReason.CARD_EXPIRED
				case 'authentication_required':
					return DeclineReason.AUTHENTICATION_REQUIRED
				case 'processing_error':
					return DeclineReason.PROCESSING_ERROR
				case 'card_declined':
				case 'generic_decline':
				case 'do_not_honor':
					return DeclineReason.CARD_DECLINED
				default:
					continue
			}
		}
		return undefined
	}

	private async ownerIdOfCustomer(customerId: string, apiKey?: string): Promise<string | undefined> {
		const customer = await this.stripe(apiKey).customers.retrieve(customerId)
		// DeletedCustomer carries no metadata — `in` narrows it out.
		return 'metadata' in customer ? customer.metadata.ownerId : undefined
	}

	async cancelCharge(p: CancelChargeParams): Promise<void> {
		// gatewayTxId is the PaymentIntent id (pi_…) we recorded on the charge — refund by intent.
		await this.stripe(p.credentials?.apiKey).refunds.create(
			{ payment_intent: p.gatewayTxId, ...(p.amountCents !== undefined ? { amount: p.amountCents } : {}) },
			{ idempotencyKey: p.idemKey },
		)
	}

	// The reconciliation sweep's refund poll — getChargeStatus mold. `gatewayTxId` is the
	// PaymentIntent id (pi_…) cancelCharge refunds by. `refunds.list` enumerates every individual
	// refund (mapped with its CANONICAL re_… id — never synthesized); the PaymentIntent's latest
	// charge carries Stripe's own cumulative `amount_refunded`, the authoritative total (falls back
	// to summing confirmed refunds when no charge is attached, e.g. a PI that never captured).
	override async getRefundStatus(gatewayTxId: string): Promise<RefundStatus> {
		const stripe = this.stripe()
		const pi = await stripe.paymentIntents.retrieve(gatewayTxId, { expand: ['latest_charge'] })
		const charge = typeof pi.latest_charge === 'string' ? undefined : pi.latest_charge
		const list = await stripe.refunds.list({ payment_intent: gatewayTxId, limit: 100 })
		// Only CONFIRMED refunds count — 'pending'/'requires_action'/'failed'/'canceled' are not yet
		// money moved. Sorted oldest→newest by `created` (Stripe's list returns newest-first).
		const refunds = list.data
			.filter(r => r.status === 'succeeded')
			.sort((a, b) => a.created - b.created)
			.map(r => ({ gatewayRef: r.id, amountCents: r.amount }))
		const refundedTotalCents = charge?.amount_refunded ?? refunds.reduce((sum, r) => sum + r.amountCents, 0)
		return { refundedTotalCents, refunds }
	}

	// The reconciliation sweep's chargeback poll — getRefundStatus mold: `gatewayTxId` is the
	// PaymentIntent id (pi_…) this system always records. Resolve its latest charge id (same expand
	// as getRefundStatus), then `disputes.list({ charge: chargeId })` for EVERY dispute Stripe has
	// ever recorded against that charge — including resolved ones (won/lost), because the detector's
	// set-difference needs the full identity set to tell "a dispute we already know about" from "a
	// genuinely new one", not just the currently-outstanding state. `chargedBack` is DERIVED from
	// that list (`refs.length > 0`). A PI with no charge at all (never captured) has nothing to
	// dispute — fails loud (PROVIDER_ERROR) rather than silently reporting `chargedBack: false` for a
	// tx that was never actually checked.
	override async getChargebackStatus(gatewayTxId: string): Promise<ChargebackStatus> {
		const stripe = this.stripe()
		const pi = await stripe.paymentIntents.retrieve(gatewayTxId, { expand: ['latest_charge'] })
		const chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id
		if (!chargeId) {
			throw new BaseError<InterfaceErrors>('PROVIDER_ERROR', `Stripe PaymentIntent ${gatewayTxId} has no charge to check for a dispute`)
		}
		const list = await stripe.disputes.list({ charge: chargeId, limit: 100 })
		const disputeRefs = list.data.map(d => d.id)
		return { chargedBack: disputeRefs.length > 0, disputeRefs }
	}

	// The checkout-session poll — getRefundStatus mold. `sessionRef` is the Checkout Session id
	// (cs_…) createCheckoutSession returned. `session.status` mirrors exactly what drives the
	// `checkout.session.completed` webhook: 'expired' is terminal, 'complete' is what the webhook
	// fires on, 'open' means still waiting. When complete, the PI (payment) or SI (setup) is
	// retrieved with the payment_method expanded — the SAME two branches
	// StripeWebhookMapper.checkoutCompletedEvents takes for the real webhook — so the synthesized
	// event carries the same instrument shape a real webhook delivery would have.
	override async getCheckoutSessionStatus(sessionRef: string): Promise<CheckoutSessionStatusResult> {
		const stripe = this.stripe()
		const session = await stripe.checkout.sessions.retrieve(sessionRef)

		if (session.status === 'expired') return { state: 'expired' }
		if (session.status !== 'complete') return { state: 'open' }

		// `status === 'complete'` alone is not proof money moved — an async payment method can leave
		// the Session `complete` while `payment_status` is still 'unpaid' (the customer finished the
		// redirect flow, but the payment itself settles later via its own webhook/async confirmation).
		// The real `checkout.session.completed` webhook branches on this SAME field (see
		// StripeWebhookMapper); mirror it here so a poll never synthesizes a paid event ahead of the
		// money actually moving. 'no_payment_required' covers setup-mode sessions (no payment leg at
		// all) and $0 payment sessions.
		if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') return { state: 'open' }

		if (session.mode === 'payment') {
			const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
			if (!piId) return { state: 'paid' }
			const pi = await stripe.paymentIntents.retrieve(piId, { expand: ['payment_method'] })
			return {
				state: 'paid',
				paid: {
					gatewayTxId: pi.id,
					amountCents: session.amount_total ?? pi.amount_received ?? undefined,
					instrument: this.checkoutInstrument(pi.payment_method, CaptureOrigin.CHECKOUT_PAYMENT, pi.id),
				},
			}
		}

		if (session.mode === 'setup') {
			const siId = typeof session.setup_intent === 'string' ? session.setup_intent : session.setup_intent?.id
			if (!siId) return { state: 'paid' }
			const si = await stripe.setupIntents.retrieve(siId, { expand: ['payment_method'] })
			// setup has no CIT — no gatewayTxId/amountCents to carry (mirrors resolveSetupCheckout).
			return { state: 'paid', paid: { instrument: this.checkoutInstrument(si.payment_method, CaptureOrigin.CHECKOUT_SETUP, undefined) } }
		}

		return { state: 'paid' }
	}

	// The expanded pm off the PI/SI → PaymentInstrument with the checkout origin — mold of
	// StripeWebhookMapper.checkoutInstrument. Defensive: an unexpanded (string) reference or a
	// non-card pm degrades to undefined (the caller decides — never a fabricated instrument).
	private checkoutInstrument(
		paymentMethod: unknown,
		captureOrigin: CaptureOrigin,
		originGatewayTxId: string | undefined,
	): PaymentInstrument | undefined {
		if (!paymentMethod || typeof paymentMethod === 'string') return undefined
		const pm = paymentMethod as Stripe.PaymentMethod
		const card = pm.card
		if (!card) return undefined
		return {
			type: PaymentMethodType.CARD,
			pmRef: pm.id,
			supportsOffSession: true,
			captureOrigin,
			...(originGatewayTxId ? { originGatewayTxId } : {}),
			brand: card.brand ?? 'unknown',
			last4: card.last4 ?? '0000',
			expMonth: card.exp_month ?? 1,
			expYear: card.exp_year ?? new Date().getFullYear(),
		}
	}

	async createPix(p: CreatePixParams): Promise<{ pixId: string; qr: string; copyPaste: string; expiresAt: Date }> {
		// Normalize the payer exactly like the other adapters (digits-only document, dropped when not
		// a CPF/CNPJ) — Pix settlement commonly wants the payer's document.
		const customer = p.payer ? this.buildCustomer(p.payer) : undefined
		const pi = await this.stripe(p.credentials?.apiKey)
			.paymentIntents.create(
				{
					amount: p.amountCents,
					currency: this.currencyCode(p.currency),
					payment_method_types: ['pix'],
					payment_method_data: { type: 'pix' },
					confirm: true,
					...(customer ? { receipt_email: customer.email } : {}),
					metadata: {
						engineInvoiceId: p.externalReference,
						...(customer?.document ? { payerDocument: customer.document } : {}),
					},
				},
				{ idempotencyKey: p.idemKey },
			)
			.catch((e: unknown) => {
				// Pix is a per-account Stripe capability: an account without it activated rejects the
				// `pix` payment_method_type with `payment_intent_invalid_parameter`. That's a capability
				// gap, not a server fault — surface PROVIDER_CAPABILITY_UNSUPPORTED (422) so the caller
				// shows "Pix unavailable" instead of a raw 500.
				if (e instanceof Stripe.errors.StripeInvalidRequestError && e.param === 'payment_method_types') {
					throw new BaseError<InterfaceErrors>('PROVIDER_CAPABILITY_UNSUPPORTED', 'Pix is not enabled on this Stripe account')
				}
				throw e
			})
		const qr = pi.next_action?.pix_display_qr_code
		return {
			pixId: pi.id,
			qr: qr?.image_url_png ?? qr?.hosted_instructions_url ?? '',
			copyPaste: qr?.data ?? '',
			// Stripe expires_at is a unix-seconds timestamp.
			expiresAt: qr?.expires_at ? new Date(qr.expires_at * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000),
		}
	}
}
