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
import type { PaymentInstrument } from '@billing/objects/PaymentInstrument'
import { CaptureOrigin } from '@billing/enums/CaptureOrigin'
import { InvoiceRepository } from '@billing/repositories'
import { BillingWebhookMapper, type ExternalBillingEvent } from '../BillingWebhookMapper'
import { PagarMeWebhookSchema, type PagarMeCharge, type PagarMeEventType, type PagarMeOrder } from './PagarMeWebhookSchema'
import { BillingPlatform, CheckoutIntent, PaymentMethodType } from '@template/contracts-typescript/wire/enums'

// The internal outcomes a Pagar.me webhook resolves to. Modeled as a zod literal set (not a
// bare union) so the dispatch table in map() can be a TOTAL Record<GatewayOutcome, …> — every
// outcome must be handled, checked by the compiler.
export const GatewayOutcomeSchema = z.enum(['CARD_SUCCEEDED', 'PIX_PAID', 'CHARGE_FAILED', 'CHARGE_REFUNDED', 'CHARGE_DISPUTED'])
export type GatewayOutcome = Z.infer<typeof GatewayOutcomeSchema>

@injectable()
export class PagarMeWebhookMapper extends BillingWebhookMapper {
	readonly source = BillingWebhookSource.PAGARME

	constructor(private invoiceRepository: InvoiceRepository) {
		super()
	}

	async map(request: Request): Promise<ExternalBillingEvent[]> {
		const parsed = PagarMeWebhookSchema.safeParse(await request.json())
		if (!parsed.success) return []
		const { type, data } = parsed.data

		// order.* carries the order (+ its charges[]); charge.* carries the charge directly.
		const charge: PagarMeCharge | undefined = 'charges' in data ? data.charges[0] : data
		if (!charge) return []
		const order: PagarMeOrder | undefined = 'charges' in data ? data : undefined

		// A card paid through the hosted checkout (Payment Link — PagarMePaymentProvider.createCheckoutSession)
		// arrives as order.paid with the charge's payment_method:'checkout' — wallet v5 vaults it
		// automatically, so this is the vault+settle fact (ExternalCheckoutCompletedEvent), distinct
		// from a direct MIT/CIT card charge (chargeOffSession/chargeStoredOnSession), whose charges
		// carry payment_method:'credit_card'/'debit_card' and keep resolving to CARD_SUCCEEDED below.
		if (type === 'order.paid' && order && charge.payment_method === 'checkout') {
			// NEVER fall through to the generic dispatch: a checkout charge's payment_method is
			// literally 'checkout', so outcomeFor's paid() would mislabel a Pix-paid checkout as
			// CARD_SUCCEEDED. checkoutCompletedEvent handles the no-card case (settle without
			// instrument); undefined only means ownerId was unresolvable → no-op.
			const checkoutEvent = await this.checkoutCompletedEvent(parsed.data.id, order, charge)
			return checkoutEvent ? [checkoutEvent] : []
		}

		const outcome = this.outcomeFor(type, charge)
		if (!outcome) return []

		// The charge's `code` now carries the engine invoice id directly (set as `code` when
		// the charge is created against that invoice) — no more `sub_<ownerId>:<suffix>` parsing.
		const engineInvoiceId = charge.code
		if (!engineInvoiceId) return []

		// ownerId is resolved from the Invoice (the engine invoice id is the invoice's key),
		// not parsed off the code — the invoice is the single source of truth for invoice ownership.
		const invoice = await this.invoiceRepository.findByEngineInvoiceId(engineInvoiceId)
		const ownerId = invoice?.ownerId.value
		if (!ownerId) return []

		// KNOWN LIMITATION (PAGARME-DOC-UNCERTAIN): amountCents is the charge's full paid/total
		// amount for EVERY outcome — Pagar.me's charge.refunded/chargedback payloads aren't
		// documented to carry the partial refund/dispute amount, so a gateway-initiated PARTIAL
		// refund would overstate the credit note. Our own refunds are exact regardless: RefundInvoice
		// records the credit note with the requested amount on the sync path, and the webhook-side
		// handler dedupes per event id, so this only misreports refunds initiated on the gateway
		// dashboard for a partial amount.
		const base = {
			externalId: parsed.data.id, // dedup on the webhook event id (hook_…)
			ownerId,
			engineInvoiceId,
			amountCents: charge.paid_amount ?? charge.amount ?? 0,
			gatewayTxId: charge.id,
		}

		const eventsByOutcome: Record<GatewayOutcome, () => ExternalBillingEvent[]> = {
			CARD_SUCCEEDED: () => {
				const instrument = this.instrumentFrom(charge)
				return [
					new ExternalCardChargeSucceededEvent({
						entityId: engineInvoiceId,
						ownerId,
						payload: { ...base, ...(instrument !== undefined ? { instrument } : {}) },
					}),
				]
			},
			PIX_PAID: () => [new ExternalPixPaidEvent({ entityId: engineInvoiceId, ownerId, payload: base })],
			CHARGE_FAILED: () => [new ExternalChargeFailedEvent({ entityId: engineInvoiceId, ownerId, payload: base })],
			CHARGE_REFUNDED: () => [
				new ExternalChargeRefundedEvent({
					entityId: engineInvoiceId,
					ownerId,
					payload: {
						...base,
						// PAGARME-DOC-UNCERTAIN: the reference doesn't name a dedicated "refund id" field —
						// `last_transaction` reflects the operation that produced THIS webhook, so for
						// charge.refunded its `id` is the closest canonical refund identifier the v5 payload
						// exposes. Absent (undocumented shape) → the handler falls back to the webhook event
						// id, same as before this change.
						...(charge.last_transaction?.id ? { gatewayRefundId: charge.last_transaction.id } : {}),
					},
				}),
			],
			// A Pagar.me chargeback (charge.chargedback) → a CHARGEBACK credit note (access revoked by
			// derivation), NOT a REFUND. Pagar.me webhooks have no dispute-WON event, so there is no
			// dispute-won mapping here (only Stripe's charge.dispute.closed(won) reverses the CN).
			CHARGE_DISPUTED: () => [new ExternalChargeDisputedEvent({ entityId: engineInvoiceId, ownerId, payload: base })],
		}

		return eventsByOutcome[outcome]()
	}

