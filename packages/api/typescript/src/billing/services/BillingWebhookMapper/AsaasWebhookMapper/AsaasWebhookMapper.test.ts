import { describe, it, expect, beforeEach } from 'bun:test'
import { AsaasWebhookMapper } from './AsaasWebhookMapper'
import { ExternalCardChargeSucceededEvent } from '@billing/events/ExternalCardChargeSucceededEvent'
import { ExternalPixPaidEvent } from '@billing/events/ExternalPixPaidEvent'
import { ExternalChargeFailedEvent } from '@billing/events/ExternalChargeFailedEvent'
import { ExternalChargeRefundedEvent } from '@billing/events/ExternalChargeRefundedEvent'
import { ExternalChargeDisputedEvent } from '@billing/events/ExternalChargeDisputedEvent'
import { ExternalCheckoutCompletedEvent } from '@billing/events/ExternalCheckoutCompletedEvent'
import { ExternalInvoicePaidEvent } from '@billing/events/ExternalInvoicePaidEvent'
import { ExternalInvoiceRefundedEvent } from '@billing/events/ExternalInvoiceRefundedEvent'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { Invoice } from '@billing/entities'
import { InvoiceLineKind } from '@billing/enums/InvoiceLineKind'
import { MockInvoiceRepository } from '@billing/repositories'
import { CheckoutIntent } from '@template/contracts-typescript/wire/enums'

const webhook = (body: unknown) =>
	new Request('https://api.example.com/billing/webhooks/asaas', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	})

// Seeds the invoice the mapper resolves ownerId from — the invoice IS the source of truth for
// engineInvoiceId → ownerId (ownerId is never trusted off the Asaas payload).
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

