import { describe, it, expect, beforeEach } from 'bun:test'
import Stripe from 'stripe'
import { StripeWebhookMapper } from './StripeWebhookMapper'
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

import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { Invoice, Subscription } from '@billing/entities'
import { InvoiceLineKind } from '@billing/enums/InvoiceLineKind'
import { CaptureOrigin } from '@billing/enums/CaptureOrigin'
import {
	InvoiceRepository,
	MockInvoiceRepository,
	CreditNoteRepository,
	MockCreditNoteRepository,
	SubscriptionRepository,
	MockSubscriptionRepository,
} from '@billing/repositories'
import { CreditNote } from '@billing/entities'
import {
	CheckoutIntent,
	CreditNoteReason,
	PaymentMethodType,
	PlanName,
	SubscriptionStatus,
} from '@template/contracts-typescript/wire/enums'

const webhook = (body: unknown) =>
	new Request('https://api.example.com/billing/webhooks/stripe', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	})

// Seeds the invoice the mapper resolves ownerId from — the invoice IS the source of truth for
// engineInvoiceId → ownerId (ownerId is never trusted off the Stripe payload).
const seedInvoice = (repo: MockInvoiceRepository, invoiceId: string, ownerId: string) =>
	repo.insert(
		Invoice.issue({
			invoiceId,
			ownerId,
			ourNumber: 'INV-000001',
			amountCents: 29900,
			currency: CurrencyCode.BRL,
			lineItems: [{ kind: InvoiceLineKind.SUBSCRIPTION, description: 'Subscription', amountCents: 29900 }],
		}),
	)

// A minimal stand-in for the Stripe SDK surface the mapper touches (only paymentIntents.retrieve,
// used on the charge.refunded / charge.dispute.created path). Records the ids it was called with.
class FakeStripe {
	retrieveCalls: string[] = []
	// Default parent PI carries the seeded invoice id so refund/dispute tests resolve by default.
	retrievedPaymentIntent: unknown = { id: 'pi_parent', metadata: { engineInvoiceId: 'lago_inv_1' } }
	retrievedSetupIntent: unknown = undefined
	paymentIntents = {
		retrieve: (id: string) => {
			this.retrieveCalls.push(id)
			return Promise.resolve(this.retrievedPaymentIntent)
		},
	}
	setupIntents = {
		retrieve: (id: string) => {
			this.retrieveCalls.push(id)
			return Promise.resolve(this.retrievedSetupIntent)
		},
	}
}

class TestableStripeMapper extends StripeWebhookMapper {
	constructor(
		private fake: FakeStripe,
		repo: InvoiceRepository,
		creditNotes: CreditNoteRepository,
		subscriptions: SubscriptionRepository,
	) {
		super(repo, creditNotes, subscriptions)
	}
	protected override stripe(): Stripe {
		return this.fake as unknown as Stripe
	}
}

// Metadata we stamp on PaymentIntents: engineInvoiceId ONLY — ownerId comes from the invoice.
const META = { engineInvoiceId: 'lago_inv_1' }