	// order.paid from a hosted checkout (Payment Link) → the settle fact, with vault when the
	// charge carries a card (instrument present) and WITHOUT instrument when it doesn't (Pix paid
	// inside the hosted page — the optional-vault settle path activates without vaulting).
	// Returns undefined only when ownerId can't be resolved — the caller no-ops then.
	private async checkoutCompletedEvent(
		eventId: string,
		order: PagarMeOrder,
		charge: PagarMeCharge,
	): Promise<ExternalCheckoutCompletedEvent | undefined> {
		const card = charge.last_transaction?.card

		// PAGARME-DOC-UNCERTAIN: sessionRef ideally correlates to the Payment Link id (`pl_…`
		// returned by createCheckoutSession) — the reference doesn't document whether the resulting
		// order echoes it back. Prefer it when present (PagarMeCheckoutRefSchema), else fall back to
		// the order id, prefixed so it can never collide with a real `pl_…` on the
		// CHECKOUT_VAULT idempotency key.
		const sessionRef = order.checkout?.id ?? `order:${order.id}`

		// engineInvoiceId: PRIMARILY resolved via the order's own `code` — kept for parity with the
		// direct-charge path even though createCheckoutSession never sets it today (Payment Links
		// carry no order-level `code` in the frozen contract), so this rarely resolves. When the
		// code isn't ours (absent, or resolves to no invoice), leave engineInvoiceId undefined: the
		// DIRECT charge.paid webhook Pagar.me fires for this SAME underlying charge (payment_method
		// 'credit_card'/'debit_card') still settles the invoice through the existing path below, so
		// the "raw settle" always covers it.
		let engineInvoiceId: string | undefined
		let ownerId: string | undefined
		if (order.code) {
			const invoice = await this.invoiceRepository.findByEngineInvoiceId(order.code)
			if (invoice) {
				engineInvoiceId = order.code
				ownerId = invoice.ownerId.value
			}
		}
		// PAGARME-DOC-UNCERTAIN: without an invoice-resolved ownerId, fall back to the gateway
		// customer's `code` — a value WE control end-to-end (ensureCustomer + createCheckoutSession's
		// customer_settings both key the customer by `code: ownerId`), assuming the webhook echoes
		// it back on the order/charge customer object (PagarMeCustomerSchema.code).
		ownerId ??= order.customer?.code ?? charge.customer?.code ?? undefined
		if (!ownerId) return undefined

		const instrument: PaymentInstrument | undefined = card
			? {
					type: PaymentMethodType.CARD,
					pmRef: card.id ?? charge.id,
					supportsOffSession: true,
					captureOrigin: CaptureOrigin.CHECKOUT_PAYMENT,
					originGatewayTxId: charge.id,
					brand: card.brand ?? 'unknown',
					last4: card.last_four_digits ?? '0000',
					expMonth: card.exp_month ?? 1,
					expYear: card.exp_year ?? new Date().getFullYear(),
				}
			: undefined

		return new ExternalCheckoutCompletedEvent({
			entityId: sessionRef,
			ownerId,
			payload: {
				externalId: eventId,
				ownerId,
				sessionRef,
				intent: CheckoutIntent.PAYMENT,
				platform: BillingPlatform.PAGARME,
				...(instrument ? { instrument } : {}),
				...(engineInvoiceId ? { engineInvoiceId, amountCents: charge.paid_amount ?? charge.amount ?? 0, gatewayTxId: charge.id } : {}),
			},
		})
	}

