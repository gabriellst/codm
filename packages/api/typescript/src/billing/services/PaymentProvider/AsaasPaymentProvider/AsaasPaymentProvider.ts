import { injectable } from 'tsyringe-neo'
import { BaseError } from '@template/core-typescript'
import { ProductConfig } from '@shared/config'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { withResilience } from '@template/core-typescript'
import { BILLING_MESSAGES } from '@billing/i18n'
import type { InterfaceErrors } from '@billing/errors'

import {
	PaymentProvider,
	type ChargeResult,
	type RefundStatus,
	type ChargebackStatus,
	type CheckoutSessionResult,
	type BillingCustomerIdentity,
	type EnsureCustomerParams,
	type CreateCheckoutSessionParams,
	type ChargeOffSessionParams,
	type ChargeStoredOnSessionParams,
	type CancelChargeParams,
	type CreatePixParams,
} from '../PaymentProvider'
import { parseGatewayResponse } from '../parseGatewayResponse'
import { BillingPlatform, CheckoutIntent, DeclineReason, PaymentMethodType } from '@template/contracts-typescript/wire/enums'
import {
	AsaasCustomerResponseSchema,
	AsaasCustomerSearchResponseSchema,
	AsaasCheckoutResponseSchema,
	AsaasPaymentResponseSchema,
	AsaasPixQrCodeResponseSchema,
} from './schemas'

// Where a hosted checkout session is shown — distinct from the API host (`api.asaas.com`).
const ASAAS_CHECKOUT_BASE_URL = 'https://www.asaas.com'

// How long a minted checkout session stays valid — mirrors the value sent as `minutesToExpire`.
const CHECKOUT_MINUTES_TO_EXPIRE = 60

// Payment-level statuses a chargeback in progress moves the payment to — confirmed against the
// official Payments API. No other status is ever inferred as a chargeback (getChargebackStatus
// fail-safe: unknown status → not chargedback, never a guess).
const CHARGEBACK_PAYMENT_STATUSES = new Set(['CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL'])

/**
 * Asaas gateway adapter. Talks raw v3 HTTP (no official Node SDK, same posture as
 * PagarMePaymentProvider) via `fetch` + `withResilience`.
 *
 * ─── pmRef encoding (a design decision made entirely within this provider + AsaasWebhookMapper,
 * without touching the shared port) ───
 * Asaas' charge endpoint (`POST /v3/payments`) requires BOTH the owning Asaas customer id AND the
 * `creditCardToken` to charge a vaulted card — unlike Stripe (pm_ resolves its own customer) or
 * Pagar.me (`card_id` alone resolves server-side). `ChargeOffSessionParams` carries no ownerId to
 * re-derive the customer from (by design — MIT renewals are pinned to the vaulted instrument, not
 * re-resolved per call), so this provider packs BOTH into `pmRef` at vault time:
 * `pmRef = "${asaasCustomerId}:${creditCardToken}"`. AsaasWebhookMapper.instrumentFrom is the one
 * place that builds it (has both `payment.customer` and `payment.creditCard.creditCardToken` on
 * the vaulting webhook); `splitPmRef` below is the one place that reads it apart.
 *
 * ─── idempotency (ASAAS-DOC-UNCERTAIN) ───
 * Asaas has no Idempotency-Key request mechanism (unlike Stripe/Pagar.me's header). Every WRITE
 * call here therefore runs with `retryable: false` — a timed-out/dropped response is never
 * automatically retried, so a network hiccup can't double-charge, double-vault, or double-refund.
 * Only reads (GET) are marked retryable. True replay-safety (e.g. a caller retrying `cancelCharge`
 * with the same `idemKey`) is own-side dedup at a higher layer (invoiceId+amount) — out of scope
 * for this provider, which has no persistence of its own.
 */
@injectable()
export class AsaasPaymentProvider extends PaymentProvider {
	readonly platform = BillingPlatform.ASAAS
	readonly capabilities = { hostedCardCheckout: true, cardVaulting: true }
	readonly supportedMethods = new Set([PaymentMethodType.CARD, PaymentMethodType.PIX])

	// API host — production by default; ASAAS_BASE_URL points it to the sandbox for test keys.
	private readonly baseUrl = ProductConfig.env.ASAAS_BASE_URL

