import Z from 'zod'
import { z } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import { BillingWebhookSource } from '@billing/enums'

import { ExternalCardChargeSucceededEvent } from '@billing/events/ExternalCardChargeSucceededEvent'
import { ExternalPixPaidEvent } from '@billing/events/ExternalPixPaidEvent'
import { ExternalChargeFailedEvent } from '@billing/events/ExternalChargeFailedEvent'
import { ExternalChargeRefundedEvent } from '@billing/events/ExternalChargeRefundedEvent'
import { ExternalChargeDisputedEvent } from '@billing/events/ExternalChargeDisputedEvent'
import { ExternalCheckoutCompletedEvent } from '@billing/events/ExternalCheckoutCompletedEvent'
import { ExternalInvoicePaidEvent } from '@billing/events/ExternalInvoicePaidEvent'
import { ExternalInvoiceRefundedEvent } from '@billing/events/ExternalInvoiceRefundedEvent'
import type { PaymentInstrument } from '@billing/objects/PaymentInstrument'
import { CaptureOrigin } from '@billing/enums/CaptureOrigin'
import { InvoiceRepository } from '@billing/repositories'
import { BillingWebhookMapper, type ExternalBillingEvent } from '../BillingWebhookMapper'
import { AsaasWebhookSchema, type AsaasEventType, type AsaasPayment } from './AsaasWebhookSchema'
import { BillingPlatform, CheckoutIntent, PaymentMethodType } from '@template/contracts-typescript/wire/enums'

// The internal outcomes an Asaas webhook resolves to — a zod literal set so the dispatch table
// in map() stays a TOTAL Record<AsaasOutcome, …>, compiler-checked exhaustive (mirrors
// Stripe/Pagar.me's GatewayOutcomeSchema).
export const AsaasOutcomeSchema = z.enum([
	'CHECKOUT_COMPLETED',
	'CARD_SUCCEEDED',
	'PIX_PAID',
	'CHARGE_FAILED',
	'CHARGE_REFUNDED',
	'CHARGE_DISPUTED',
	// Invoice-level facts — an Asaas payment maps 1:1 to OUR invoice (externalReference), so a
	// payment-level fact with no charge attempt of ours behind it is an INVOICE fact, not a charge
	// outcome: an out-of-band collection (dunning/negativação recovery) settles the invoice, a
	// deleted/undone cobrança voids it.
	'INVOICE_PAID',
	'INVOICE_REFUNDED',
])
export type AsaasOutcome = Z.infer<typeof AsaasOutcomeSchema>

@injectable()
export class AsaasWebhookMapper extends BillingWebhookMapper {
	readonly source = BillingWebhookSource.ASAAS

	constructor(private invoiceRepository: InvoiceRepository) {
		super()
	}

