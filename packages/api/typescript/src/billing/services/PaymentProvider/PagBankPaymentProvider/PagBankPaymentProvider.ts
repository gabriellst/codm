import { injectable } from 'tsyringe-neo'
import { ProductConfig } from '@shared/config'
import { BaseError, Config } from '@template/core-typescript'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { withResilience } from '@template/core-typescript'
import type { InterfaceErrors } from '@billing/errors'

import {
	PaymentProvider,
	type ChargeResult,
	type CheckoutSessionResult,
	type EnsureCustomerParams,
	type CreateCheckoutSessionParams,
	type ChargeOffSessionParams,
	type ChargeStoredOnSessionParams,
	type CancelChargeParams,
	type CreatePixParams,
} from '../PaymentProvider'
import { parseGatewayResponse } from '../parseGatewayResponse'
import { PagBankCheckoutResponseSchema, PagBankOrderResponseSchema, PagBankChargeCancelResponseSchema } from './schemas'
import { BillingPlatform, CheckoutIntent, PaymentMethodType } from '@template/contracts-typescript/wire/enums'

// PagBank checkout/Pix links default to 30-minute/24-hour windows respectively when the caller
// doesn't need a shorter one — mirrors the fallback the checkout-only siblings use.
const CHECKOUT_TTL_MS = 30 * 60 * 1000
const PIX_TTL_MS = 24 * 60 * 60 * 1000

/**
 * PagBank/PagSeguro gateway adapter — CHECKOUT-ONLY tier (see the multi-gateway spec matrix):
 * the vault ("store: true") lives only on the server-side Orders API, which would require
 * handling raw card data and break SAQ A, so this provider never vaults a card. The hosted
 * checkout (`POST /checkouts`) settles + activates the FIRST invoice; renewals have no MIT and
 * degrade to the existing manual-pay flow. Pix is a first-class capability, minted directly via
 * `POST /orders` with `qr_codes`.
 *
 * Auth: Bearer PAGBANK_API_TOKEN on every call, plus `x-idempotency-key` (48h window per
 * PagBank docs) so a retried mint/cancel never double-creates or double-refunds.
 *
 * Every raw HTTP response is parsed against a zod contract in `./schemas` via
 * `parseGatewayResponse` before this provider reads a single field off it — `call()` itself
 * only returns `unknown`.
 *
 * PagBank descope (verified against developer.pagbank.com.br): `POST /checkouts` mints a
 * `CHEC_…` id — OUR `sessionRef` — but PagBank never creates an Order until the checkout is
 * actually paid, so there is NO order id at mint time. `GET /orders/{sessionRef}` against a
 * `CHEC_…` id can therefore never resolve — a prior version of this provider polled exactly
 * that endpoint and was provably wrong (see git history). The paid webhook carries the ORDER
 * (`ORDE_…`), with no reference back to the `CHEC_…` checkout — the only correlation available
 * is `reference_id` (= our `engineInvoiceId`); the checkout→order propagation of `reference_id`
 * is strongly indicated by the docs but not explicitly confirmed (registered follow-up: verify
 * against sandbox). `GET /checkouts/{CHEC_…}` — the endpoint that WOULD match our `sessionRef` —
 * is docs-unverifiable for paid-detection: its enum carries no PAID status and its payments
 * shape is undocumented. Given both gaps, this provider does NOT implement
 * `getCheckoutSessionStatus` — it falls to the `PaymentProvider` base default
 * (`PROVIDER_CAPABILITY_UNSUPPORTED`), same as Pagar.me/Asaas/MercadoPago. Completion instead
 * relies entirely on the webhook, with an invoice-keyed fallback in
 * `ExternalCheckoutCompletedHandler` for the ORDE_-vs-CHEC_ id mismatch.
 */
@injectable()
export class PagBankPaymentProvider extends PaymentProvider {
	readonly platform = BillingPlatform.PAGBANK
	readonly capabilities = { hostedCardCheckout: true, cardVaulting: false }
	readonly supportedMethods = new Set([PaymentMethodType.CARD, PaymentMethodType.PIX])

	private readonly baseUrl = 'https://api.pagseguro.com'

	// PagBank is BRL-only (BR-market acquirer) — anything else fails loudly instead of silently
	// charging BRL, same posture as PagarMePaymentProvider.assertBRL.
	private assertBRL(currency?: CurrencyCode): void {
		if (currency && currency !== CurrencyCode.BRL) {
			throw new BaseError<InterfaceErrors>('PROVIDER_ERROR', `PagBank only settles BRL — got ${currency}`)
		}
	}

	private async call(path: string, body: unknown, idemKey: string, apiKey?: string): Promise<unknown> {
		const headers: Record<string, string> = {
			'content-type': 'application/json',
			authorization: `Bearer ${apiKey ?? ProductConfig.env.PAGBANK_API_TOKEN}`,
			// Idempotent for 48h on PagBank's side — every write here carries a caller-supplied
			// idemKey (the port requires one), so every call is safe to retry.
			'x-idempotency-key': idemKey,
		}
		return withResilience(
			async signal => {
				const res = await fetch(`${this.baseUrl}${path}`, { method: 'POST', headers, body: JSON.stringify(body), signal })
				if (!res.ok) {
					const detail = await res.text().catch(() => '')
					throw new BaseError<InterfaceErrors>('PROVIDER_ERROR', detail || `PagBank responded ${res.status}`)
				}
				return await res.json()
			},
			{ retryable: true, label: 'pagbank' },
		)
	}