	private async call(path: string, body: unknown, method: 'GET' | 'POST', apiKey?: string): Promise<unknown> {
		const headers: Record<string, string> = {
			'content-type': 'application/json',
			// Asaas authenticates with a STATIC token carrying the raw API key in `access_token` — not
			// Bearer/Basic like Stripe/Pagar.me. Per-call credentials override the platform key.
			access_token: apiKey ?? ProductConfig.env.ASAAS_API_KEY,
		}
		return withResilience(
			async signal => {
				const res = await fetch(`${this.baseUrl}${path}`, {
					method,
					headers,
					...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
					signal,
				})
				if (!res.ok) {
					const detail = await res.text().catch(() => '')
					throw new BaseError<InterfaceErrors>('PROVIDER_ERROR', detail || `Asaas responded ${res.status}`)
				}
				return await res.json()
			},
			// See the class-level comment: no Idempotency-Key mechanism → writes are never auto-retried.
			{ retryable: method === 'GET', label: 'asaas' },
		)
	}

	// Asaas is BRL-only in the researched surface (values are always REAIS decimal, no currency
	// field on the payment/checkout resources) — mirrors PagarMePaymentProvider.assertBRL.
	private assertBRL(currency?: CurrencyCode): void {
		if (currency && currency !== CurrencyCode.BRL) {
			throw new BaseError<InterfaceErrors>('PROVIDER_ERROR', `Asaas only settles BRL — got ${currency}`)
		}
	}

	// Asaas reports/accepts REAIS decimal everywhere, never cents — convert carefully both ways.
	private toReais(amountCents: number): number {
		return Number((amountCents / 100).toFixed(2))
	}

	private todayISODate(): string {
		return new Date().toISOString().slice(0, 10)
	}

	// See class-level comment — the composite pmRef this provider vaults as an instrument's `pmRef`.
	private splitPmRef(pmRef: string): { customerId: string; creditCardToken: string } {
		const [customerId, creditCardToken] = pmRef.split(':')
		if (!customerId || !creditCardToken) {
			throw new BaseError<InterfaceErrors>(
				'PROVIDER_ERROR',
				`AsaasPaymentProvider: malformed pmRef "${pmRef}" (expected "<asaasCustomerId>:<creditCardToken>")`,
			)
		}
		return { customerId, creditCardToken }
	}

	// Asaas gives free-text error descriptions (PT), not structured codes — classify by keyword,
	// same posture as PagarMePaymentProvider.declineReasonFrom; unclassifiable → generic decline
	// (per the template rule: DeclineReason always falls back to CARD_DECLINED).
	private declineReasonFrom(reason: string): DeclineReason {
		const lower = reason.toLowerCase()
		if (lower.includes('insufficient') || lower.includes('saldo') || lower.includes('limite')) return DeclineReason.INSUFFICIENT_FUNDS
		if (lower.includes('expired') || lower.includes('vencid') || lower.includes('expirad')) return DeclineReason.CARD_EXPIRED
		if (lower.includes('authentication') || lower.includes('autentic')) return DeclineReason.AUTHENTICATION_REQUIRED
		return DeclineReason.CARD_DECLINED
	}

	// Upsert the Asaas customer keyed by `externalReference` (= our ownerId) — the same search-then-
	// create/update posture as StripePaymentProvider.ensureCustomerId, adapted to Asaas' query params.
	private async ensureCustomerId(ownerId: string, owner?: BillingCustomerIdentity, apiKey?: string): Promise<string> {
		const customer = owner ? this.buildCustomer(owner) : undefined
		const existingId = await this.findCustomerIdByExternalReference(ownerId, apiKey)
		if (existingId) {
			if (customer) {
				// ASAAS-DOC-UNCERTAIN: the v3 API updates a customer via POST to /customers/{id} (no PUT
				// verb documented for this resource).
				await parseGatewayResponse(
					AsaasCustomerResponseSchema,
					await this.call(
						`/customers/${existingId}`,
						{ name: customer.name, email: customer.email, ...(customer.document ? { cpfCnpj: customer.document } : {}) },
						'POST',
						apiKey,
					),
					'asaas',
				)
			}
			return existingId
		}
		const created = parseGatewayResponse(
			AsaasCustomerResponseSchema,
			await this.call(
				'/customers',
				{
					name: customer?.name ?? ownerId,
					email: customer?.email,
					externalReference: ownerId,
					...(customer?.document ? { cpfCnpj: customer.document } : {}),
				},
				'POST',
				apiKey,
			),
			'asaas',
		)
		return created.id
	}