describe('AsaasWebhookMapper', () => {
	let invoiceRepository: MockInvoiceRepository
	let mapper: AsaasWebhookMapper

	const mapOne = async (body: unknown) => (await mapper.map(webhook(body)))[0]

	beforeEach(async () => {
		invoiceRepository = new MockInvoiceRepository()
		mapper = new AsaasWebhookMapper(invoiceRepository)
		// The invoice most tests act on: lago_inv_1 → owner o1.
		await seedInvoice(invoiceRepository, 'lago_inv_1', 'o1')
	})

	it('maps PAYMENT_CONFIRMED (plain MIT/CIT, no checkoutSession) → ExternalCardChargeSucceededEvent with invoice-derived ownerId', async () => {
		const event = await mapOne({
			event: 'PAYMENT_CONFIRMED',
			payment: {
				id: 'pay_1',
				customer: 'cus_1',
				value: 299,
				billingType: 'CREDIT_CARD',
				status: 'CONFIRMED',
				externalReference: 'lago_inv_1',
				// No checkoutSession — this is a subsequent (off-session) charge, not a checkout.
				checkoutSession: null,
				creditCard: null,
				refunds: null,
			},
			checkout: null,
		})

		expect(event).toBeInstanceOf(ExternalCardChargeSucceededEvent)
		const cardEvent = event as ExternalCardChargeSucceededEvent
		expect(cardEvent.ownerId).toBe('o1')
		expect(cardEvent.payload.engineInvoiceId).toBe('lago_inv_1')
		// value is REAIS decimal on the wire — converted to cents.
		expect(cardEvent.payload.amountCents).toBe(29900)
		expect(cardEvent.payload.gatewayTxId).toBe('pay_1')
		expect(cardEvent.payload.externalId).toBe('PAYMENT_CONFIRMED:pay_1')
	})

	it('maps PAYMENT_RECEIVED with billingType PIX → ExternalPixPaidEvent', async () => {
		const event = await mapOne({
			event: 'PAYMENT_RECEIVED',
			payment: {
				id: 'pay_pix',
				customer: 'cus_1',
				value: 199,
				billingType: 'PIX',
				status: 'RECEIVED',
				externalReference: 'lago_inv_1',
				checkoutSession: null,
				creditCard: null,
				refunds: null,
			},
			checkout: null,
		})

		expect(event).toBeInstanceOf(ExternalPixPaidEvent)
		const pixEvent = event as ExternalPixPaidEvent
		expect(pixEvent.payload.amountCents).toBe(19900)
		expect(pixEvent.payload.gatewayTxId).toBe('pay_pix')
	})

	it('maps PAYMENT_CONFIRMED with checkoutSession + card token → ExternalCheckoutCompletedEvent with a composite pmRef', async () => {
		const event = await mapOne({
			event: 'PAYMENT_CONFIRMED',
			payment: {
				id: 'pay_checkout',
				customer: 'cus_42',
				value: 299,
				billingType: 'CREDIT_CARD',
				status: 'CONFIRMED',
				externalReference: 'lago_inv_1',
				checkoutSession: 'checkout_1',
				creditCard: { creditCardToken: 'tok_abc', creditCardBrand: 'visa', creditCardNumber: '************4242' },
				refunds: null,
			},
			checkout: { id: 'checkout_1', status: 'PAID', externalReference: 'lago_inv_1' },
		})

		expect(event).toBeInstanceOf(ExternalCheckoutCompletedEvent)
		const checkoutEvent = event as ExternalCheckoutCompletedEvent
		expect(checkoutEvent.ownerId).toBe('o1')
		expect(checkoutEvent.payload.sessionRef).toBe('checkout_1')
		expect(checkoutEvent.payload.intent).toBe(CheckoutIntent.PAYMENT)
		expect(checkoutEvent.payload.engineInvoiceId).toBe('lago_inv_1')
		expect(checkoutEvent.payload.amountCents).toBe(29900)
		// pmRef packs `${asaasCustomerId}:${creditCardToken}` — AsaasPaymentProvider needs BOTH to
		// charge (POST /payments requires the owning customer id alongside the token).
		expect(checkoutEvent.payload.instrument?.pmRef).toBe('cus_42:tok_abc')
		expect(checkoutEvent.payload.instrument?.supportsOffSession).toBe(true)
		if (checkoutEvent.payload.instrument?.type === 'CARD') {
			expect(checkoutEvent.payload.instrument.brand).toBe('visa')
			expect(checkoutEvent.payload.instrument.last4).toBe('4242')
		}
	})

	it('maps CHECKOUT_PAID → ExternalCheckoutCompletedEvent even without an inlined payment.checkoutSession echo', async () => {
		const event = await mapOne({
			event: 'CHECKOUT_PAID',
			payment: {
				id: 'pay_checkout_2',
				customer: 'cus_7',
				value: 100,
				billingType: 'CREDIT_CARD',
				status: 'CONFIRMED',
				externalReference: 'lago_inv_1',
				checkoutSession: null,
				creditCard: { creditCardToken: 'tok_xyz', creditCardBrand: null, creditCardNumber: null },
				refunds: null,
			},
			checkout: { id: 'checkout_2', status: 'PAID', externalReference: 'lago_inv_1' },
		})

		expect(event).toBeInstanceOf(ExternalCheckoutCompletedEvent)
		const checkoutEvent = event as ExternalCheckoutCompletedEvent
		expect(checkoutEvent.payload.sessionRef).toBe('checkout_2')
		expect(checkoutEvent.payload.instrument?.pmRef).toBe('cus_7:tok_xyz')
	})

	it('checkout-completed without card data (e.g. Pix inside the checkout) settles without an instrument', async () => {
		const event = await mapOne({
			event: 'CHECKOUT_PAID',
			payment: {
				id: 'pay_checkout_pix',
				customer: 'cus_9',
				value: 50,
				billingType: 'PIX',
				status: 'RECEIVED',
				externalReference: 'lago_inv_1',
				checkoutSession: null,
				creditCard: null,
				refunds: null,
			},
			checkout: { id: 'checkout_3', status: 'PAID', externalReference: 'lago_inv_1' },
		})

		expect(event).toBeInstanceOf(ExternalCheckoutCompletedEvent)
		const checkoutEvent = event as ExternalCheckoutCompletedEvent
		expect(checkoutEvent.payload.instrument).toBeUndefined()
	})

	it('maps PAYMENT_REFUNDED using the LATEST refund entry value (partial refund) over the full payment value', async () => {
		const event = await mapOne({
			event: 'PAYMENT_REFUNDED',
			payment: {
				id: 'pay_refund',
				customer: 'cus_1',
				value: 299,
				billingType: 'CREDIT_CARD',
				status: 'REFUNDED',
				externalReference: 'lago_inv_1',
				checkoutSession: null,
				creditCard: null,
				refunds: [
					{ id: 'ref_1', value: 100, status: 'DONE' },
					{ id: 'ref_2', value: 50, status: 'DONE' },
				],
			},
			checkout: null,
		})

		expect(event).toBeInstanceOf(ExternalChargeRefundedEvent)
		const refundEvent = event as ExternalChargeRefundedEvent
		// The LAST refund entry (50 reais → 5000 cents), not the cumulative/full payment value.
		expect(refundEvent.payload.amountCents).toBe(5000)
	})

	it('maps PAYMENT_REFUNDED falling back to the full payment value when no refunds[] entry is present', async () => {
		const event = await mapOne({
			event: 'PAYMENT_REFUNDED',
			payment: {
				id: 'pay_refund_full',
				customer: 'cus_1',
				value: 299,
				billingType: 'CREDIT_CARD',
				status: 'REFUNDED',
				externalReference: 'lago_inv_1',
				checkoutSession: null,
				creditCard: null,
				refunds: null,
			},
			checkout: null,
		})

		expect((event as ExternalChargeRefundedEvent).payload.amountCents).toBe(29900)
	})

	it('maps PAYMENT_CHARGEBACK_REQUESTED → ExternalChargeDisputedEvent', async () => {
		const event = await mapOne({
			event: 'PAYMENT_CHARGEBACK_REQUESTED',
			payment: {
				id: 'pay_dispute',
				customer: 'cus_1',
				value: 299,
				billingType: 'CREDIT_CARD',
				status: 'CHARGEBACK_REQUESTED',
				externalReference: 'lago_inv_1',
				checkoutSession: null,
				creditCard: null,
				refunds: null,
			},
			checkout: null,
		})

		expect(event).toBeInstanceOf(ExternalChargeDisputedEvent)
		expect((event as ExternalChargeDisputedEvent).payload.amountCents).toBe(29900)
	})

	it('maps PAYMENT_OVERDUE → ExternalChargeFailedEvent (the closest "did not happen" signal Asaas exposes)', async () => {
		const event = await mapOne({
			event: 'PAYMENT_OVERDUE',
			payment: {
				id: 'pay_overdue',
				customer: 'cus_1',
				value: 299,
				billingType: 'PIX',
				status: 'OVERDUE',
				externalReference: 'lago_inv_1',
				checkoutSession: null,
				creditCard: null,
				refunds: null,
			},
			checkout: null,
		})

		expect(event).toBeInstanceOf(ExternalChargeFailedEvent)
	})

	// Invoice-level facts (B3): an Asaas payment maps 1:1 to OUR invoice via externalReference, so a
	// payment-level fact with no charge attempt of ours behind it is an INVOICE fact.
	it('maps PAYMENT_DUNNING_RECEIVED (out-of-band dunning/negativação recovery) → ExternalInvoicePaidEvent', async () => {
		const event = await mapOne({
			event: 'PAYMENT_DUNNING_RECEIVED',
			payment: {
				id: 'pay_dunning',
				customer: 'cus_1',
				value: 299,
				billingType: 'BOLETO',
				status: 'DUNNING_RECEIVED',
				externalReference: 'lago_inv_1',
				checkoutSession: null,
				creditCard: null,
				refunds: null,
			},
			checkout: null,
		})

		expect(event).toBeInstanceOf(ExternalInvoicePaidEvent)
		const paidEvent = event as ExternalInvoicePaidEvent
		expect(paidEvent.ownerId).toBe('o1')
		expect(paidEvent.payload.engineInvoiceId).toBe('lago_inv_1')
		expect(paidEvent.payload.amountCents).toBe(29900)
		expect(paidEvent.payload.externalId).toBe('PAYMENT_DUNNING_RECEIVED:pay_dunning')
	})

	it('maps PAYMENT_DELETED (cobrança voided at the gateway) → ExternalInvoiceRefundedEvent', async () => {
		const event = await mapOne({
			event: 'PAYMENT_DELETED',
			payment: {
				id: 'pay_deleted',
				customer: 'cus_1',
				value: 299,
				billingType: 'BOLETO',
				status: 'PENDING',
				externalReference: 'lago_inv_1',
				checkoutSession: null,
				creditCard: null,
				refunds: null,
			},
			checkout: null,
		})

		expect(event).toBeInstanceOf(ExternalInvoiceRefundedEvent)
		const refundedEvent = event as ExternalInvoiceRefundedEvent
		expect(refundedEvent.ownerId).toBe('o1')
		expect(refundedEvent.payload.engineInvoiceId).toBe('lago_inv_1')
		expect(refundedEvent.payload.externalId).toBe('PAYMENT_DELETED:pay_deleted')
	})

	it('maps PAYMENT_RECEIVED_IN_CASH_UNDONE (out-of-band receipt reversed) → ExternalInvoiceRefundedEvent', async () => {
		const event = await mapOne({
			event: 'PAYMENT_RECEIVED_IN_CASH_UNDONE',
			payment: {
				id: 'pay_cash_undone',
				customer: 'cus_1',
				value: 299,
				billingType: 'BOLETO',
				status: 'PENDING',
				externalReference: 'lago_inv_1',
				checkoutSession: null,
				creditCard: null,
				refunds: null,
			},
			checkout: null,
		})

		expect(event).toBeInstanceOf(ExternalInvoiceRefundedEvent)
		expect((event as ExternalInvoiceRefundedEvent).payload.externalId).toBe('PAYMENT_RECEIVED_IN_CASH_UNDONE:pay_cash_undone')
	})

	it('no-ops on an event type we do not act on (e.g. PAYMENT_CREATED)', async () => {
		const events = await mapper.map(
			webhook({
				event: 'PAYMENT_CREATED',
				payment: {
					id: 'pay_new',
					customer: 'cus_1',
					value: 299,
					billingType: 'CREDIT_CARD',
					status: 'PENDING',
					externalReference: 'lago_inv_1',
					checkoutSession: null,
					creditCard: null,
					refunds: null,
				},
				checkout: null,
			}),
		)
		expect(events).toEqual([])
	})

	it('no-ops when externalReference resolves to no invoice (unknown/foreign engineInvoiceId)', async () => {
		const events = await mapper.map(
			webhook({
				event: 'PAYMENT_CONFIRMED',
				payment: {
					id: 'pay_unknown',
					customer: 'cus_1',
					value: 100,
					billingType: 'CREDIT_CARD',
					status: 'CONFIRMED',
					externalReference: 'not_our_invoice',
					checkoutSession: null,
					creditCard: null,
					refunds: null,
				},
				checkout: null,
			}),
		)
		expect(events).toEqual([])
	})

	it('no-ops when there is no externalReference at all on payment or checkout', async () => {
		const events = await mapper.map(
			webhook({
				event: 'PAYMENT_CONFIRMED',
				payment: {
					id: 'pay_no_ref',
					customer: 'cus_1',
					value: 100,
					billingType: 'CREDIT_CARD',
					status: 'CONFIRMED',
					externalReference: null,
					checkoutSession: null,
					creditCard: null,
					refunds: null,
				},
				checkout: null,
			}),
		)
		expect(events).toEqual([])
	})

	it('parses a payload with explicit nulls everywhere (real Asaas shape) without crashing', async () => {
		const events = await mapper.map(
			webhook({
				id: null,
				event: 'PAYMENT_CONFIRMED',
				dateCreated: null,
				payment: {
					id: 'pay_nulls',
					customer: 'cus_1',
					value: 10,
					netValue: null,
					billingType: 'CREDIT_CARD',
					status: 'CONFIRMED',
					dueDate: null,
					externalReference: 'lago_inv_1',
					checkoutSession: null,
					creditCard: null,
					refunds: null,
				},
				checkout: null,
			}),
		)
		expect(events).toHaveLength(1)
		expect(events[0]).toBeInstanceOf(ExternalCardChargeSucceededEvent)
	})
})
