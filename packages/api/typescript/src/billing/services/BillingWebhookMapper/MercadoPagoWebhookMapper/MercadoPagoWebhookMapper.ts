import Z from 'zod'
import { z } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import { ProductConfig } from '@shared/config'
import { BaseError } from '@template/core-typescript'
import { BillingWebhookSource } from '@billing/enums'

import type { InterfaceErrors } from '@billing/errors'
import { ExternalCheckoutCompletedEvent } from '@billing/events/ExternalCheckoutCompletedEvent'
import { ExternalPixPaidEvent } from '@billing/events/ExternalPixPaidEvent'
import { ExternalChargeFailedEvent } from '@billing/events/ExternalChargeFailedEvent'
import { ExternalChargeRefundedEvent } from '@billing/events/ExternalChargeRefundedEvent'
import { ExternalChargeDisputedEvent } from '@billing/events/ExternalChargeDisputedEvent'
import { InvoiceRepository, CreditNoteRepository } from '@billing/repositories'
import { BillingWebhookMapper, type ExternalBillingEvent } from '../BillingWebhookMapper'
import { MercadoPagoWebhookSchema } from './MercadoPagoWebhookSchema'
import { BillingPlatform, CheckoutIntent } from '@template/contracts-typescript/wire/enums'

// GET /v1/payments/{id} response — only the fields the mapper reads. Re-fetched because the
// webhook payload itself carries just `data.id` (the documented "thin" MercadoPago envelope).
const MercadoPagoPaymentResponseSchema = z.object({
	id: z.union([z.number(), z.string()]),
	status: z.string().nullish(),
	status_detail: z.string().nullish(),
	external_reference: z.string().nullish(),
	transaction_amount: z.number().nullish(),
	transaction_amount_refunded: z.number().nullish(),
	payment_method_id: z.string().nullish(),
	payment_type_id: z.string().nullish(),
})
type MercadoPagoPaymentResponse = Z.infer<typeof MercadoPagoPaymentResponseSchema>

// The internal outcomes a MercadoPago payment resolves to. A zod literal set (not a bare union)
// so the dispatch table in map() stays a TOTAL Record<GatewayOutcome, …>, compiler-checked
// exhaustive (same posture as Stripe/PagarMe's GatewayOutcome).
export const GatewayOutcomeSchema = z.enum(['CHECKOUT_COMPLETED', 'PIX_PAID', 'CHARGE_FAILED', 'CHARGE_REFUNDED', 'CHARGE_DISPUTED'])
export type GatewayOutcome = Z.infer<typeof GatewayOutcomeSchema>

@injectable()
export class MercadoPagoWebhookMapper extends BillingWebhookMapper {
	readonly source = BillingWebhookSource.MERCADOPAGO

	constructor(
		private invoiceRepository: InvoiceRepository,
		private creditNoteRepository: CreditNoteRepository,
	) {
		super()
	}

	private readonly baseUrl = 'https://api.mercadopago.com'

	// Re-fetch the payment resource the thin webhook points at. `protected` (not private) so unit
	// tests can override it and stub the HTTP surface — the same seam StripeWebhookMapper exposes
	// via its overridable `stripe()` accessor.
	protected async fetchPayment(id: string, apiKey?: string): Promise<MercadoPagoPaymentResponse> {
		const res = await fetch(`${this.baseUrl}/v1/payments/${id}`, {
			headers: { authorization: `Bearer ${apiKey ?? ProductConfig.env.MERCADOPAGO_ACCESS_TOKEN}` },
		})
		if (!res.ok) {
			const detail = await res.text().catch(() => '')
			throw new BaseError<InterfaceErrors>('PROVIDER_ERROR', detail || `MercadoPago responded ${res.status}`)
		}
		// Runtime-validated (the sibling webhook body already is) — the money-bearing fields
		// (status, amounts, external_reference) must never be trusted off an unchecked cast.
		return MercadoPagoPaymentResponseSchema.parse(await res.json())
	}