	private async findCustomerIdByExternalReference(ownerId: string, apiKey?: string): Promise<string | undefined> {
		const result = parseGatewayResponse(
			AsaasCustomerSearchResponseSchema,
			await this.call(`/customers?externalReference=${encodeURIComponent(ownerId)}`, undefined, 'GET', apiKey),
			'asaas',
		)
		return result.data[0]?.id
	}

	async ensureCustomer(p: EnsureCustomerParams): Promise<void> {
		await this.ensureCustomerId(p.ownerId, p.owner, p.credentials?.apiKey)
	}

	async createCheckoutSession(p: CreateCheckoutSessionParams): Promise<CheckoutSessionResult> {
		if (p.intent === CheckoutIntent.SETUP) {
			// ASAAS-DOC-UNCERTAIN: the only hosted-checkout surface in the researched Asaas API is
			// `POST /v3/checkouts` with `chargeTypes: ['DETACHED']` — a one-off ITEM (and its charge) is
			// always required. There is no documented $0/verification-only checkout that vaults a card
			// without a real payment (vaulting only happens via the paid webhook's
			// creditCard.creditCardToken — see AsaasWebhookMapper.instrumentFrom), so a pure "add card"
			// setup session has no Asaas equivalent today.
			throw new BaseError<InterfaceErrors>(
				'PROVIDER_CAPABILITY_UNSUPPORTED',
				'AsaasPaymentProvider: setup-only (vault-without-charge) checkout sessions are not supported — Asaas checkout always charges an item',
			)
		}
		if (!p.engineInvoiceId || !p.amountCents) {
			throw new Error('createCheckoutSession: intent=payment requires engineInvoiceId + amountCents')
		}
		this.assertBRL(p.currency)

		const apiKey = p.credentials?.apiKey
		const customer = p.owner ? this.buildCustomer(p.owner) : undefined

		const session = parseGatewayResponse(
			AsaasCheckoutResponseSchema,
			await this.call(
				'/checkouts',
				{
					billingTypes: ['CREDIT_CARD', 'PIX'],
					chargeTypes: ['DETACHED'],
					minutesToExpire: CHECKOUT_MINUTES_TO_EXPIRE,
					items: [
						{
							description:
								p.presentation?.title ?? BILLING_MESSAGES.invoiceFallbackTitle(p.owner?.language, { invoiceId: p.engineInvoiceId }),
							quantity: 1,
							value: this.toReais(p.amountCents),
						},
					],
					...(customer
						? { customerData: { name: customer.name, email: customer.email, ...(customer.document ? { cpfCnpj: customer.document } : {}) } }
						: {}),
					callback: { successUrl: p.successUrl },
					externalReference: p.engineInvoiceId,
				},
				'POST',
				apiKey,
			),
			'asaas',
		)

		return {
			url: `${ASAAS_CHECKOUT_BASE_URL}/checkoutSession/show?id=${session.id}`,
			sessionRef: session.id,
			expiresAt: new Date(Date.now() + CHECKOUT_MINUTES_TO_EXPIRE * 60_000),
		}
	}

	async chargeOffSession(p: ChargeOffSessionParams): Promise<ChargeResult> {
		this.assertBRL(p.currency)
		const { customerId, creditCardToken } = this.splitPmRef(p.pmRef)
		return this.chargeCard({
			customerId,
			creditCardToken,
			amountCents: p.amountCents,
			engineInvoiceId: p.code,
			apiKey: p.credentials?.apiKey,
		})
	}

	async chargeStoredOnSession(p: ChargeStoredOnSessionParams): Promise<ChargeResult> {
		this.assertBRL(p.currency)
		const { customerId, creditCardToken } = this.splitPmRef(p.pmRef)
		return this.chargeCard({
			customerId,
			creditCardToken,
			amountCents: p.amountCents,
			engineInvoiceId: p.engineInvoiceId,
			apiKey: p.credentials?.apiKey,
		})
	}

