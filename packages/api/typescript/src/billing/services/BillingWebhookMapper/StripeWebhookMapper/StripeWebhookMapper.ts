import Stripe from 'stripe'
import Z from 'zod'
import { z } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import { ProductConfig } from '@shared/config'
import { BillingWebhookSource } from '@billing/enums'

import { ExternalCardChargeSucceededEvent } from '@billing/events/ExternalCardChargeSucceededEvent'
import { ExternalPixPaidEvent } from '@billing/events/ExternalPixPaidEvent'
import { ExternalChargeFailedEvent } from '@billing/events/ExternalChargeFailedEvent'
import { ExternalChargeRefundedEvent } from '@billing/events/ExternalChargeRefundedEvent'
import { ExternalChargeDisputedEvent } from '@billing/events/ExternalChargeDisputedEvent'
import { ExternalChargeDisputeWonEvent } from '@billing/events/ExternalChargeDisputeWonEvent'
import { ExternalChargeDisputeLostEvent } from '@billing/events/ExternalChargeDisputeLostEvent'
import { ExternalCheckoutCompletedEvent } from '@billing/events/ExternalCheckoutCompletedEvent'
import { ExternalInvoicePaidEvent } from '@billing/events/ExternalInvoicePaidEvent'
import { ExternalInvoicePaymentFailedEvent } from '@billing/events/ExternalInvoicePaymentFailedEvent'
import { ExternalInvoiceRefundedEvent } from '@billing/events/ExternalInvoiceRefundedEvent'
import { ExternalSubscriptionActivatedEvent } from '@billing/events/ExternalSubscriptionActivatedEvent'
import { ExternalSubscriptionCanceledEvent } from '@billing/events/ExternalSubscriptionCanceledEvent'
import type { PaymentInstrument } from '@billing/objects/PaymentInstrument'
import { CaptureOrigin } from '@billing/enums/CaptureOrigin'
import { InvoiceRepository, CreditNoteRepository, SubscriptionRepository } from '@billing/repositories'
import { BillingWebhookMapper, type ExternalBillingEvent } from '../BillingWebhookMapper'
import { StripeWebhookSchema, type StripeEventObject, type StripeEventType } from './StripeWebhookSchema'
import { BillingPlatform, CheckoutIntent, PaymentMethodType } from '@template/contracts-typescript/wire/enums'

// The slice of Stripe's expanded PaymentMethod the checkout vault needs — a CARD pm with an id.
// `.loose()` keeps unknown Stripe fields from failing the parse; a string ref (not expanded) or
// a non-card pm simply doesn't validate.
const ExpandedStripePmSchema = z
	.object({
		id: z.string().min(1),
		card: z
			.object({
				brand: z.string().optional(),
				last4: z.string().optional(),
				exp_month: z.number().optional(),
				exp_year: z.number().optional(),
			})
			.loose(),
	})
	.loose()

// The internal outcomes a Stripe webhook resolves to — a zod literal set so the dispatch table in
// map() stays a TOTAL Record<GatewayOutcome, …>, compiler-checked exhaustive (like PagarMe's).
export const GatewayOutcomeSchema = z.enum([
	'CARD_SUCCEEDED',
	'PIX_PAID',
	'CHARGE_FAILED',
	'CHARGE_REFUNDED',
	'CHARGE_DISPUTED',
	'DISPUTE_WON',
	'DISPUTE_LOST',
])
export type GatewayOutcome = Z.infer<typeof GatewayOutcomeSchema>

@injectable()
export class StripeWebhookMapper extends BillingWebhookMapper {
	readonly source = BillingWebhookSource.STRIPE

	constructor(
		private invoiceRepository: InvoiceRepository,
		private creditNoteRepository: CreditNoteRepository,
		private subscriptionRepository: SubscriptionRepository,
	) {
		super()
	}

	private client: Stripe | undefined

	/**
	 * Lazily construct the SDK (see StripePaymentProvider / StripeWebhookVerifier) — only the
	 * charge.refunded / charge.dispute.* paths retrieve a PaymentIntent through it. Overridable
	 * for tests, which stub `paymentIntents.retrieve`.
	 */
	protected stripe(): Stripe {
		if (!this.client) this.client = new Stripe(ProductConfig.env.STRIPE_API_KEY)
		return this.client
	}