	async map(request: Request): Promise<ExternalBillingEvent[]> {
		const parsed = MercadoPagoWebhookSchema.safeParse(await request.json())
		if (!parsed.success) return []
		const { id: webhookId, type, data } = parsed.data

		// Only the 'payment' topic resolves to an outcome — merchant_order / other topics no-op.
		if (type !== 'payment') return []

		const payment = await this.fetchPayment(String(data.id))
		const outcome = this.outcomeFor(payment)
		if (!outcome) return []

		// engineInvoiceId is the invoice's key — stamped by us as `external_reference` on both
		// createCheckoutSession (Checkout Pro preference) and createPix.
		const engineInvoiceId = payment.external_reference ?? undefined
		if (!engineInvoiceId) return []

		// ownerId is resolved from the Invoice (keyed by the engine invoice id), NEVER trusted off
		// the gateway payload — the invoice is the single source of truth for invoice ownership.
		const invoice = await this.invoiceRepository.findByEngineInvoiceId(engineInvoiceId)
		const ownerId = invoice?.ownerId.value
		if (!ownerId) return []

		const gatewayTxId = String(payment.id)
		// Dedup on the notification id when present; a thin/replayed delivery without one still
		// dedupes deterministically on the payment id + its resolved status.
		const externalId =
			webhookId !== null && webhookId !== undefined ? `mp:${webhookId}` : `mp:${gatewayTxId}:${payment.status ?? 'unknown'}`
		const amountCents = this.amountCents(payment.transaction_amount) ?? 0

		const eventsByOutcome: Record<GatewayOutcome, () => Promise<ExternalBillingEvent[]>> = {
			CHECKOUT_COMPLETED: async () => [
				new ExternalCheckoutCompletedEvent({
					entityId: gatewayTxId,
					ownerId,
					payload: {
						externalId,
						ownerId,
						sessionRef: gatewayTxId,
						intent: CheckoutIntent.PAYMENT,
						platform: BillingPlatform.MERCADOPAGO,
						// No instrument — MercadoPago is CHECKOUT-ONLY (capabilities.cardVaulting: false).
						// The handler settles the invoice without vaulting a card; renewals degrade to the
						// existing manual-pay flow (NO_PAYMENT_METHOD → dunning).
						engineInvoiceId,
						amountCents,
						gatewayTxId,
					},
				}),
			],
			PIX_PAID: async () => [
				new ExternalPixPaidEvent({
					entityId: engineInvoiceId,
					ownerId,
					payload: { externalId, ownerId, engineInvoiceId, amountCents, gatewayTxId },
				}),
			],
			CHARGE_FAILED: async () => [
				new ExternalChargeFailedEvent({
					entityId: engineInvoiceId,
					ownerId,
					payload: { externalId, ownerId, engineInvoiceId, amountCents, gatewayTxId },
				}),
			],
			// MercadoPago's `transaction_amount_refunded` is CUMULATIVE (total refunded to date on the
			// payment), while our ExternalChargeRefundedEvent carries the amount of THIS refund — so the
			// mapper emits the DELTA vs credit notes already recorded (same posture as StripeWebhookMapper).
			CHARGE_REFUNDED: async () => {
				const cumulativeCents = this.amountCents(payment.transaction_amount_refunded ?? payment.transaction_amount) ?? 0
				const alreadyCredited = await this.creditNoteRepository.sumByInvoiceId(engineInvoiceId)
				const deltaCents = Math.max(0, cumulativeCents - alreadyCredited)
				return [
					new ExternalChargeRefundedEvent({
						entityId: engineInvoiceId,
						ownerId,
						payload: { externalId, ownerId, engineInvoiceId, amountCents: deltaCents, gatewayTxId },
					}),
				]
			},
			// A bank-initiated reversal (status 'charged_back') → a CHARGEBACK credit note (access
			// revoked by derivation via ExternalChargeDisputedHandler), NOT a merchant REFUND — mirrors
			// PagarMe's charge.chargedback and Asaas's PAYMENT_CHARGEBACK_REQUESTED. MercadoPago's docs
			// don't expose a dedicated "disputed amount" field for a chargeback (unlike the cumulative
			// transaction_amount_refunded used for genuine refunds above), so the disputed amount is the
			// payment's own transaction_amount — same posture as CHECKOUT_COMPLETED/PIX_PAID/CHARGE_FAILED.
			CHARGE_DISPUTED: async () => [
				new ExternalChargeDisputedEvent({
					entityId: engineInvoiceId,
					ownerId,
					payload: { externalId, ownerId, engineInvoiceId, amountCents, gatewayTxId },
				}),
			],
		}

		return eventsByOutcome[outcome]()
	}

	private amountCents(reais: number | null | undefined): number | undefined {
		if (reais === null || reais === undefined) return undefined
		return Math.round(reais * 100)
	}

	// `payment_method_id` is the specific instrument ('pix', 'master', 'visa', …); `payment_type_id`
	// is the coarser rail — MercadoPago classifies Pix under 'bank_transfer'. Check both.
	private isPix(payment: MercadoPagoPaymentResponse): boolean {
		return payment.payment_method_id === 'pix' || payment.payment_type_id === 'bank_transfer'
	}

	// An approved payment is PIX_PAID when the instrument was Pix, else a checkout-completed card
	// (MercadoPago is CHECKOUT-ONLY — every card payment originates from the hosted preference).
	// rejected → a synchronous decline; refunded → a merchant refund; charged_back → a bank-initiated
	// dispute (CHARGE_DISPUTED, NOT CHARGE_REFUNDED — see the eventsByOutcome comment). Every other
	// status (pending, in_process, authorized, cancelled, in_mediation) resolves to no outcome.
	private outcomeFor(payment: MercadoPagoPaymentResponse): GatewayOutcome | undefined {
		switch (payment.status) {
			case 'approved':
				return this.isPix(payment) ? 'PIX_PAID' : 'CHECKOUT_COMPLETED'
			case 'rejected':
				return 'CHARGE_FAILED'
			case 'refunded':
				return 'CHARGE_REFUNDED'
			case 'charged_back':
				return 'CHARGE_DISPUTED'
			default:
				return undefined
		}
	}
}