	// Populate the PaymentInstrument for a card-paid CARD_SUCCEEDED outcome only. The handler
	// guards on instrument?.supportsOffSession to skip non-vaultable payments.
	private instrumentFrom(charge: PagarMeCharge): PaymentInstrument | undefined {
		const pm = charge.payment_method
		if (pm !== 'credit_card' && pm !== 'debit_card') return undefined
		const card = charge.last_transaction?.card
		if (!card) return undefined

		return {
			type: PaymentMethodType.CARD,
			pmRef: card.id ?? charge.id,
			supportsOffSession: true,
			brand: card.brand ?? 'unknown',
			last4: card.last_four_digits ?? '0000',
			expMonth: card.exp_month ?? 1,
			expYear: card.exp_year ?? new Date().getFullYear(),
		}
	}

	// Pagar.me has no dedicated pix-paid event: a paid Pix arrives as charge.paid / order.paid
	// with the charge's payment_method === 'pix'. Detect it off the charge to choose PIX_PAID
	// vs CARD_SUCCEEDED (the former settles a one-off Pix; the latter also vaults the card mandate).
	private outcomeFor(type: PagarMeEventType, charge: PagarMeCharge): GatewayOutcome | undefined {
		// A paid charge/order is PIX_PAID when the instrument was Pix, else a vaultable card.
		const paid = (): GatewayOutcome => (charge.payment_method === 'pix' ? 'PIX_PAID' : 'CARD_SUCCEEDED')
		// Only a handful of the ~50 v5 event types resolve to an outcome — Partial over the full
		// PagarMeEventType so the table stays keyed off the same literal set the schema validates.
		const outcomeByType: Partial<Record<PagarMeEventType, () => GatewayOutcome>> = {
			'charge.paid': paid,
			'order.paid': paid,
			'charge.payment_failed': () => 'CHARGE_FAILED',
			'order.payment_failed': () => 'CHARGE_FAILED',
			'charge.refunded': () => 'CHARGE_REFUNDED',
			// A bank-initiated reversal → a CHARGEBACK credit note (distinct from a merchant refund).
			'charge.chargedback': () => 'CHARGE_DISPUTED',
		}
		return outcomeByType[type]?.()
	}
}