	async map(request: Request): Promise<ExternalBillingEvent[]> {
		const parsed = StripeWebhookSchema.safeParse(await request.json())
		if (!parsed.success) return []
		const { id: eventId, type, data } = parsed.data
		const object = data.object

		// Checkout completion is its own flow (vault + settle), not a GatewayOutcome.
		if (type === 'checkout.session.completed') return this.checkoutCompletedEvents(eventId, object)

		// Stripe Billing families are their own flows too (invoice-level / subscription-level facts,
		// not charge outcomes) — same early-branch shape as checkout above.
		if (type === 'invoice.paid' || type === 'invoice.payment_failed' || type === 'invoice.voided') {
			return this.billingInvoiceEvents(eventId, type, object)
		}
		if (type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
			return this.subscriptionLifecycleEvents(eventId, type, object)
		}

		const outcome = this.outcomeFor(type, object)
		if (!outcome) return []

		// engineInvoiceId is the invoice's key. PI events carry it on their own metadata (createPix +
		// the off-session charge stamp it there); a Charge/Dispute carries none of our metadata, so it
		// is retrieved off the parent PaymentIntent. Absent → silent no-op (never crash).
		const engineInvoiceId = await this.resolveEngineInvoiceId(type, object)
		if (!engineInvoiceId) return []

		// ownerId is resolved from the Invoice (keyed by the engine invoice id), NOT trusted off
		// the gateway payload — the invoice is the single source of truth for invoice ownership. A miss
		// (no record) means we cannot attribute the event: no-op exactly like the Pagar.me mapper.
		const invoice = await this.invoiceRepository.findByEngineInvoiceId(engineInvoiceId)
		const ownerId = invoice?.ownerId.value
		if (!ownerId) return []

		const base = {
			externalId: eventId, // dedup on the Stripe event id (evt_…)
			ownerId,
			engineInvoiceId,
			amountCents: await this.amountFor(outcome, object, engineInvoiceId),
			gatewayTxId: object.id,
		}

		const eventsByOutcome: Record<GatewayOutcome, () => ExternalBillingEvent[]> = {
			CARD_SUCCEEDED: () => {
				const instrument = this.instrumentFrom(object)
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
						// Stripe orders `refunds.data` newest-first, so `[0].id` (re_…) is the canonical
						// refund id this webhook fired for — the credit-note dedup key shared with
						// reconciliation. Absent (unexpanded/older payload shape) → handler falls back to
						// the webhook event id, same as before this change.
						...(object.refunds?.data?.[0]?.id ? { gatewayRefundId: object.refunds.data[0].id } : {}),
					},
				}),
			],
			// A chargeback → a CHARGEBACK credit note (access revoked by derivation), NOT a REFUND.
			// `object` on charge.dispute.* IS the Stripe Dispute — its own id (`dp_…`) is the real
			// gateway-native dispute ref, distinct from PagarMe/MercadoPago/Asaas which have none.
			CHARGE_DISPUTED: () => [
				new ExternalChargeDisputedEvent({ entityId: engineInvoiceId, ownerId, payload: { ...base, gatewayDisputeRef: object.id } }),
			],
			// Dispute closed in our favor → reverse the chargeback CN (access restored by derivation).
			// `gatewayDisputeRef` locates the EXACT credit note this won closed (multi-dispute invoices).
			DISPUTE_WON: () => [
				new ExternalChargeDisputeWonEvent({ entityId: engineInvoiceId, ownerId, payload: { ...base, gatewayDisputeRef: object.id } }),
			],
			// Dispute closed in the cardholder's favor → the chargeback CN stays put (no money effect);
			// only the Dispute PROCESS record closes as LOST.
			DISPUTE_LOST: () => [
				new ExternalChargeDisputeLostEvent({ entityId: engineInvoiceId, ownerId, payload: { ...base, gatewayDisputeRef: object.id } }),
			],
		}

		return eventsByOutcome[outcome]()
	}

	// Resolve the engine invoice id per event. For a succeeded/failed PaymentIntent it rides the
	// object's own metadata. For charge.refunded / charge.dispute.created the object is a Charge /
	// Dispute that carries none of our keys — read `payment_intent` (the parent PI id) off it and
	// retrieve the PI to recover engineInvoiceId from ITS metadata.
	private async resolveEngineInvoiceId(type: StripeEventType, object: StripeEventObject): Promise<string | undefined> {
		if (type === 'charge.refunded' || type === 'charge.dispute.created' || type === 'charge.dispute.closed') {
			const piId = typeof object.payment_intent === 'string' ? object.payment_intent : object.payment_intent?.id
			if (!piId) return undefined
			const pi = await this.stripe().paymentIntents.retrieve(piId)
			return pi.metadata?.engineInvoiceId
		}
		return object.metadata?.engineInvoiceId
	}

	// The amount reported per outcome. Stripe's `amount_refunded` is CUMULATIVE (total refunded to
	// date on the charge), while our ExternalChargeRefundedEvent carries the amount of THIS refund —
	// so the mapper emits the DELTA vs credit notes already recorded (a second partial refund books
	// exactly its own amount, never the running total). A dispute (created/won/lost) reports the
	// Dispute object's `amount` (the disputed amount). Everything else reports the received amount.
	private async amountFor(outcome: GatewayOutcome, object: StripeEventObject, engineInvoiceId: string): Promise<number> {
		if (outcome === 'CHARGE_REFUNDED') {
			const cumulative = object.amount_refunded ?? object.amount ?? 0
			const alreadyCredited = await this.creditNoteRepository.sumByInvoiceId(engineInvoiceId)
			return Math.max(0, cumulative - alreadyCredited)
		}
		if (outcome === 'CHARGE_DISPUTED' || outcome === 'DISPUTE_WON' || outcome === 'DISPUTE_LOST') return object.amount ?? 0
		return object.amount_received ?? object.amount ?? 0
	}

	// A succeeded PaymentIntent settles a one-off Pix (PIX_PAID) when its instrument was Pix, else a
	// vaultable card (CARD_SUCCEEDED); a failure/refund map to their single outcome; a dispute created
	// → CHARGE_DISPUTED (a chargeback), a dispute closed → DISPUTE_WON when `won`, DISPUTE_LOST when
	// `lost` (previously skipped as "no new fact" — the Dispute entity now gives the lost outcome a
	// consumer: it closes the PROCESS record without touching the chargeback CN, which stays put).
	private outcomeFor(type: StripeEventType, object: StripeEventObject): GatewayOutcome | undefined {
		const outcomeByType: Record<StripeEventType, () => GatewayOutcome | undefined> = {
			'payment_intent.succeeded': () => (this.isPix(object) ? 'PIX_PAID' : 'CARD_SUCCEEDED'),
			'payment_intent.payment_failed': () => 'CHARGE_FAILED',
			'charge.refunded': () => 'CHARGE_REFUNDED',
			'charge.dispute.created': () => 'CHARGE_DISPUTED',
			'charge.dispute.closed': () => (object.status === 'won' ? 'DISPUTE_WON' : object.status === 'lost' ? 'DISPUTE_LOST' : undefined),
			'checkout.session.completed': () => undefined,
			// Stripe Billing families never reach here — map() branches them into their own flows
			// before the outcome dispatch (same posture as checkout.session.completed).
			'invoice.paid': () => undefined,
			'invoice.payment_failed': () => undefined,
			'invoice.voided': () => undefined,
			'customer.subscription.updated': () => undefined,
			'customer.subscription.deleted': () => undefined,
		}
		return outcomeByType[type]?.()
	}

	// invoice.* → the invoice-level External events. A Stripe Billing invoice carries OUR
	// engineInvoiceId on its metadata (the same stamp convention as PaymentIntents); ownerId is
	// resolved from the Invoice record by it — NEVER trusted off the payload (the invoice is the
	// single source of truth for invoice ownership). Any missing link → silent no-op (never crash
	// the ingest), exactly like the PI paths above.
	private async billingInvoiceEvents(
		eventId: string,
		type: 'invoice.paid' | 'invoice.payment_failed' | 'invoice.voided',
		object: StripeEventObject,
	): Promise<ExternalBillingEvent[]> {
		const engineInvoiceId = object.metadata?.engineInvoiceId
		if (!engineInvoiceId) return []

		const invoice = await this.invoiceRepository.findByEngineInvoiceId(engineInvoiceId)
		const ownerId = invoice?.ownerId.value
		if (!ownerId) return []

		const base = { externalId: eventId, ownerId, engineInvoiceId }
		const eventsByType: Record<typeof type, () => ExternalBillingEvent[]> = {
			// The gateway collected the invoice itself (no PaymentIntent of ours) — the invoice-level
			// settle. ExternalInvoicePaidHandler synthesizes the charge ref from the event id.
			'invoice.paid': () => [
				new ExternalInvoicePaidEvent({
					entityId: engineInvoiceId,
					ownerId,
					payload: { ...base, amountCents: object.amount_paid ?? object.amount ?? 0 },
				}),
			],
			// The gateway failed to collect the invoice — the invoice-level failure relay.
			// ExternalInvoicePaymentFailedHandler suppresses it for an already-settled invoice and
			// records the first failure (dunning entry) otherwise. Reason mirrors
			// ExternalChargeFailedHandler's `GATEWAY_CHARGE_FAILED:<ref>` style with the vendor
			// invoice id as the traceable ref.
			'invoice.payment_failed': () => [
				new ExternalInvoicePaymentFailedEvent({
					entityId: engineInvoiceId,
					ownerId,
					payload: { ...base, reason: `GATEWAY_INVOICE_PAYMENT_FAILED:${object.id}` },
				}),
			],
			// The invoice was voided at the gateway — the invoice-level refund/void fact.
			// ExternalInvoiceRefundedHandler books the full-amount REFUND credit note.
			'invoice.voided': () => [new ExternalInvoiceRefundedEvent({ entityId: engineInvoiceId, ownerId, payload: base })],
		}
		return eventsByType[type]()
	}

	// customer.subscription.* → the subscription-level External events. A gateway-managed
	// Subscription carries OUR engineSubscriptionId + ownerId on its metadata (stamped by us at
	// mint, delivered on a SIGNED webhook — the resolveSetupCheckout trust posture). The pair is
	// then VERIFIED against the stored Subscription record (ownerId → engineSubscriptionId must
	// match): resolve-and-verify, never trust alone. Any mismatch → silent no-op.
	private async subscriptionLifecycleEvents(
		eventId: string,
		type: 'customer.subscription.updated' | 'customer.subscription.deleted',
		object: StripeEventObject,
	): Promise<ExternalBillingEvent[]> {
		const engineSubscriptionId = object.metadata?.engineSubscriptionId
		const ownerId = object.metadata?.ownerId
		if (!engineSubscriptionId || !ownerId) return []

		const subscription = await this.subscriptionRepository.findByOwnerId(ownerId)
		if (subscription?.engineSubscriptionId !== engineSubscriptionId) return []

		const base = { externalId: eventId, ownerId, engineSubscriptionId }
		const eventsByType: Record<typeof type, () => ExternalBillingEvent[]> = {
			// Only the `active` posture is a mapped fact ("the settlement webhook reported the
			// subscription as active"); every other update status derives internally from invoice
			// facts and stays a no-op.
			'customer.subscription.updated': () =>
				object.status === 'active'
					? [new ExternalSubscriptionActivatedEvent({ entityId: engineSubscriptionId, ownerId, payload: base })]
					: [],
			'customer.subscription.deleted': () => [
				new ExternalSubscriptionCanceledEvent({ entityId: engineSubscriptionId, ownerId, payload: base }),
			],
		}
		return eventsByType[type]()
	}

	private isPix(object: StripeEventObject): boolean {
		// `payment_method_types` is what the PI was CONFIGURED to accept, not what paid it — a
		// multi-method PI (checkout with automatic payment methods) paid by CARD still lists 'pix'.
		// Our own Pix PIs (createPix) are minted pix-ONLY, so require the exact single-type list;
		// `payment_method_details.type` (present on Charge-shaped payloads) is the authoritative
		// actually-used method when available.
		if (object.payment_method_details?.type) return object.payment_method_details.type === 'pix'
		return object.payment_method_types?.length === 1 && object.payment_method_types[0] === 'pix'
	}

	// Populate the PaymentInstrument for a card-paid CARD_SUCCEEDED only when the card details are
	// present on the event (expanded payment_method or payment_method_details.card). Optional: the
	// off-session model vaults the pm_ ahead of the charge, so its absence here is not an error.
	private instrumentFrom(object: StripeEventObject): PaymentInstrument | undefined {
		const pmExpanded = typeof object.payment_method === 'object' ? object.payment_method : undefined
		const card = pmExpanded?.card ?? object.payment_method_details?.card
		if (!card) return undefined
		const pmRef = pmExpanded?.id ?? (typeof object.payment_method === 'string' ? object.payment_method : undefined) ?? object.id
		return {
			type: PaymentMethodType.CARD,
			pmRef,
			supportsOffSession: true,
			brand: card.brand ?? 'unknown',
			last4: card.last4 ?? '0000',
			expMonth: card.exp_month ?? 1,
			expYear: card.exp_year ?? new Date().getFullYear(),
		}
	}

	// checkout.session.completed → ExternalCheckoutCompletedEvent. O objeto é uma Checkout Session:
	// `mode` decide o intent; o pm_ + card vêm do PI (payment) ou SI (setup) retrievados via SDK
	// (a Session não expande o payment_method no webhook). ownerId: payment → resolvido pela
	// Invoice (fonte de verdade de ownership, mesmo posture do resto do mapper); setup → não há
	// invoice, então lê session.metadata.ownerId — carimbado por NÓS server-side no mint
	// (createCheckoutSession) e entregue num webhook ASSINADO, mesmo nível de confiança do
	// customer metadata. Qualquer campo faltando → no-op silencioso (nunca crashar o ingest).
	private async checkoutCompletedEvents(eventId: string, object: StripeEventObject): Promise<ExternalBillingEvent[]> {
		if (object.mode !== 'payment' && object.mode !== 'setup') return []
		const intent = object.mode === 'payment' ? CheckoutIntent.PAYMENT : CheckoutIntent.SETUP

		const resolved = intent === CheckoutIntent.PAYMENT ? await this.resolvePaymentCheckout(object) : await this.resolveSetupCheckout(object)
		if (!resolved) return []

		return [
			new ExternalCheckoutCompletedEvent({
				entityId: resolved.sessionRef,
				ownerId: resolved.ownerId,
				payload: { externalId: eventId, ...resolved, intent },
			}),
		]
	}

	private async resolvePaymentCheckout(object: StripeEventObject) {
		const engineInvoiceId = object.metadata?.engineInvoiceId
		if (!engineInvoiceId) return undefined
		const invoice = await this.invoiceRepository.findByEngineInvoiceId(engineInvoiceId)
		const ownerId = invoice?.ownerId.value
		if (!ownerId) return undefined

		const piId = typeof object.payment_intent === 'string' ? object.payment_intent : object.payment_intent?.id
		if (!piId) return undefined
		const pi = await this.stripe().paymentIntents.retrieve(piId, { expand: ['payment_method'] })
		const instrument = this.checkoutInstrument(pi.payment_method, CaptureOrigin.CHECKOUT_PAYMENT, pi.id)
		if (!instrument) return undefined

		return {
			ownerId,
			sessionRef: object.id,
			platform: BillingPlatform.STRIPE,
			instrument,
			engineInvoiceId,
			// No `?? 0` default: absent amounts stay undefined so the handler can tell "unresolved"
			// (skip the settle emit, let the raw PI settle) apart from a legitimate zero.
			amountCents: object.amount_total ?? pi.amount_received ?? undefined,
			gatewayTxId: pi.id,
		}
	}

	private async resolveSetupCheckout(object: StripeEventObject) {
		const ownerId = object.metadata?.ownerId
		if (!ownerId) return undefined

		const siId = typeof object.setup_intent === 'string' ? object.setup_intent : object.setup_intent?.id
		if (!siId) return undefined
		const si = await this.stripe().setupIntents.retrieve(siId, { expand: ['payment_method'] })
		const instrument = this.checkoutInstrument(si.payment_method, CaptureOrigin.CHECKOUT_SETUP, undefined)
		if (!instrument) return undefined

		return { ownerId, sessionRef: object.id, platform: BillingPlatform.STRIPE, instrument }
	}

	// O pm expandido do PI/SI → PaymentInstrument com a origem do checkout. `originGatewayTxId`
	// só existe no payment (o CIT); setup não tem cobrança — a primeira cobrança da série será
	// o chargeStoredOnSession 'first' (o CIT dela).
	private checkoutInstrument(
		paymentMethod: unknown,
		captureOrigin: CaptureOrigin,
		originGatewayTxId: string | undefined,
	): PaymentInstrument | undefined {
		// Validate the expanded pm instead of structurally casting it — a drifted Stripe shape
		// degrades to undefined (checkout no-ops, recoverable) rather than vaulting garbage.
		const parsed = ExpandedStripePmSchema.safeParse(paymentMethod)
		if (!parsed.success) return undefined
		const pm = parsed.data
		return {
			type: PaymentMethodType.CARD,
			pmRef: pm.id,
			supportsOffSession: true, // setup_future_usage / usage off_session gravou o mandato no checkout
			captureOrigin,
			...(originGatewayTxId ? { originGatewayTxId } : {}),
			brand: pm.card.brand ?? 'unknown',
			last4: pm.card.last4 ?? '0000',
			expMonth: pm.card.exp_month ?? 1,
			expYear: pm.card.exp_year ?? new Date().getFullYear(),
		}
	}
}