	async map(request: Request): Promise<ExternalBillingEvent[]> {
		const parsed = AsaasWebhookSchema.safeParse(await request.json())
		if (!parsed.success) return []
		const { event, payment, checkout } = parsed.data

		// ownerId is ALWAYS resolved from the Invoice by engineInvoiceId (externalReference) — NEVER
		// trusted off the payload. `payment.externalReference` covers every payment-bearing event;
		// `checkout.externalReference` covers CHECKOUT_PAID deliveries that (per the researched shape)
		// might carry it only on the checkout sub-resource.
		const engineInvoiceId = payment?.externalReference ?? checkout?.externalReference
		if (!engineInvoiceId) return []

		const invoice = await this.invoiceRepository.findByEngineInvoiceId(engineInvoiceId)
		const ownerId = invoice?.ownerId.value
		if (!ownerId) return []

		const outcome = this.outcomeFor(event, payment)
		if (!outcome) return []

		// Every outcome we act on needs a concrete gateway reference — a payment id when present,
		// else (CHECKOUT_PAID delivered without an inlined `payment`) the checkout id.
		const gatewayTxId = payment?.id ?? checkout?.id
		if (!gatewayTxId) return []

		// ASAAS-DOC-UNCERTAIN: Asaas webhook envelopes are not documented to carry a dedicated event
		// id (unlike Stripe's evt_… / Pagar.me's hook_…) — the dedup key is synthesized from the
		// event type + gateway reference, stable across redeliveries of the SAME fact.
		const externalId = `${event}:${gatewayTxId}`

		const base = {
			externalId,
			ownerId,
			engineInvoiceId,
			amountCents: this.amountFor(outcome, payment),
			gatewayTxId,
		}

		const eventsByOutcome: Record<AsaasOutcome, () => ExternalBillingEvent[]> = {
			CHECKOUT_COMPLETED: () => {
				const instrument = this.instrumentFrom(payment)
				const sessionRef = checkout?.id ?? payment?.checkoutSession ?? gatewayTxId
				return [
					new ExternalCheckoutCompletedEvent({
						entityId: sessionRef,
						ownerId,
						payload: {
							externalId,
							ownerId,
							sessionRef,
							intent: CheckoutIntent.PAYMENT, // Asaas has no vault-only checkout — see AsaasPaymentProvider.createCheckoutSession
							platform: BillingPlatform.ASAAS,
							...(instrument ? { instrument } : {}),
							engineInvoiceId,
							amountCents: base.amountCents,
							gatewayTxId,
						},
					}),
				]
			},
			CARD_SUCCEEDED: () => [new ExternalCardChargeSucceededEvent({ entityId: engineInvoiceId, ownerId, payload: base })],
			PIX_PAID: () => [new ExternalPixPaidEvent({ entityId: engineInvoiceId, ownerId, payload: base })],
			CHARGE_FAILED: () => [new ExternalChargeFailedEvent({ entityId: engineInvoiceId, ownerId, payload: base })],
			CHARGE_REFUNDED: () => [new ExternalChargeRefundedEvent({ entityId: engineInvoiceId, ownerId, payload: base })],
			// A chargeback → a CHARGEBACK credit note (access revoked by derivation), NOT a REFUND.
			// Asaas' chargeback lifecycle has no documented "won" close event in the researched facts,
			// so — like Pagar.me — there is no dispute-won mapping here (only Stripe's closed(won) path).
			CHARGE_DISPUTED: () => [new ExternalChargeDisputedEvent({ entityId: engineInvoiceId, ownerId, payload: base })],
			// PAYMENT_DUNNING_RECEIVED — the cobrança was recovered OUT-OF-BAND (Asaas'
			// dunning/negativação product), so there is no gateway charge attempt of ours to settle:
			// the invoice-level settle. ExternalInvoicePaidHandler synthesizes the charge ref from the
			// event id (`engine:<externalId>`).
			INVOICE_PAID: () => [
				new ExternalInvoicePaidEvent({
					entityId: engineInvoiceId,
					ownerId,
					payload: { externalId, ownerId, engineInvoiceId, amountCents: base.amountCents },
				}),
			],
			// PAYMENT_DELETED (cobrança voided at the gateway) / PAYMENT_RECEIVED_IN_CASH_UNDONE (an
			// out-of-band receipt reversed) — the invoice-level refund/void fact.
			// ExternalInvoiceRefundedHandler books the full-amount REFUND credit note (the event
			// carries no partial amount by design).
			INVOICE_REFUNDED: () => [
				new ExternalInvoiceRefundedEvent({ entityId: engineInvoiceId, ownerId, payload: { externalId, ownerId, engineInvoiceId } }),
			],
		}

		return eventsByOutcome[outcome]()
	}

