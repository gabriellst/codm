import { injectable } from 'tsyringe-neo'
import { ProductConfig } from '@shared/config'
import { BaseError } from '@template/core-typescript'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { withResilience } from '@template/core-typescript'
import { BILLING_MESSAGES } from '@billing/i18n'
import type { InterfaceErrors } from '@billing/errors'

import {
	PaymentProvider,
	type ChargeResult,
	type ChargeSettlementStatus,
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
import {
	PagarMeOrderResponseSchema,
	type PagarMeOrderResponse,
	PagarMePaymentLinkResponseSchema,
	PagarMePixOrderResponseSchema,
	PagarMeCustomerResponseSchema,
} from './schemas'
import { LoggingService } from '@template/core-typescript'
import { BillingPlatform, CheckoutIntent, DeclineReason, PaymentMethodType } from '@template/contracts-typescript/wire/enums'

// Orders come back synchronously as 'paid' (captured), 'pending'/'processing' (async settlement —
// the real outcome lands later via webhook), or one of these terminal-not-paid statuses when the
// gateway already knows it won't settle. `resultFromOrder` only ever observes 'failed'/
// 'payment_failed' synchronously; `getChargeStatus` (order-poll, T5) also sees states a synchronous
// charge response never carries (e.g. a later cancel) — the full terminal set lives here so a
// canceled/voided/refused/errored order never falls through to `pending`.
const FAILED_ORDER_STATUSES = new Set(['failed', 'payment_failed', 'refused', 'canceled', 'voided', 'with_error'])

// Accepted-but-not-yet-settled: the order is in flight and its real paid/failed outcome lands later
// via webhook (charge.paid / charge.failed). These are `ok:true` (NOT a decline) but carry
// `pending:true` so the caller records a PENDING Charge instead of a premature SUCCEEDED — the
// invoice must not DERIVE as PAID before settlement actually confirms.
const PENDING_ORDER_STATUSES = new Set(['pending', 'processing'])

// Captured — money actually moved. Any charge (or the order itself) in this set means the whole
// order is `settled` regardless of other charges/order-level status (any-captured-wins, T5).
const PAID_ORDER_STATUSES = new Set(['paid', 'captured'])

@injectable()
export class PagarMePaymentProvider extends PaymentProvider {
	readonly platform = BillingPlatform.PAGARME
	readonly capabilities = { hostedCardCheckout: true, cardVaulting: true }
	readonly supportedMethods = new Set([PaymentMethodType.CARD, PaymentMethodType.PIX])

	private readonly baseUrl = 'https://api.pagar.me'

	constructor(private loggingService: LoggingService) {
		super()
	}

	private authHeader(apiKey?: string): string {
		// Pagar.me uses Basic auth with the secret key as the username and empty password. Per-call
		// credentials override the platform key (multi-account, same as StripePaymentProvider).
		return `Basic ${Buffer.from(`${apiKey ?? ProductConfig.env.PAGARME_API_KEY}:`).toString('base64')}`
	}

	// Pagar.me v5 orders are BRL-implicit — the API carries no currency field. Accepting a
	// different currency and silently charging BRL would be a money bug, so anything ≠ BRL fails
	// loudly here instead.
	private assertBRL(currency?: CurrencyCode): void {
		if (currency && currency !== CurrencyCode.BRL) {
			throw new BaseError<InterfaceErrors>('PROVIDER_ERROR', `PagarMe only settles BRL — got ${currency}`)
		}
	}

	private async call(
		path: string,
		body: unknown,
		idemKey?: string,
		method: 'POST' | 'DELETE' | 'GET' = 'POST',
		apiKey?: string,
	): Promise<unknown> {
		const headers: Record<string, string> = {
			'content-type': 'application/json',
			authorization: this.authHeader(apiKey),
		}
		if (idemKey) headers['Idempotency-Key'] = idemKey
		// Only safe to retry when an Idempotency-Key rides along — Pagar.me dedupes on it, so a
		// timed-out/dropped response can't double-charge or double-vault on the replay.
		return withResilience(
			async signal => {
				// GET sends no body — Pagar.me (and fetch itself, on some runtimes) rejects a body on GET.
				const res = await fetch(`${this.baseUrl}${path}`, {
					method,
					headers,
					...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
					signal,
				})
				if (!res.ok) {
					const detail = await res.text().catch(() => '')
					throw new BaseError<InterfaceErrors>('PROVIDER_ERROR', detail || `Pagar.me responded ${res.status}`)
				}
				return await res.json()
			},
			{ retryable: Boolean(idemKey), label: 'pagarme' },
		)
	}

	// Both charge methods land here: HTTP 2xx doesn't mean the charge succeeded — the gateway can
	// synchronously decline (status 'failed'/'payment_failed'). Surface its own message as the reason
	// instead of a bare constant so callers/operators see *why* it was declined.
	private resultFromOrder(r: PagarMeOrderResponse): ChargeResult {
		if (r.status && FAILED_ORDER_STATUSES.has(r.status)) {
			const lastTransaction = r.charges?.[0]?.last_transaction
			const reason = lastTransaction?.acquirer_message ?? lastTransaction?.status ?? r.status
			return { ok: false, reason, declineCode: this.declineReasonFrom(reason) }
		}
		// The CHARGE id (ch_…), not the order id: cancelCharge refunds via DELETE /core/v5/charges/{id},
		// and the webhook path stores charge ids too — an order id here would strand the refund path.
		const gatewayTxId = r.charges?.[0]?.id ?? r.id
		// `id` is nullish in the schema (shared shape with the refund-poll's charge rows), but a
		// successful order/charge response always carries one — a response without it is malformed.
		if (gatewayTxId == null) {
			throw new BaseError<InterfaceErrors>('PROVIDER_ERROR', 'PagarMe order/charge response missing id')
		}
		// A not-yet-settled 'pending'/'processing' order is accepted but UNCONFIRMED — flag it so the
		// caller keeps the Charge PENDING (settlement lands via webhook), never a premature SUCCEEDED.
		if (r.status && PENDING_ORDER_STATUSES.has(r.status)) {
			return { ok: true, gatewayTxId, pending: true }
		}
		return { ok: true, gatewayTxId }
	}

	// Pagar.me gives free-text acquirer messages (PT or EN), not structured codes — classify by
	// keyword; a synchronously-failed card order is at minimum a generic decline.
	private declineReasonFrom(reason: string): DeclineReason {
		const lower = reason.toLowerCase()
		if (lower.includes('insufficient') || lower.includes('saldo') || lower.includes('limite')) return DeclineReason.INSUFFICIENT_FUNDS
		if (lower.includes('expired') || lower.includes('vencid') || lower.includes('expirad')) return DeclineReason.CARD_EXPIRED
		return DeclineReason.CARD_DECLINED
	}

	async ensureCustomer(p: EnsureCustomerParams): Promise<void> {
		const customer = this.buildCustomer(p.owner)
		// Pagar.me v5 upserts a customer by `code` — POSTing an existing code updates it. Keying the
		// idempotency by ownerId + delegating dedup to `code` makes this safe to call before every
		// vault. The card/order endpoints reference this customer by the same ownerId `code`.
		const data = await this.call(
			'/core/v5/customers',
			{
				code: p.ownerId,
				name: customer.name,
				email: customer.email,
				...(customer.document ? { document: customer.document, type: customer.type ?? 'individual' } : {}),
			},
			`customer:${p.ownerId}`,
			'POST',
			p.credentials?.apiKey,
		)
		// Nothing here is read (upsert is keyed by `code`), but a malformed body should still fail
		// loud instead of being silently accepted.
		parseGatewayResponse(PagarMeCustomerResponseSchema, data, 'pagarme')
	}

	// Pagar.me v5 hosted checkout — a Payment Link (`type: 'order'`) that pays a cart amount AND
	// vaults the card (wallet v5 vaults automatically on every card charge; the resulting
	// `order.paid` webhook carries `last_transaction.card.id` — see PagarMeWebhookMapper).
	// Payment Links always carry a cart amount — there is no vault-only equivalent for this
	// gateway, so `intent: CheckoutIntent.SETUP` (no amount to charge) is unsupported here.
	async createCheckoutSession(p: CreateCheckoutSessionParams): Promise<CheckoutSessionResult> {
		this.assertBRL(p.currency)
		if (p.intent !== CheckoutIntent.PAYMENT || !p.engineInvoiceId || !p.amountCents) {
			throw new BaseError<InterfaceErrors>(
				'PROVIDER_ERROR',
				'PagarMe hosted checkout requires intent=payment with an engineInvoiceId + amountCents',
			)
		}

		const title = p.presentation?.title ?? BILLING_MESSAGES.invoiceFallbackTitle(p.owner?.language, { invoiceId: p.engineInvoiceId })

		const data = await this.call(
			'/core/v5/paymentlinks',
			{
				type: 'order',
				cart_settings: {
					items: [{ amount: p.amountCents, name: title }],
				},
				payment_settings: {
					accepted_payment_methods: ['credit_card', 'pix'],
					credit_card_settings: { operation_type: 'auth_and_capture' },
				},
				// PAGARME-DOC-UNCERTAIN: the v5 paymentlinks reference only documents customer_settings
				// for `type: 'subscription'` (via `customer_id`, the gateway's own internal id). For
				// `type: 'order'` we only hold `ownerId`, so we bind by `code` — the same key
				// ensureCustomer already upserts the gateway customer under (POST /core/v5/customers
				// `{ code: ownerId }`) and every order/customer reference elsewhere in this provider.
				customer_settings: { customer: { code: p.ownerId } },
				success_url: p.successUrl,
				// PAGARME-DOC-UNCERTAIN: the reference doesn't document the unit for `expires_in` on
				// the request — assuming seconds (24h) to match the other gateways' session TTLs.
				expires_in: 60 * 60 * 24,
			},
			p.idemKey,
			'POST',
			p.credentials?.apiKey,
		)
		const r = parseGatewayResponse(PagarMePaymentLinkResponseSchema, data, 'pagarme')

		return {
			url: r.url,
			sessionRef: r.id,
			// PAGARME-DOC-UNCERTAIN: assuming the response's `expires_in` is also seconds from creation.
			...(typeof r.expires_in === 'number' ? { expiresAt: new Date(Date.now() + r.expires_in * 1000) } : {}),
		}
	}

	async chargeOffSession(p: ChargeOffSessionParams): Promise<ChargeResult> {
		this.assertBRL(p.currency)
		try {
			const data = await this.call(
				'/core/v5/orders',
				{
					...(p.code ? { code: p.code } : {}),
					payments: [
						{
							payment_method: 'credit_card',
							credit_card: {
								card_id: p.pmRef,
								recurrence_cycle: 'subsequent',
								recurrence_model: 'standing_order',
							},
						},
					],
					amount: p.amountCents,
				},
				p.idemKey,
				'POST',
				p.credentials?.apiKey,
			)
			const r = parseGatewayResponse(PagarMeOrderResponseSchema, data, 'pagarme')
			return this.resultFromOrder(r)
		} catch (e) {
			return { ok: false, reason: e instanceof Error ? e.message : 'PROVIDER_ERROR' }
		}
	}

	// CIT on a stored credential: first charge of the series on an already-vaulted card_id
	// (NOT a one-shot token) — recurrence_cycle 'first' + standing_order establish the mandate.
	async chargeStoredOnSession(p: ChargeStoredOnSessionParams): Promise<ChargeResult> {
		this.assertBRL(p.currency)
		try {
			const data = await this.call(
				'/core/v5/orders',
				{
					code: p.engineInvoiceId,
					amount: p.amountCents,
					payments: [
						{
							payment_method: 'credit_card',
							credit_card: {
								card_id: p.pmRef,
								recurrence_cycle: 'first',
								recurrence_model: 'standing_order',
							},
						},
					],
				},
				p.idemKey,
				'POST',
				p.credentials?.apiKey,
			)
			const r = parseGatewayResponse(PagarMeOrderResponseSchema, data, 'pagarme')
			return this.resultFromOrder(r)
		} catch (e) {
			return { ok: false, reason: e instanceof Error ? e.message : 'PROVIDER_ERROR' }
		}
	}

	async cancelCharge(p: CancelChargeParams): Promise<void> {
		// No fields are ever read off this response (the DELETE's effect is the point), so it's
		// awaited and discarded — nothing to validate against a schema.
		await this.call(
			`/core/v5/charges/${p.gatewayTxId}`,
			p.amountCents !== undefined ? { amount: p.amountCents } : {},
			p.idemKey,
			'DELETE',
			p.credentials?.apiKey,
		)
	}

	async createPix(p: CreatePixParams): Promise<{ pixId: string; qr: string; copyPaste: string; expiresAt: Date }> {
		this.assertBRL(p.currency)
		const customer = p.payer ? this.buildCustomer(p.payer) : undefined
		const data = await this.call(
			'/core/v5/orders',
			{
				code: p.externalReference,
				amount: p.amountCents,
				// Carry the payer inline so the Pix charge has a document — Pix requires it.
				...(customer
					? {
							customer: {
								name: customer.name,
								email: customer.email,
								...(customer.document ? { document: customer.document, type: customer.type ?? 'individual' } : {}),
							},
						}
					: {}),
				payments: [{ payment_method: 'pix' }],
			},
			p.idemKey,
			'POST',
			p.credentials?.apiKey,
		)
		const r = parseGatewayResponse(PagarMePixOrderResponseSchema, data, 'pagarme')
		const tx = r.charges?.[0]?.last_transaction
		return {
			pixId: r.id,
			qr: tx?.qr_code_url ?? '',
			copyPaste: tx?.qr_code ?? '',
			expiresAt: tx?.expires_at ? new Date(tx.expires_at) : new Date(Date.now() + 24 * 60 * 60 * 1000),
		}
	}

	// Shared GET/parse for both reconciliation polls below: gatewayTxId can be either an order id
	// (or_…, from resultFromOrder's rare order-id fallback) or a charge id (ch_…, the common case) —
	// route to the matching endpoint and parse the response once.
	private async fetchOrderOrCharge(gatewayTxId: string): Promise<PagarMeOrderResponse> {
		const path = gatewayTxId.startsWith('or_') ? `/core/v5/orders/${gatewayTxId}` : `/core/v5/charges/${gatewayTxId}`
		const data = await this.call(path, undefined, undefined, 'GET')
		return parseGatewayResponse(PagarMeOrderResponseSchema, data, 'pagarme')
	}

	// The reconciliation sweep's gateway poll — order-authoritative (Decision 8): the ORDER's own
	// status plus every charge's status are consulted together, never "the latest charge" alone,
	// because a lagging/duplicate charge entry must not outrank a captured one.
	override async getChargeStatus(gatewayTxId: string): Promise<ChargeSettlementStatus> {
		const r = await this.fetchOrderOrCharge(gatewayTxId)
		return this.classifyStatus(r)
	}

	// The reconciliation sweep's refund poll (T3) — same GET/routing as getChargeStatus, read for
	// refund data instead of settlement. A single-charge GET (`ch_…`) is FLAT at the root (no
	// `charges[]`) — refundStatusFrom treats the root object itself as the charge in that case. An
	// order GET (`or_…`) sums `canceled_amount` across `charges[]`. v5 refund == cancellation of a
	// paid charge: `canceled_amount` (NOT `amount_refunded`, which doesn't exist) carries the total;
	// `last_transaction.id` is the canonical refund transaction id (detected by canceled_amount>0,
	// never by `last_transaction.transaction_type`, which is the payment-method family, not a
	// refund flag). Confirmed against the official pagarme-core-api SDK models (2026-07-15).
	override async getRefundStatus(gatewayTxId: string): Promise<RefundStatus> {
		const r = await this.fetchOrderOrCharge(gatewayTxId)
		return PagarMePaymentProvider.refundStatusFrom(r)
	}

	// The reconciliation sweep's chargeback poll (ChargebackReconcileJob) — same GET/routing as
	// getChargeStatus/getRefundStatus. Order-authoritative (same posture as classifyStatus/T5): the
	// ORDER's own status OR any of its charge rows reporting 'chargedback' counts — array position
	// never decides, a lagging/duplicate charge entry must not hide a chargedback one.
	override async getChargebackStatus(gatewayTxId: string): Promise<ChargebackStatus> {
		const r = await this.fetchOrderOrCharge(gatewayTxId)
		return PagarMePaymentProvider.chargebackStatusFrom(r)
	}

	private static chargebackStatusFrom(r: PagarMeOrderResponse): ChargebackStatus {
		// order GET → charges[]; single-charge GET → the root object IS the charge (same shape as
		// refundStatusFrom).
		const chargeRows = r.charges?.length ? r.charges : [r]
		const chargedBack = r.status === 'chargedback' || chargeRows.some(charge => charge.status === 'chargedback')
		return { chargedBack }
	}

	private static refundStatusFrom(r: PagarMeOrderResponse): RefundStatus {
		const refunds: { gatewayRef: string; amountCents: number }[] = []
		let refundedTotalCents = 0
		// order GET → charges[]; single-charge GET → the root object IS the charge.
		const chargeRows = r.charges?.length ? r.charges : [r]
		for (const charge of chargeRows) {
			const canceled = charge.canceled_amount ?? 0 // v5 refund == canceled_amount (no `amount_refunded`)
			refundedTotalCents += canceled
			const lt = charge.last_transaction
			// A refund is a cancellation of a paid charge — detected by canceled_amount, NEVER by
			// transaction_type (which is the payment-method family and is never 'refund').
			if (canceled > 0 && lt?.id != null) {
				refunds.push({ gatewayRef: lt.id, amountCents: lt.amount ?? canceled })
			}
		}
		return { refundedTotalCents, refunds }
	}

	// Order-authoritative + any-captured-wins. Array position never decides money: a charge marked
	// 'paid' anywhere in the array settles the order even if the order-level status or another
	// charge entry says otherwise (e.g. a lagging duplicate still shows 'pending').
	private classifyStatus(r: PagarMeOrderResponse): ChargeSettlementStatus {
		const chargeStatuses = (r.charges ?? []).map(c => c.status).filter((s): s is string => Boolean(s))
		if (PAID_ORDER_STATUSES.has(r.status ?? '') || chargeStatuses.some(s => PAID_ORDER_STATUSES.has(s))) return 'settled'
		if (FAILED_ORDER_STATUSES.has(r.status ?? '') || chargeStatuses.some(s => FAILED_ORDER_STATUSES.has(s))) return 'failed'
		if (PENDING_ORDER_STATUSES.has(r.status ?? '') || chargeStatuses.some(s => PENDING_ORDER_STATUSES.has(s))) return 'pending'
		this.loggingService.warn({
			content: {
				message: 'PagarMePaymentProvider.getChargeStatus: unmapped status — treating as pending',
				orderStatus: r.status,
				chargeStatuses,
			},
		})
		return 'pending'
	}
}
