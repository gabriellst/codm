import { injectable } from 'tsyringe-neo'
import { ProductConfig } from '@shared/config'
import { BaseError } from '@template/core-typescript'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { withResilience } from '@template/core-typescript'
import type { InterfaceErrors } from '@billing/errors'

import {
	PaymentProvider,
	type ChargeResult,
	type RefundStatus,
	type ChargebackStatus,
	type CheckoutSessionResult,
	type EnsureCustomerParams,
	type CreateCheckoutSessionParams,
	type ChargeOffSessionParams,
	type ChargeStoredOnSessionParams,
	type CancelChargeParams,
	type CreatePixParams,
} from '../PaymentProvider'
import { parseGatewayResponse } from '../parseGatewayResponse'
import { MercadoPagoPreferenceResponseSchema, MercadoPagoPaymentResponseSchema, MercadoPagoRefundResponseSchema } from './schemas'
import { BillingPlatform, CheckoutIntent, PaymentMethodType } from '@template/contracts-typescript/wire/enums'

/**
 * MercadoPago gateway adapter — CHECKOUT-ONLY tier (spec 2026-07-10 matrix): Checkout Pro pays a
 * card or Pix on a hosted page, but exposes no merchant-held vault for MIT/CIT — every card charge
 * happens inside the hosted page itself. `chargeOffSession`/`chargeStoredOnSession` therefore throw
 * PROVIDER_CAPABILITY_UNSUPPORTED (see `capabilities`); renewals degrade to the existing manual-pay
 * flow (NO_PAYMENT_METHOD → dunning → PayInvoice re-mints a checkout).
 *
 * Auth: Bearer MERCADOPAGO_ACCESS_TOKEN. Every write call (preference/payment/refund) carries a
 * mandatory `X-Idempotency-Key` — MercadoPago requires it (unlike Pagar.me/Stripe, where it's
 * opt-in-but-recommended).
 */
@injectable()
export class MercadoPagoPaymentProvider extends PaymentProvider {
	readonly platform = BillingPlatform.MERCADOPAGO
	readonly capabilities = { hostedCardCheckout: true, cardVaulting: false }
	readonly supportedMethods = new Set([PaymentMethodType.CARD, PaymentMethodType.PIX])

	private readonly baseUrl = 'https://api.mercadopago.com'

	private authHeader(apiKey?: string): string {
		return `Bearer ${apiKey ?? ProductConfig.env.MERCADOPAGO_ACCESS_TOKEN}`
	}

	// MercadoPago orders/payments are BRL-implicit for this integration — anything else fails loudly
	// instead of silently charging BRL (same posture as PagarMePaymentProvider.assertBRL).
	private assertBRL(currency?: CurrencyCode): void {
		if (currency && currency !== CurrencyCode.BRL) {
			throw new BaseError<InterfaceErrors>('PROVIDER_ERROR', `MercadoPago only settles BRL — got ${currency}`)
		}
	}

	// `protected` (not private) so unit tests can override it and stub the HTTP surface — the same
	// seam StripePaymentProvider exposes via its overridable `stripe()` accessor. idemKey is
	// mandatory here (unlike PagarMePaymentProvider.call): every MercadoPago write call requires it.
	// Returns the raw parsed JSON body as `unknown` — every call site parses it through
	// `parseGatewayResponse` against its own schema instead of trusting an `as T` cast.
	protected async call(path: string, body: unknown, idemKey: string, apiKey?: string, method: 'POST' | 'GET' = 'POST'): Promise<unknown> {
		const headers: Record<string, string> = {
			'content-type': 'application/json',
			authorization: this.authHeader(apiKey),
			'X-Idempotency-Key': idemKey,
		}
		return withResilience(
			async signal => {
				const res = await fetch(`${this.baseUrl}${path}`, {
					method,
					headers,
					...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
					signal,
				})
				if (!res.ok) {
					const detail = await res.text().catch(() => '')
					throw new BaseError<InterfaceErrors>('PROVIDER_ERROR', detail || `MercadoPago responded ${res.status}`)
				}
				return await res.json()
			},
			// Every write here carries an Idempotency-Key, so a timed-out/dropped response is always
			// safe to retry.
			{ retryable: true, label: 'mercadopago' },
		)
	}