	// CHECKOUT_PAID always settles+vaults via the checkout path. PAYMENT_CONFIRMED/RECEIVED route
	// there too when the payment carries `checkoutSession` (it originated from a hosted checkout) —
	// otherwise they're a plain MIT/CIT settle (CARD_SUCCEEDED) or a one-off Pix (PIX_PAID), decided
	// by billingType. PAYMENT_OVERDUE (a payment whose due date lapsed unpaid) is the closest "this
	// charge did not happen" signal Asaas exposes — card declines happen synchronously on
	// POST /payments (never as a webhook), so there is no direct card-decline event to map.
	private outcomeFor(event: AsaasEventType, payment: AsaasPayment | null | undefined): AsaasOutcome | undefined {
		const isCheckoutOrigin = Boolean(payment?.checkoutSession)
		const outcomeByEvent: Partial<Record<AsaasEventType, () => AsaasOutcome | undefined>> = {
			CHECKOUT_PAID: () => 'CHECKOUT_COMPLETED',
			PAYMENT_CONFIRMED: () => (isCheckoutOrigin ? 'CHECKOUT_COMPLETED' : 'CARD_SUCCEEDED'),
			PAYMENT_RECEIVED: () => {
				if (isCheckoutOrigin) return 'CHECKOUT_COMPLETED'
				return payment?.billingType === 'PIX' ? 'PIX_PAID' : 'CARD_SUCCEEDED'
			},
			PAYMENT_OVERDUE: () => 'CHARGE_FAILED',
			PAYMENT_REFUNDED: () => 'CHARGE_REFUNDED',
			PAYMENT_CHARGEBACK_REQUESTED: () => 'CHARGE_DISPUTED',
			// Invoice-level facts (see AsaasOutcomeSchema): an out-of-band dunning recovery settles the
			// invoice; a deleted cobrança or an undone cash receipt voids/reverses it.
			PAYMENT_DUNNING_RECEIVED: () => 'INVOICE_PAID',
			PAYMENT_DELETED: () => 'INVOICE_REFUNDED',
			PAYMENT_RECEIVED_IN_CASH_UNDONE: () => 'INVOICE_REFUNDED',
		}
		return outcomeByEvent[event]?.()
	}

	// Asaas reports `value` in REAIS (decimal) — never cents. PAYMENT_REFUNDED prefers the latest
	// refund entry's own value (a partial refund's actual amount) over the payment's full value;
	// absent a `refunds[]` entry (full refund, or the array wasn't included on this delivery) it
	// falls back to the payment's value.
	private amountFor(outcome: AsaasOutcome, payment: AsaasPayment | null | undefined): number {
		if (outcome === 'CHARGE_REFUNDED') {
			const refunds = payment?.refunds ?? []
			const latest = refunds[refunds.length - 1]
			return this.toCents(latest?.value ?? payment?.value ?? 0)
		}
		return this.toCents(payment?.value ?? 0)
	}

	private toCents(reais: number): number {
		return Math.round(reais * 100)
	}

	// Populate the PaymentInstrument for a checkout-completed settle only when both halves of the
	// composite pmRef are present. pmRef packs `${asaasCustomerId}:${creditCardToken}` — Asaas'
	// MIT/CIT endpoint (POST /payments) requires the OWNING customer id alongside the token, and
	// ChargeOffSessionParams carries no ownerId to re-derive it from (see AsaasPaymentProvider's
	// top-of-class comment) — the mapper is the one place that has BOTH the customer id (payment.customer)
	// and the token (payment.creditCard.creditCardToken) at vault time, so it packs them here.
	// Asaas' webhook creditCard block carries no expiry — expMonth/expYear are display-only
	// placeholders, never used to authorize a charge (the vaulted creditCardToken is).
	private instrumentFrom(payment: AsaasPayment | null | undefined): PaymentInstrument | undefined {
		const token = payment?.creditCard?.creditCardToken
		const customerId = payment?.customer
		if (!token || !customerId) return undefined

		return {
			type: PaymentMethodType.CARD,
			pmRef: `${customerId}:${token}`,
			supportsOffSession: true,
			captureOrigin: CaptureOrigin.CHECKOUT_PAYMENT,
			originGatewayTxId: payment?.id,
			brand: payment?.creditCard?.creditCardBrand ?? 'unknown',
			last4: payment?.creditCard?.creditCardNumber?.slice(-4) ?? '0000',
			expMonth: 1,
			expYear: new Date().getFullYear(),
		}
	}
}