	async ensureCustomer(_p: EnsureCustomerParams): Promise<void> {
		// No gateway customer record to upsert: PagBank's only vault surface is the server-side
		// Orders API (`store: true`), which is out of reach for a SAQ A merchant (see class doc) —
		// this provider never vaults, so there is nothing to prepare ahead of a charge.
	}

	async createCheckoutSession(p: CreateCheckoutSessionParams): Promise<CheckoutSessionResult> {
		if (p.intent === CheckoutIntent.SETUP) {
			// capabilities.cardVaulting is false — a vault-only session (no charge) has no surface
			// on this provider.
			throw new BaseError<InterfaceErrors>('PROVIDER_CAPABILITY_UNSUPPORTED', 'PagBank does not support vault-only checkout sessions')
		}
		if (!p.engineInvoiceId || !p.amountCents) {
			throw new Error('createCheckoutSession: intent=payment requires engineInvoiceId + amountCents')
		}
		this.assertBRL(p.currency)

		const expiresAt = new Date(Date.now() + CHECKOUT_TTL_MS)
		const data = await this.call(
			'/checkouts',
			{
				reference_id: p.engineInvoiceId,
				// PagBank items carry cents, same as the port's amountCents — no reais conversion needed.
				items: [{ name: p.presentation?.title ?? `Fatura ${p.engineInvoiceId}`, quantity: 1, unit_amount: p.amountCents }],
				payment_methods: [{ type: 'CREDIT_CARD' }, { type: 'PIX' }],
				redirect_url: p.successUrl,
				payment_notification_urls: [`${Config.env.API_URL}/api/billing/webhooks/pagbank`],
				expiration_date: expiresAt.toISOString(),
			},
			p.idemKey,
			p.credentials?.apiKey,
		)
		const r = parseGatewayResponse(PagBankCheckoutResponseSchema, data, 'pagbank')

		const payLink = r.links?.find(link => link.rel === 'PAY')?.href
		if (!payLink) throw new BaseError<InterfaceErrors>('PROVIDER_ERROR', `createCheckoutSession: checkout ${r.id} has no PAY link`)

		return { url: payLink, sessionRef: r.id, expiresAt }
	}

	// NO checkout-session poll override (descoped — see class doc "PagBank descope" paragraph):
	// `getCheckoutSessionStatus` stays on the `PaymentProvider` base default
	// (`PROVIDER_CAPABILITY_UNSUPPORTED`) — PagBank falls to the same webhook-only reconciliation
	// path as Pagar.me/Asaas/MercadoPago.

	// Both MIT paths require a vaulted card — PagBank never vaults (capabilities.cardVaulting is
	// false), so there is no pmRef this provider could have minted. Renewals without a stored
	// credential degrade to the existing manual-pay flow (NO_PAYMENT_METHOD → dunning).
	async chargeOffSession(_p: ChargeOffSessionParams): Promise<ChargeResult> {
		throw new BaseError<InterfaceErrors>(
			'PROVIDER_CAPABILITY_UNSUPPORTED',
			'PagBank has no card vault — off-session charges are unavailable',
		)
	}

	async chargeStoredOnSession(_p: ChargeStoredOnSessionParams): Promise<ChargeResult> {
		throw new BaseError<InterfaceErrors>(
			'PROVIDER_CAPABILITY_UNSUPPORTED',
			'PagBank has no card vault — stored-credential charges are unavailable',
		)
	}

	async cancelCharge(p: CancelChargeParams): Promise<void> {
		const data = await this.call(
			`/charges/${p.gatewayTxId}/cancel`,
			p.amountCents !== undefined ? { amount: { value: p.amountCents } } : {},
			p.idemKey,
			p.credentials?.apiKey,
		)
		parseGatewayResponse(PagBankChargeCancelResponseSchema, data, 'pagbank')
	}

	async createPix(p: CreatePixParams): Promise<{ pixId: string; qr: string; copyPaste: string; expiresAt: Date }> {
		this.assertBRL(p.currency)

		const expiresAt = new Date(Date.now() + PIX_TTL_MS)
		const data = await this.call(
			'/orders',
			{
				reference_id: p.externalReference,
				qr_codes: [{ amount: { value: p.amountCents }, expiration_date: expiresAt.toISOString() }],
			},
			p.idemKey,
			p.credentials?.apiKey,
		)
		const r = parseGatewayResponse(PagBankOrderResponseSchema, data, 'pagbank')

		const qrCode = r.qr_codes?.[0]
		if (!qrCode?.text) throw new BaseError<InterfaceErrors>('PROVIDER_ERROR', `createPix: order ${r.id} has no qr_code text`)
		const png = qrCode.links?.find(link => link.rel === 'QRCODE.PNG')?.href ?? qrCode.links?.[0]?.href ?? ''

		return {
			pixId: r.id,
			qr: png,
			copyPaste: qrCode.text,
			expiresAt: qrCode.expiration_date ? new Date(qrCode.expiration_date) : expiresAt,
		}
	}
}