describe('StripeWebhookMapper', () => {
	let invoiceRepository: MockInvoiceRepository
	let creditNoteRepository: MockCreditNoteRepository
	let subscriptionRepository: MockSubscriptionRepository
	let fake: FakeStripe
	let mapper: StripeWebhookMapper

	const mapOne = async (body: unknown) => (await mapper.map(webhook(body)))[0]

	beforeEach(async () => {
		invoiceRepository = new MockInvoiceRepository()
		creditNoteRepository = new MockCreditNoteRepository()
		subscriptionRepository = new MockSubscriptionRepository()
		fake = new FakeStripe()
		mapper = new TestableStripeMapper(fake, invoiceRepository, creditNoteRepository, subscriptionRepository)
		// The invoice most tests act on: lago_inv_1 → owner o1.
		await seedInvoice(invoiceRepository, 'lago_inv_1', 'o1')
	})

	it('maps payment_intent.succeeded (card) with a seeded invoice → ExternalCardChargeSucceededEvent with invoice-derived ownerId', async () => {
		const event = await mapOne({
			id: 'evt_1',
			type: 'payment_intent.succeeded',
			data: {
				object: { id: 'pi_1', amount: 29900, amount_received: 29900, currency: 'brl', payment_method_types: ['card'], metadata: META },
			},
		})

		expect(event).toBeInstanceOf(ExternalCardChargeSucceededEvent)
		const cardEvent = event as ExternalCardChargeSucceededEvent
		expect(cardEvent.ownerId).toBe('o1')
		expect(cardEvent.payload.externalId).toBe('evt_1')
		expect(cardEvent.payload.engineInvoiceId).toBe('lago_inv_1')
		expect(cardEvent.payload.amountCents).toBe(29900)
		expect(cardEvent.payload.gatewayTxId).toBe('pi_1')
	})

	it('populates the instrument when the payment_method is expanded on the event', async () => {
		const event = (await mapOne({
			id: 'evt_card',
			type: 'payment_intent.succeeded',
			data: {
				object: {
					id: 'pi_card',
					amount: 29900,
					payment_method_types: ['card'],
					payment_method: { id: 'pm_x', card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 } },
					metadata: META,
				},
			},
		})) as ExternalCardChargeSucceededEvent

		const instrument = event.payload.instrument
		expect(instrument?.type).toBe(PaymentMethodType.CARD)
		if (instrument && instrument.type === PaymentMethodType.CARD) {
			expect(instrument.pmRef).toBe('pm_x')
			expect(instrument.brand).toBe('visa')
			expect(instrument.last4).toBe('4242')
			expect(instrument.expMonth).toBe(12)
			expect(instrument.expYear).toBe(2030)
			expect(instrument.supportsOffSession).toBe(true)
		}
	})

	it('reads card details from payment_method_details when payment_method is a bare id', async () => {
		const event = (await mapOne({
			id: 'evt_det',
			type: 'payment_intent.succeeded',
			data: {
				object: {
					id: 'ch_det',
					amount: 100,
					payment_method: 'pm_bare',
					payment_method_details: { type: 'card', card: { brand: 'amex', last4: '0005', exp_month: 1, exp_year: 2031 } },
					metadata: META,
				},
			},
		})) as ExternalCardChargeSucceededEvent

		const instrument = event.payload.instrument
		if (instrument && instrument.type === PaymentMethodType.CARD) {
			expect(instrument.pmRef).toBe('pm_bare')
			expect(instrument.brand).toBe('amex')
		}
	})

	it('leaves the instrument undefined when the event carries no card data', async () => {
		const event = (await mapOne({
			id: 'evt_nocard',
			type: 'payment_intent.succeeded',
			data: { object: { id: 'pi_nc', amount: 100, payment_method_types: ['card'], metadata: META } },
		})) as ExternalCardChargeSucceededEvent

		expect(event.payload.instrument).toBeUndefined()
	})

	it('maps a Pix payment_intent.succeeded with ONLY engineInvoiceId in PI metadata → ExternalPixPaidEvent with the invoice ownerId', async () => {
		const event = await mapOne({
			id: 'evt_2',
			type: 'payment_intent.succeeded',
			// No ownerId anywhere on the payload — createPix stamps only engineInvoiceId. ownerId
			// is recovered from the seeded invoice, proving the P0-2 (Pix) fix.
			data: { object: { id: 'pi_pix', amount: 19900, payment_method_types: ['pix'], metadata: { engineInvoiceId: 'lago_inv_1' } } },
		})

		expect(event).toBeInstanceOf(ExternalPixPaidEvent)
		const pixEvent = event as ExternalPixPaidEvent
		expect(pixEvent.ownerId).toBe('o1')
		expect(pixEvent.payload.gatewayTxId).toBe('pi_pix')
		expect(pixEvent.payload.engineInvoiceId).toBe('lago_inv_1')
	})

	it('detects pix off payment_method_details.type too', async () => {
		const event = await mapOne({
			id: 'evt_2b',
			type: 'payment_intent.succeeded',
			data: { object: { id: 'pi_pix2', amount: 100, payment_method_details: { type: 'pix' }, metadata: META } },
		})

		expect(event).toBeInstanceOf(ExternalPixPaidEvent)
	})

	it('maps payment_intent.payment_failed → ExternalChargeFailedEvent', async () => {
		const event = await mapOne({
			id: 'evt_3',
			type: 'payment_intent.payment_failed',
			data: { object: { id: 'pi_f', amount: 29900, metadata: META } },
		})

		expect(event).toBeInstanceOf(ExternalChargeFailedEvent)
		expect(event?.ownerId).toBe('o1')
	})

	it('maps charge.refunded whose parent PI (retrieved) carries engineInvoiceId → ExternalChargeRefundedEvent', async () => {
		// The Charge object carries NO metadata — only payment_intent. engineInvoiceId + ownerId are
		// recovered by retrieving the PI and consulting the invoice (P0-1: refunds were being dropped).
		const event = await mapOne({
			id: 'evt_4',
			type: 'charge.refunded',
			data: { object: { id: 'ch_r', amount: 29900, amount_refunded: 29900, payment_intent: 'pi_parent' } },
		})

		expect(fake.retrieveCalls).toEqual(['pi_parent'])
		expect(event).toBeInstanceOf(ExternalChargeRefundedEvent)
		const refundEvent = event as ExternalChargeRefundedEvent
		expect(refundEvent.ownerId).toBe('o1')
		expect(refundEvent.payload.engineInvoiceId).toBe('lago_inv_1')
		expect(refundEvent.payload.amountCents).toBe(29900)
	})

	it('maps charge.dispute.created (chargeback) → ExternalChargeDisputedEvent (a CHARGEBACK, not a REFUND) via the parent PI', async () => {
		const event = await mapOne({
			id: 'evt_5',
			type: 'charge.dispute.created',
			// A Dispute carries the disputed `amount` (no amount_refunded) and a payment_intent id.
			data: { object: { id: 'dp_1', amount: 29900, payment_intent: 'pi_parent' } },
		})

		expect(fake.retrieveCalls).toEqual(['pi_parent'])
		expect(event).toBeInstanceOf(ExternalChargeDisputedEvent)
		const disputeEvent = event as ExternalChargeDisputedEvent
		expect(disputeEvent.ownerId).toBe('o1')
		expect(disputeEvent.payload.amountCents).toBe(29900)
	})

	it('carries the Stripe Dispute object id as gatewayDisputeRef on charge.dispute.created (the object IS the Dispute, dp_…)', async () => {
		const event = (await mapOne({
			id: 'evt_5b',
			type: 'charge.dispute.created',
			data: { object: { id: 'dp_real_123', amount: 29900, payment_intent: 'pi_parent' } },
		})) as ExternalChargeDisputedEvent

		expect(event).toBeInstanceOf(ExternalChargeDisputedEvent)
		expect(event.payload.gatewayDisputeRef).toBe('dp_real_123')
	})

	it('maps charge.dispute.closed with status=won → ExternalChargeDisputeWonEvent via the parent PI, carrying the Dispute id as gatewayDisputeRef', async () => {
		const event = await mapOne({
			id: 'evt_won',
			type: 'charge.dispute.closed',
			data: { object: { id: 'dp_1', amount: 29900, status: 'won', payment_intent: 'pi_parent' } },
		})

		expect(fake.retrieveCalls).toEqual(['pi_parent'])
		expect(event).toBeInstanceOf(ExternalChargeDisputeWonEvent)
		const wonEvent = event as ExternalChargeDisputeWonEvent
		expect(wonEvent.ownerId).toBe('o1')
		expect(wonEvent.payload.engineInvoiceId).toBe('lago_inv_1')
		expect(wonEvent.payload.gatewayDisputeRef).toBe('dp_1')
	})

	// Task T4: charge.dispute.closed with status=lost used to be dropped entirely (no consumer for
	// the fact). The Dispute entity gave it one — it now maps to ExternalChargeDisputeLostEvent,
	// which only closes the Dispute PROCESS record; the chargeback CN is untouched by this event.
	it('maps charge.dispute.closed with status=lost → ExternalChargeDisputeLostEvent via the parent PI, carrying the Dispute id as gatewayDisputeRef', async () => {
		const event = await mapOne({
			id: 'evt_lost',
			type: 'charge.dispute.closed',
			data: { object: { id: 'dp_1', amount: 29900, status: 'lost', payment_intent: 'pi_parent' } },
		})

		expect(fake.retrieveCalls).toEqual(['pi_parent'])
		expect(event).toBeInstanceOf(ExternalChargeDisputeLostEvent)
		const lostEvent = event as ExternalChargeDisputeLostEvent
		expect(lostEvent.ownerId).toBe('o1')
		expect(lostEvent.payload.engineInvoiceId).toBe('lago_inv_1')
		expect(lostEvent.payload.gatewayDisputeRef).toBe('dp_1')
	})

	it('no-ops on charge.dispute.closed with a status other than won/lost', async () => {
		const events = await mapper.map(
			webhook({
				id: 'evt_other',
				type: 'charge.dispute.closed',
				data: { object: { id: 'dp_1', amount: 29900, status: 'warning_closed', payment_intent: 'pi_parent' } },
			}),
		)
		expect(events).toEqual([])
	})

	it('reports amount_refunded (not the full charge) on a PARTIAL refund', async () => {
		const event = await mapOne({
			id: 'evt_partial',
			type: 'charge.refunded',
			data: { object: { id: 'ch_partial', amount: 29900, amount_refunded: 10000, payment_intent: 'pi_parent' } },
		})

		expect(event).toBeInstanceOf(ExternalChargeRefundedEvent)
		expect((event as ExternalChargeRefundedEvent).payload.amountCents).toBe(10000)
	})

	it("emits the DELTA (not Stripe's cumulative amount_refunded) when credit notes were already recorded", async () => {
		// A prior $100 refund already booked its credit note; Stripe's second charge.refunded
		// carries the CUMULATIVE $250 — the event must carry only the $150 delta.
		await creditNoteRepository.insert(
			CreditNote.create({
				ownerId: 'o1',
				invoiceId: 'lago_inv_1',
				number: 'CN-000001',
				amountCents: 10000,
				currency: CurrencyCode.BRL,
				reason: CreditNoteReason.REFUND,
				gatewayRef: 'evt_prior',
			}),
		)

		const event = await mapOne({
			id: 'evt_partial_2',
			type: 'charge.refunded',
			data: { object: { id: 'ch_partial', amount: 29900, amount_refunded: 25000, payment_intent: 'pi_parent' } },
		})

		expect((event as ExternalChargeRefundedEvent).payload.amountCents).toBe(15000)
	})

	it('no-ops when the resolved engineInvoiceId has no record (ownerId cannot be resolved)', async () => {
		fake.retrievedPaymentIntent = { id: 'pi_parent', metadata: { engineInvoiceId: 'lago_inv_missing' } }

		const events = await mapper.map(
			webhook({
				id: 'evt_miss',
				type: 'charge.refunded',
				data: { object: { id: 'ch_miss', amount: 29900, amount_refunded: 29900, payment_intent: 'pi_parent' } },
			}),
		)
		expect(events).toEqual([])
	})

	it('no-ops when a PI event has no engineInvoiceId in metadata', async () => {
		const events = await mapper.map(
			webhook({ id: 'evt_7', type: 'payment_intent.succeeded', data: { object: { id: 'pi_x', amount: 1, metadata: { ownerId: 'o1' } } } }),
		)
		expect(events).toEqual([])
	})

	it('no-ops when a charge.refunded has no parent payment_intent', async () => {
		const events = await mapper.map(
			webhook({ id: 'evt_nopi', type: 'charge.refunded', data: { object: { id: 'ch_nopi', amount: 100, amount_refunded: 100 } } }),
		)
		expect(events).toEqual([])
		expect(fake.retrieveCalls).toEqual([])
	})

	it('no-ops on event types we do not act on', async () => {
		const events = await mapper.map(webhook({ id: 'evt_8', type: 'customer.created', data: { object: { id: 'cus_1', metadata: META } } }))
		expect(events).toEqual([])
	})

	it('no-ops on an unparseable body', async () => {
		expect(await mapper.map(webhook({ not: 'a stripe event' }))).toEqual([])
	})

	describe('checkout.session.completed', () => {
		it('mode=payment → ExternalCheckoutCompletedEvent com instrument origin checkout-payment', async () => {
			fake.retrievedPaymentIntent = {
				id: 'pi_1',
				amount_received: 29900,
				payment_method: { id: 'pm_1', card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 } },
			}

			const event = await mapOne({
				id: 'evt_1',
				type: 'checkout.session.completed',
				data: {
					object: {
						id: 'cs_1',
						mode: 'payment',
						payment_intent: 'pi_1',
						amount_total: 29900,
						metadata: { ownerId: 'owner-1', engineInvoiceId: 'lago_inv_1' },
					},
				},
			})

			expect(fake.retrieveCalls).toEqual(['pi_1'])
			expect(event).toBeInstanceOf(ExternalCheckoutCompletedEvent)
			const checkoutEvent = event as ExternalCheckoutCompletedEvent
			expect(checkoutEvent.ownerId).toBe('o1')
			expect(checkoutEvent.payload.externalId).toBe('evt_1')
			expect(checkoutEvent.payload.sessionRef).toBe('cs_1')
			expect(checkoutEvent.payload.intent).toBe(CheckoutIntent.PAYMENT)
			expect(checkoutEvent.payload.engineInvoiceId).toBe('lago_inv_1')
			expect(checkoutEvent.payload.amountCents).toBe(29900)
			expect(checkoutEvent.payload.gatewayTxId).toBe('pi_1')
			const instrument = checkoutEvent.payload.instrument
			expect(instrument?.type).toBe(PaymentMethodType.CARD)
			if (instrument && instrument.type === PaymentMethodType.CARD) {
				expect(instrument.pmRef).toBe('pm_1')
				expect(instrument.captureOrigin).toBe(CaptureOrigin.CHECKOUT_PAYMENT)
				expect(instrument.originGatewayTxId).toBe('pi_1')
			}
		})

		it('REGRESSÃO: payload REAL do Stripe carrega null explícito (setup_intent: null etc.) e ainda mapeia', async () => {
			// O Stripe serializa campos ausentes como null, não os omite — uma sessão mode=payment
			// real chega com setup_intent: null. O schema com .optional() (rejeita null) fazia TODO
			// checkout.session.completed falhar o safeParse em silêncio: sem vault, sem settle,
			// assinatura paga eternamente INCOMPLETE. (Live: evt_1TrZ2D8DbMaNa8TvT38OArrK.)
			fake.retrievedPaymentIntent = {
				id: 'pi_1',
				amount_received: 9900,
				payment_method: { id: 'pm_1', card: { brand: 'mastercard', last4: '4444', exp_month: 5, exp_year: 2055 } },
			}

			const event = await mapOne({
				id: 'evt_real',
				type: 'checkout.session.completed',
				data: {
					object: {
						id: 'cs_real',
						mode: 'payment',
						payment_intent: 'pi_1',
						setup_intent: null,
						amount_total: 9900,
						amount_subtotal: 9900,
						currency: 'brl',
						status: 'complete',
						payment_method_types: ['card'],
						metadata: { ownerId: 'o1', engineInvoiceId: 'lago_inv_1', intent: CheckoutIntent.PAYMENT },
						client_reference_id: null,
						customer_email: null,
						subscription: null,
						invoice: null,
					},
				},
			})

			expect(event).toBeInstanceOf(ExternalCheckoutCompletedEvent)
			const checkoutEvent = event as ExternalCheckoutCompletedEvent
			expect(checkoutEvent.payload.intent).toBe(CheckoutIntent.PAYMENT)
			expect(checkoutEvent.payload.amountCents).toBe(9900)
		})

		it('REGRESSÃO: sessão mode=setup real carrega payment_intent: null e ainda mapeia', async () => {
			fake.retrievedSetupIntent = {
				id: 'si_1',
				payment_method: { id: 'pm_2', card: { brand: 'visa', last4: '4242', exp_month: 6, exp_year: 2031 } },
			}

			const event = await mapOne({
				id: 'evt_real_setup',
				type: 'checkout.session.completed',
				data: {
					object: {
						id: 'cs_setup_real',
						mode: 'setup',
						setup_intent: 'si_1',
						payment_intent: null,
						amount_total: null,
						metadata: { ownerId: 'o1' },
					},
				},
			})

			expect(event).toBeInstanceOf(ExternalCheckoutCompletedEvent)
			expect((event as ExternalCheckoutCompletedEvent).payload.intent).toBe(CheckoutIntent.SETUP)
		})

		it('mode=setup → evento com origin checkout-setup, sem engineInvoiceId', async () => {
			fake.retrievedSetupIntent = {
				id: 'si_1',
				payment_method: { id: 'pm_2', card: { brand: 'mastercard', last4: '1111', exp_month: 6, exp_year: 2031 } },
			}

			const event = await mapOne({
				id: 'evt_2',
				type: 'checkout.session.completed',
				data: {
					object: {
						id: 'cs_2',
						mode: 'setup',
						setup_intent: 'si_1',
						metadata: { ownerId: 'o1' },
					},
				},
			})

			expect(fake.retrieveCalls).toEqual(['si_1'])
			expect(event).toBeInstanceOf(ExternalCheckoutCompletedEvent)
			const checkoutEvent = event as ExternalCheckoutCompletedEvent
			expect(checkoutEvent.ownerId).toBe('o1')
			expect(checkoutEvent.payload.sessionRef).toBe('cs_2')
			expect(checkoutEvent.payload.intent).toBe(CheckoutIntent.SETUP)
			expect(checkoutEvent.payload.engineInvoiceId).toBeUndefined()
			const instrument = checkoutEvent.payload.instrument
			expect(instrument?.type).toBe(PaymentMethodType.CARD)
			if (instrument && instrument.type === PaymentMethodType.CARD) {
				expect(instrument.pmRef).toBe('pm_2')
				expect(instrument.captureOrigin).toBe(CaptureOrigin.CHECKOUT_SETUP)
				expect(instrument.originGatewayTxId).toBeUndefined()
			}
		})
	})

	// Stripe Billing families (B3): invoice.* resolves through the Invoice record by the
	// metadata-stamped engineInvoiceId (ownerId never trusted off the payload);
	// customer.subscription.* resolves through the metadata pair (ownerId + engineSubscriptionId,
	// stamped by us at mint) VERIFIED against the stored Subscription record.
	describe('Stripe Billing — invoice.* → invoice-level External events', () => {
		it('maps invoice.paid → ExternalInvoicePaidEvent with amount_paid and the invoice-derived ownerId', async () => {
			const event = await mapOne({
				id: 'evt_inv_paid',
				type: 'invoice.paid',
				data: { object: { id: 'in_1', amount_paid: 29900, metadata: META } },
			})

			expect(event).toBeInstanceOf(ExternalInvoicePaidEvent)
			const paidEvent = event as ExternalInvoicePaidEvent
			expect(paidEvent.ownerId).toBe('o1')
			expect(paidEvent.payload.externalId).toBe('evt_inv_paid')
			expect(paidEvent.payload.engineInvoiceId).toBe('lago_inv_1')
			expect(paidEvent.payload.amountCents).toBe(29900)
		})

		it('maps invoice.payment_failed → ExternalInvoicePaymentFailedEvent carrying the vendor invoice id in the reason', async () => {
			const event = await mapOne({
				id: 'evt_inv_failed',
				type: 'invoice.payment_failed',
				data: { object: { id: 'in_2', metadata: META } },
			})

			expect(event).toBeInstanceOf(ExternalInvoicePaymentFailedEvent)
			const failedEvent = event as ExternalInvoicePaymentFailedEvent
			expect(failedEvent.ownerId).toBe('o1')
			expect(failedEvent.payload.engineInvoiceId).toBe('lago_inv_1')
			expect(failedEvent.payload.reason).toBe('GATEWAY_INVOICE_PAYMENT_FAILED:in_2')
		})

		it('maps invoice.voided → ExternalInvoiceRefundedEvent (the invoice-level void fact, no amount)', async () => {
			const event = await mapOne({
				id: 'evt_inv_voided',
				type: 'invoice.voided',
				data: { object: { id: 'in_3', metadata: META } },
			})

			expect(event).toBeInstanceOf(ExternalInvoiceRefundedEvent)
			const voidedEvent = event as ExternalInvoiceRefundedEvent
			expect(voidedEvent.ownerId).toBe('o1')
			expect(voidedEvent.payload.externalId).toBe('evt_inv_voided')
			expect(voidedEvent.payload.engineInvoiceId).toBe('lago_inv_1')
		})

		it('no-ops an invoice.* event without engineInvoiceId metadata (a vendor invoice that is not ours)', async () => {
			const events = await mapper.map(
				webhook({ id: 'evt_inv_x', type: 'invoice.paid', data: { object: { id: 'in_x', amount_paid: 100 } } }),
			)
			expect(events).toEqual([])
		})

		it('no-ops an invoice.* event whose engineInvoiceId resolves to no Invoice record', async () => {
			const events = await mapper.map(
				webhook({
					id: 'evt_inv_miss',
					type: 'invoice.paid',
					data: { object: { id: 'in_miss', amount_paid: 100, metadata: { engineInvoiceId: 'lago_inv_missing' } } },
				}),
			)
			expect(events).toEqual([])
		})
	})

	describe('Stripe Billing — customer.subscription.* → subscription-level External events', () => {
		const seedSubscription = () =>
			subscriptionRepository.save(
				Subscription.create({
					ownerId: 'o1',
					engineSubscriptionId: 'sub_engine_1',
					planName: PlanName.PRO,
					status: SubscriptionStatus.ACTIVE,
					currentPeriodEnd: null,
				}),
			)

		const SUB_META = { ownerId: 'o1', engineSubscriptionId: 'sub_engine_1' }

		it('maps customer.subscription.updated with status=active → ExternalSubscriptionActivatedEvent', async () => {
			await seedSubscription()

			const event = await mapOne({
				id: 'evt_sub_active',
				type: 'customer.subscription.updated',
				data: { object: { id: 'sub_stripe_1', status: 'active', metadata: SUB_META } },
			})

			expect(event).toBeInstanceOf(ExternalSubscriptionActivatedEvent)
			const activatedEvent = event as ExternalSubscriptionActivatedEvent
			expect(activatedEvent.ownerId).toBe('o1')
			expect(activatedEvent.payload.externalId).toBe('evt_sub_active')
			expect(activatedEvent.payload.engineSubscriptionId).toBe('sub_engine_1')
		})

		it('no-ops customer.subscription.updated with a non-active status (posture derives internally)', async () => {
			await seedSubscription()

			const events = await mapper.map(
				webhook({
					id: 'evt_sub_pastdue',
					type: 'customer.subscription.updated',
					data: { object: { id: 'sub_stripe_1', status: 'past_due', metadata: SUB_META } },
				}),
			)
			expect(events).toEqual([])
		})

		it('maps customer.subscription.deleted → ExternalSubscriptionCanceledEvent', async () => {
			await seedSubscription()

			const event = await mapOne({
				id: 'evt_sub_deleted',
				type: 'customer.subscription.deleted',
				data: { object: { id: 'sub_stripe_1', status: 'canceled', metadata: SUB_META } },
			})

			expect(event).toBeInstanceOf(ExternalSubscriptionCanceledEvent)
			const canceledEvent = event as ExternalSubscriptionCanceledEvent
			expect(canceledEvent.ownerId).toBe('o1')
			expect(canceledEvent.payload.engineSubscriptionId).toBe('sub_engine_1')
		})

		it('no-ops when the metadata pair is absent', async () => {
			const events = await mapper.map(
				webhook({
					id: 'evt_sub_nometa',
					type: 'customer.subscription.deleted',
					data: { object: { id: 'sub_stripe_1', status: 'canceled' } },
				}),
			)
			expect(events).toEqual([])
		})

		it('no-ops when the metadata engineSubscriptionId does not match the stored Subscription (resolve-and-verify)', async () => {
			await seedSubscription()

			const events = await mapper.map(
				webhook({
					id: 'evt_sub_forged',
					type: 'customer.subscription.deleted',
					data: { object: { id: 'sub_stripe_1', status: 'canceled', metadata: { ownerId: 'o1', engineSubscriptionId: 'sub_forged' } } },
				}),
			)
			expect(events).toEqual([])
		})
	})
})