	// Checkout Pro needs no pre-created "customer" resource — the payer identity travels inline on
	// each preference/payment call (buildCustomer at the call sites below). No-op, documented.
	async ensureCustomer(_p: EnsureCustomerParams): Promise<void> {
		return
	}

	async createCheckoutSession(p: CreateCheckoutSessionParams): Promise<CheckoutSessionResult> {
		// MercadoPago vaults nothing via the hosted page (capabilities.cardVaulting === false) — a
		// vault-only 'setup' checkout has no MercadoPago equivalent.
		if (p.intent === CheckoutIntent.SETUP) {
			throw new BaseError<InterfaceErrors>('PROVIDER_CAPABILITY_UNSUPPORTED', 'MercadoPago does not support vault-only checkout sessions')
		}
		if (!p.engineInvoiceId || !p.amountCents) {
			throw new Error('createCheckoutSession: intent=payment requires engineInvoiceId + amountCents')
		}
		this.assertBRL(p.currency)

		const raw = await this.call(
			'/checkout/preferences',
			{
				items: [
					{
						title: p.presentation?.title ?? `Fatura ${p.engineInvoiceId}`,
						quantity: 1,
						// MercadoPago wants decimal REAIS, not cents.
						unit_price: p.amountCents / 100,
						currency_id: 'BRL',
					},
				],
				external_reference: p.engineInvoiceId,
				back_urls: { success: p.successUrl, failure: p.cancelUrl },
				auto_return: 'approved',
			},
			p.idemKey,
			p.credentials?.apiKey,
		)
		const r = parseGatewayResponse(MercadoPagoPreferenceResponseSchema, raw, 'mercadopago')

		return { url: r.init_point, sessionRef: r.id }
	}

	// No off-session/CIT charge API for a CHECKOUT-ONLY merchant — MercadoPago never hands back a
	// merchant-held card token from the hosted page, so there is nothing to charge off-session.
	async chargeOffSession(_p: ChargeOffSessionParams): Promise<ChargeResult> {
		throw new BaseError<InterfaceErrors>(
			'PROVIDER_CAPABILITY_UNSUPPORTED',
			'MercadoPago does not support off-session charges (no card vaulting)',
		)
	}

	async chargeStoredOnSession(_p: ChargeStoredOnSessionParams): Promise<ChargeResult> {
		throw new BaseError<InterfaceErrors>(
			'PROVIDER_CAPABILITY_UNSUPPORTED',
			'MercadoPago does not support stored-credential charges (no card vaulting)',
		)
	}

	async cancelCharge(p: CancelChargeParams): Promise<void> {
		const raw = await this.call(
			`/v1/payments/${p.gatewayTxId}/refunds`,
			// Omitting `amount` refunds the payment in full; a partial refund carries decimal REAIS.
			p.amountCents !== undefined ? { amount: p.amountCents / 100 } : {},
			p.idemKey,
			p.credentials?.apiKey,
		)
		parseGatewayResponse(MercadoPagoRefundResponseSchema, raw, 'mercadopago')
	}

	async createPix(p: CreatePixParams): Promise<{ pixId: string; qr: string; copyPaste: string; expiresAt: Date }> {
		this.assertBRL(p.currency)
		// Normalize the payer exactly like PagarMePaymentProvider/StripePaymentProvider (digits-only
		// document, dropped when not a CPF/CNPJ) — Pix settlement wants the payer's document + email.
		const customer = p.payer ? this.buildCustomer(p.payer) : undefined
		const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

		const raw = await this.call(
			'/v1/payments',
			{
				payment_method_id: 'pix',
				transaction_amount: p.amountCents / 100,
				date_of_expiration: expiresAt.toISOString(),
				external_reference: p.externalReference,
				...(customer
					? {
							payer: {
								email: customer.email,
								first_name: customer.name,
								...(customer.document
									? { identification: { type: customer.type === 'company' ? 'CNPJ' : 'CPF', number: customer.document } }
									: {}),
							},
						}
					: {}),
			},
			p.idemKey,
			p.credentials?.apiKey,
		)
		const r = parseGatewayResponse(MercadoPagoPaymentResponseSchema, raw, 'mercadopago')

		const tx = r.point_of_interaction?.transaction_data
		return {
			pixId: String(r.id),
			// MercadoPago returns the QR as raw base64 PNG bytes (no hosted image URL like
			// Stripe/Pagar.me) — wrapped as a data URI so callers can use it directly as an <img src>.
			qr: tx?.qr_code_base64 ? `data:image/png;base64,${tx.qr_code_base64}` : '',
			copyPaste: tx?.qr_code ?? '',
			expiresAt: r.date_of_expiration ? new Date(r.date_of_expiration) : expiresAt,
		}
	}