	// Shared MIT/CIT confirm — both chargeOffSession (subsequent) and chargeStoredOnSession (first)
	// hit the SAME Asaas endpoint with the SAME body shape (Asaas has no distinct
	// recurrence_cycle/off_session flag the way Pagar.me/Stripe do); the port's distinction between
	// the two is purely about the caller's origin (renewal vs first charge of the series).
	private async chargeCard(p: {
		customerId: string
		creditCardToken: string
		amountCents: number
		engineInvoiceId?: string
		apiKey?: string
	}): Promise<ChargeResult> {
		try {
			const r = parseGatewayResponse(
				AsaasPaymentResponseSchema,
				await this.call(
					'/payments',
					{
						customer: p.customerId,
						billingType: 'CREDIT_CARD',
						value: this.toReais(p.amountCents),
						dueDate: this.todayISODate(),
						creditCardToken: p.creditCardToken,
						// Asaas requires the payer's IP for card antifraud on POST /payments. The port doesn't
						// thread the caller's request IP through the charge params (Stripe/Pagar.me don't need
						// it) — TODO: extend the port to carry it end-to-end if Asaas' antifraud rejects/flags a
						// placeholder in production.
						remoteIp: '127.0.0.1',
						...(p.engineInvoiceId ? { externalReference: p.engineInvoiceId } : {}),
					},
					'POST',
					p.apiKey,
				),
				'asaas',
			)
			return { ok: true, gatewayTxId: r.id }
		} catch (e) {
			// A synchronous Asaas decline surfaces as a thrown BaseError (non-2xx from `call`) — Asaas
			// has no "status: FAILED" success-envelope for card declines the way Pagar.me does.
			const reason = e instanceof Error ? e.message : 'PROVIDER_ERROR'
			return { ok: false, reason, declineCode: this.declineReasonFrom(reason) }
		}
	}

	async cancelCharge(p: CancelChargeParams): Promise<void> {
		// NO idempotency key (see class-level comment) — a retried cancel is NOT automatically safe;
		// own-side dedup (invoiceId+amount) is the caller's responsibility.
		await parseGatewayResponse(
			AsaasPaymentResponseSchema,
			await this.call(
				`/payments/${p.gatewayTxId}/refund`,
				p.amountCents !== undefined ? { value: this.toReais(p.amountCents) } : {},
				'POST',
				p.credentials?.apiKey,
			),
			'asaas',
		)
	}

	async createPix(p: CreatePixParams): Promise<{ pixId: string; qr: string; copyPaste: string; expiresAt: Date }> {
		this.assertBRL(p.currency)
		// ASAAS-DOC-UNCERTAIN: unlike Stripe (no customer required) / Pagar.me (inline customer object
		// accepted on the order), Asaas' POST /v3/payments requires an EXISTING customer id string —
		// there is no inline-customer-data variant for direct payment creation (only /v3/checkouts
		// accepts `customerData`). CreatePixParams.payer is optional on the port (the other two
		// gateways don't need it), but Asaas does — fail loudly rather than silently minting a
		// throwaway/placeholder customer record.
		if (!p.payer) {
			throw new BaseError<InterfaceErrors>(
				'PROVIDER_ERROR',
				'AsaasPaymentProvider: createPix requires a payer identity — Asaas requires an existing customer to create a payment',
			)
		}
		const apiKey = p.credentials?.apiKey
		const customer = this.buildCustomer(p.payer)
		// A fresh customer per Pix charge (no ownerId available here to dedupe against via
		// externalReference, unlike ensureCustomerId) — acceptable for a one-off rail (Pix charges
		// carry no vaulting concern, so customer identity stability doesn't matter the way it does
		// for chargeCard's composite pmRef).
		const created = parseGatewayResponse(
			AsaasCustomerResponseSchema,
			await this.call(
				'/customers',
				{ name: customer.name, email: customer.email, ...(customer.document ? { cpfCnpj: customer.document } : {}) },
				'POST',
				apiKey,
			),
			'asaas',
		)

		const payment = parseGatewayResponse(
			AsaasPaymentResponseSchema,
			await this.call(
				'/payments',
				{
					customer: created.id,
					billingType: 'PIX',
					value: this.toReais(p.amountCents),
					dueDate: this.todayISODate(),
					externalReference: p.externalReference,
				},
				'POST',
				apiKey,
			),
			'asaas',
		)

		const qrCode = parseGatewayResponse(
			AsaasPixQrCodeResponseSchema,
			await this.call(`/payments/${payment.id}/pixQrCode`, undefined, 'GET', apiKey),
			'asaas',
		)

		return {
			pixId: payment.id,
			qr: qrCode.encodedImage ? `data:image/png;base64,${qrCode.encodedImage}` : '',
			copyPaste: qrCode.payload ?? '',
			expiresAt: qrCode.expirationDate ? new Date(qrCode.expirationDate) : new Date(Date.now() + 24 * 60 * 60 * 1000),
		}
	}

	// The reconciliation sweep's refund poll (RefundReconcileJob) — GET /payments/{id}. Only
	// `status: 'DONE'` refund entries are effectuated (PENDING/CANCELLED/unmapped stay OUT of the
	// total — fail-safe, false-negative preferred over false-positive in money code).
	// `endToEndIdentifier` is Asaas' STABLE canonical refund id — the same id a real webhook would
	// carry for this refund (identity doctrine); the refund sub-resource's own `id` is NOT reliable/
	// stable per Asaas docs, so it is never used as `gatewayRef`. A DONE refund missing
	// `endToEndIdentifier` is still counted in `refundedTotalCents` (the money genuinely moved) but
	// EXCLUDED from `refunds[]` — fail-safe: never fabricate an id. `value` is REAIS decimal, never
	// cents. No credentials param on this port method — always polls with the platform API key.
	//
	// Fail-safe calibration (never a lying zero):
	// - A DONE refund missing `value` is undocumented shape drift — a completed refund without an
	//   amount does not exist — so it THROWS instead of silently coercing to 0.
	// - `refunds` itself being ABSENT is the NORMAL shape for a payment that was never refunded — that
	//   alone stays a zero-refunds result, not an error.
	// - BUT `refunds` absent WHILE the payment's own `status` is 'REFUNDED' (a full refund) is a
	//   contradiction — so that combination throws too (shape drift).
	override async getRefundStatus(gatewayTxId: string): Promise<RefundStatus> {
		const raw = await this.call(`/payments/${gatewayTxId}`, undefined, 'GET')
		const r = parseGatewayResponse(AsaasPaymentResponseSchema, raw, 'asaas')

		if (r.refunds == null) {
			if (r.status === 'REFUNDED') {
				throw new BaseError<InterfaceErrors>(
					'PROVIDER_ERROR',
					`Asaas payment ${gatewayTxId} reports status REFUNDED but carries no refunds[] — shape drift`,
				)
			}
			return { refundedTotalCents: 0, refunds: [] }
		}

		let refundedTotalCents = 0
		const refunds: { gatewayRef: string; amountCents: number }[] = []
		for (const refund of r.refunds) {
			if (refund.status !== 'DONE') continue
			if (refund.value == null) {
				throw new BaseError<InterfaceErrors>(
					'PROVIDER_ERROR',
					`Asaas refund on payment ${gatewayTxId} is DONE but carries no value — shape drift`,
				)
			}
			const amountCents = this.toCentsFromReais(refund.value)
			refundedTotalCents += amountCents
			if (refund.endToEndIdentifier) {
				refunds.push({ gatewayRef: refund.endToEndIdentifier, amountCents })
			}
			// else: DONE refund with no stable canonical id on this delivery — excluded from the list,
			// still counted in the total (see method doc).
		}

		return { refundedTotalCents, refunds }
	}

	// REAIS decimal → cents, the inverse of `toReais` — Math.round guards against float drift.
	private toCentsFromReais(reais: number): number {
		return Math.round(reais * 100)
	}

	// The reconciliation sweep's chargeback poll (ChargebackReconcileJob) — same GET as
	// getRefundStatus (GET /payments/{id}), reading the PAYMENT-level `status` instead of the
	// refunds sub-resource. Only the 3 confirmed dispute statuses count — no other status is ever
	// inferred as a chargeback.
	override async getChargebackStatus(gatewayTxId: string): Promise<ChargebackStatus> {
		const raw = await this.call(`/payments/${gatewayTxId}`, undefined, 'GET')
		const r = parseGatewayResponse(AsaasPaymentResponseSchema, raw, 'asaas')
		return { chargedBack: r.status != null && CHARGEBACK_PAYMENT_STATUSES.has(r.status) }
	}
}