	// The reconciliation sweep's refund poll (RefundReconcileJob) — GET /v1/payments/{id} (the
	// classic Payments API, NEVER the Orders API). `transaction_amount_refunded` is the ACCUMULATED
	// total refunded to date (reais decimal → cents via toCents); `refunds[]` lists each individual
	// refund with its own gateway `id` — the SAME canonical id a webhook would carry for it (identity
	// doctrine) — preserved in the gateway's own array order (oldest → newest, per the documented
	// Payments API shape). idemKey carries no retry semantics for a GET (there is nothing to dedupe
	// against) — a stable per-call value just satisfies MercadoPago's mandatory X-Idempotency-Key header.
	//
	// `transaction_amount_refunded` is documented as ALWAYS present on the classic Payments API GET
	// (0 for a never-refunded payment, never absent) — so a missing/undefined value here is shape
	// drift, not "no refunds", and THROWS instead of silently coercing to 0 (a lying zero would mask
	// real drift for RefundReconcileJob's Σ REFUND comparison). A refund entry missing its own `id`
	// is excluded from `refunds[]` (never fabricate an id) but still contributes to the total via
	// the accumulated `transaction_amount_refunded` field, not via summing this array.
	override async getRefundStatus(gatewayTxId: string): Promise<RefundStatus> {
		const raw = await this.call(`/v1/payments/${gatewayTxId}`, undefined, `refund-status:${gatewayTxId}`, undefined, 'GET')
		const r = parseGatewayResponse(MercadoPagoPaymentResponseSchema, raw, 'mercadopago')

		if (r.transaction_amount_refunded == null) {
			throw new BaseError<InterfaceErrors>(
				'PROVIDER_ERROR',
				`MercadoPago payment ${gatewayTxId} has no transaction_amount_refunded — shape drift`,
			)
		}

		const refundedTotalCents = this.toCents(r.transaction_amount_refunded)
		const refunds = (r.refunds ?? [])
			.filter(refund => refund.id != null)
			.map(refund => ({ gatewayRef: String(refund.id), amountCents: this.toCents(refund.amount ?? 0) }))

		return { refundedTotalCents, refunds }
	}

	// MercadoPago reports/accepts REAIS decimal everywhere (never cents) — Math.round guards against
	// float drift (e.g. 10.01 * 100 === 1000.9999999999999 in raw floating point).
	private toCents(reais: number): number {
		return Math.round(reais * 100)
	}

	// The reconciliation sweep's chargeback poll (ChargebackReconcileJob) — same GET/parse as
	// getRefundStatus, reusing the already-confirmed `status` field on the classic Payments API
	// (GET /v1/payments/{id}, never the Orders API). `status: 'charged_back'` is the ONLY status this
	// method recognizes as a dispute — no other status is ever inferred as chargedback (fail-safe).
	override async getChargebackStatus(gatewayTxId: string): Promise<ChargebackStatus> {
		const raw = await this.call(`/v1/payments/${gatewayTxId}`, undefined, `chargeback-status:${gatewayTxId}`, undefined, 'GET')
		const r = parseGatewayResponse(MercadoPagoPaymentResponseSchema, raw, 'mercadopago')
		return { chargedBack: r.status === 'charged_back' }
	}
}
