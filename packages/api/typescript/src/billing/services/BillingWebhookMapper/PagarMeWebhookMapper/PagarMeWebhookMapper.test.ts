import { describe, it, expect, beforeEach } from 'bun:test'
import { PagarMeWebhookMapper } from './PagarMeWebhookMapper'
import { ExternalCardChargeSucceededEvent } from '@billing/events/ExternalCardChargeSucceededEvent'
import { ExternalPixPaidEvent } from '@billing/events/ExternalPixPaidEvent'
import { ExternalChargeFailedEvent } from '@billing/events/ExternalChargeFailedEvent'
import { ExternalChargeRefundedEvent } from '@billing/events/ExternalChargeRefundedEvent'
import { ExternalChargeDisputedEvent } from '@billing/events/ExternalChargeDisputedEvent'
import { ExternalCheckoutCompletedEvent } from '@billing/events/ExternalCheckoutCompletedEvent'

import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { Invoice } from '@billing/entities'
import { InvoiceLineKind } from '@billing/enums/InvoiceLineKind'
import { CaptureOrigin } from '@billing/enums/CaptureOrigin'
import { MockInvoiceRepository } from '@billing/repositories'
import { CheckoutIntent, PaymentMethodType } from '@template/contracts-typescript/wire/enums'

const webhook = (body: unknown) =>
	new Request('https://api.example.com/billing/webhooks/pagarme', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	})

// Seeds the invoice the mapper resolves ownerId from — the invoice IS the source of truth
// for engineInvoiceId → ownerId now (no more sub_<ownerId>:<suffix> parsing off the code).
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

describe('PagarMeWebhookMapper', () => {
	let invoiceRepository: MockInvoiceRepository
	let mapper: PagarMeWebhookMapper

	const mapOne = async (body: unknown) => {
		const events = await mapper.map(webhook(body))
		return events[0]
	}

	beforeEach(() => {
		invoiceRepository = new MockInvoiceRepository()
		mapper = new PagarMeWebhookMapper(invoiceRepository)
	})

	it('maps charge.paid (credit_card) with a seeded invoice → ExternalCardChargeSucceededEvent with resolved ownerId', async () => {
		await seedInvoice(invoiceRepository, 'lago_inv_1', 'o1')

		const event = await mapOne({
			id: 'hook_1',
			type: 'charge.paid',
			data: { id: 'ch_1', code: 'lago_inv_1', amount: 29900, paid_amount: 29900, status: 'paid', payment_method: 'credit_card' },
		})

		expect(event).toBeInstanceOf(ExternalCardChargeSucceededEvent)
		const cardEvent = event as ExternalCardChargeSucceededEvent
		expect(cardEvent.ownerId).toBe('o1')
		expect(cardEvent.payload.externalId).toBe('hook_1')
		expect(cardEvent.payload.engineInvoiceId).toBe('lago_inv_1')
		expect(cardEvent.payload.amountCents).toBe(29900)
	})

	it('maps charge.paid (pix) with a seeded invoice → ExternalPixPaidEvent', async () => {
		await seedInvoice(invoiceRepository, 'lago_inv_1', 'o1')

		const event = await mapOne({
			id: 'hook_2',
			type: 'charge.paid',
			data: { id: 'ch_2', code: 'lago_inv_1', amount: 29900, status: 'paid', payment_method: 'pix' },
		})

		expect(event).toBeInstanceOf(ExternalPixPaidEvent)
		expect(event?.ownerId).toBe('o1')
	})

	it('reads the nested charge from an order.paid event', async () => {
		await seedInvoice(invoiceRepository, 'lago_inv_1', 'o1')

		const event = await mapOne({
			id: 'hook_3',
			type: 'order.paid',
			data: {
				id: 'or_1',
				code: 'order-code',
				amount: 29900,
				status: 'paid',
				charges: [{ id: 'ch_3', code: 'lago_inv_1', amount: 29900, paid_amount: 29900, status: 'paid', payment_method: 'pix' }],
			},
		})

		expect(event).toBeInstanceOf(ExternalPixPaidEvent)
		const pixEvent = event as ExternalPixPaidEvent
		expect(pixEvent.payload.engineInvoiceId).toBe('lago_inv_1')
		expect(pixEvent.payload.gatewayTxId).toBe('ch_3')
	})

	it('maps charge.payment_failed with a seeded invoice → ExternalChargeFailedEvent', async () => {
		await seedInvoice(invoiceRepository, 'lago_inv_1', 'o1')

		const event = await mapOne({
			id: 'hook_4',
			type: 'charge.payment_failed',
			data: { id: 'ch_4', code: 'lago_inv_1', amount: 29900, status: 'failed', payment_method: 'credit_card' },
		})

		expect(event).toBeInstanceOf(ExternalChargeFailedEvent)
		expect(event?.ownerId).toBe('o1')
	})

	it('maps charge.refunded with a seeded invoice → ExternalChargeRefundedEvent', async () => {
		await seedInvoice(invoiceRepository, 'lago_inv_1', 'o1')

		const event = await mapOne({
			id: 'hook_refund',
			type: 'charge.refunded',
			data: { id: 'ch_refund', code: 'lago_inv_1', amount: 29900, status: 'refunded', payment_method: 'credit_card' },
		})

		expect(event).toBeInstanceOf(ExternalChargeRefundedEvent)
		expect(event?.ownerId).toBe('o1')
	})

	it('maps charge.chargedback with a seeded invoice → ExternalChargeDisputedEvent (a CHARGEBACK, not a REFUND)', async () => {
		await seedInvoice(invoiceRepository, 'lago_inv_1', 'o1')

		const event = await mapOne({
			id: 'hook_chargeback',
			type: 'charge.chargedback',
			data: { id: 'ch_chargeback', code: 'lago_inv_1', amount: 29900, status: 'chargedback', payment_method: 'credit_card' },
		})

		expect(event).toBeInstanceOf(ExternalChargeDisputedEvent)
		const disputeEvent = event as ExternalChargeDisputedEvent
		expect(disputeEvent.ownerId).toBe('o1')
		expect(disputeEvent.payload.engineInvoiceId).toBe('lago_inv_1')
		expect(disputeEvent.payload.amountCents).toBe(29900)
	})

	it('no-ops when the invoice is absent (ownerId cannot be resolved)', async () => {
		const events = await mapper.map(
			webhook({
				id: 'hook_5',
				type: 'charge.paid',
				data: { id: 'ch_5', code: 'lago_inv_missing', amount: 29900, paid_amount: 29900, status: 'paid', payment_method: 'credit_card' },
			}),
		)
		expect(events).toEqual([])
	})

	it('no-ops when the charge has no code (no engineInvoiceId)', async () => {
		const events = await mapper.map(
			webhook({
				id: 'hook_6',
				type: 'charge.paid',
				data: { id: 'ch_6', amount: 29900, paid_amount: 29900, status: 'paid', payment_method: 'credit_card' },
			}),
		)
		expect(events).toEqual([])
	})

	it('no-ops on event types we do not act on', async () => {
		expect(await mapper.map(webhook({ id: 'hook_7', type: 'charge.created', data: { id: 'ch_7' } }))).toEqual([])
	})

	it('no-ops on an unparseable body', async () => {
		expect(await mapper.map(webhook({ not: 'a pagarme webhook' }))).toEqual([])
	})

	it('charge.paid (credit_card) with card data → populates instrument', async () => {
		await seedInvoice(invoiceRepository, 'lago_inv_10', 'o1')

		const event = await mapOne({
			id: 'hook_10',
			type: 'charge.paid',
			data: {
				id: 'ch_10',
				code: 'lago_inv_10',
				amount: 29900,
				paid_amount: 29900,
				status: 'paid',
				payment_method: 'credit_card',
				last_transaction: {
					id: 'tx_10',
					card: {
						id: 'card_abc123',
						last_four_digits: '4242',
						brand: 'visa',
						exp_month: 12,
						exp_year: 2028,
					},
				},
			},
		})

		expect(event).toBeInstanceOf(ExternalCardChargeSucceededEvent)
		const cardEvent = event as ExternalCardChargeSucceededEvent
		expect(cardEvent.payload.instrument).toBeDefined()
		expect(cardEvent.payload.instrument?.type).toBe(PaymentMethodType.CARD)
		expect(cardEvent.payload.instrument?.supportsOffSession).toBe(true)
		// narrow to CARD leaf to access brand/last4/expMonth/expYear
		const instrument = cardEvent.payload.instrument
		if (instrument && instrument.type === PaymentMethodType.CARD) {
			expect(instrument.brand).toBe('visa')
			expect(instrument.last4).toBe('4242')
			expect(instrument.pmRef).toBe('card_abc123')
			expect(instrument.expMonth).toBe(12)
			expect(instrument.expYear).toBe(2028)
		}
	})

	it('charge.paid (pix) → leaves instrument undefined (pix event has no instrument field at all)', async () => {
		await seedInvoice(invoiceRepository, 'lago_inv_11', 'o2')

		const event = await mapOne({
			id: 'hook_11',
			type: 'charge.paid',
			data: {
				id: 'ch_11',
				code: 'lago_inv_11',
				amount: 19900,
				paid_amount: 19900,
				status: 'paid',
				payment_method: 'pix',
			},
		})

		expect(event).toBeInstanceOf(ExternalPixPaidEvent)
		expect(event?.ownerId).toBe('o2')
	})

	it('charge.paid (credit_card) without card in last_transaction → CardChargeSucceeded but no instrument', async () => {
		await seedInvoice(invoiceRepository, 'lago_inv_13', 'o4')

		const event = await mapOne({
			id: 'hook_13',
			type: 'charge.paid',
			data: {
				id: 'ch_13',
				code: 'lago_inv_13',
				amount: 29900,
				paid_amount: 29900,
				status: 'paid',
				payment_method: 'credit_card',
				// no last_transaction
			},
		})

		expect(event).toBeInstanceOf(ExternalCardChargeSucceededEvent)
		const cardEvent = event as ExternalCardChargeSucceededEvent
		expect(cardEvent.ownerId).toBe('o4')
		expect(cardEvent.payload.instrument).toBeUndefined()
	})

	it('falls back to pmRef = charge.id when card.id is absent', async () => {
		await seedInvoice(invoiceRepository, 'lago_inv_14', 'o5')

		const event = await mapOne({
			id: 'hook_14',
			type: 'charge.paid',
			data: {
				id: 'ch_fallback',
				code: 'lago_inv_14',
				amount: 29900,
				paid_amount: 29900,
				status: 'paid',
				payment_method: 'credit_card',
				last_transaction: {
					card: {
						last_four_digits: '1234',
						brand: 'mastercard',
						exp_month: 3,
						exp_year: 2030,
						// no id
					},
				},
			},
		})

		const cardEvent = event as ExternalCardChargeSucceededEvent
		expect(cardEvent.payload.instrument?.pmRef).toBe('ch_fallback')
	})

	describe('order.paid via hosted checkout (Payment Link)', () => {
		it('payment_method:"checkout" paid by card, order.code resolves to a seeded invoice → ExternalCheckoutCompletedEvent com instrument + settle', async () => {
			await seedInvoice(invoiceRepository, 'lago_inv_checkout_1', 'o10')

			const event = await mapOne({
				id: 'hook_checkout_1',
				type: 'order.paid',
				data: {
					id: 'or_checkout_1',
					code: 'lago_inv_checkout_1',
					amount: 29900,
					status: 'paid',
					checkout: { id: 'pl_checkout_1' },
					charges: [
						{
							id: 'ch_checkout_1',
							amount: 29900,
							paid_amount: 29900,
							status: 'paid',
							payment_method: 'checkout',
							last_transaction: {
								id: 'tx_checkout_1',
								card: {
									id: 'card_checkout_1',
									last_four_digits: '4242',
									brand: 'visa',
									exp_month: 11,
									exp_year: 2029,
								},
							},
						},
					],
				},
			})

			expect(event).toBeInstanceOf(ExternalCheckoutCompletedEvent)
			const checkoutEvent = event as ExternalCheckoutCompletedEvent
			expect(checkoutEvent.ownerId).toBe('o10')
			expect(checkoutEvent.payload.externalId).toBe('hook_checkout_1')
			expect(checkoutEvent.payload.sessionRef).toBe('pl_checkout_1')
			expect(checkoutEvent.payload.intent).toBe(CheckoutIntent.PAYMENT)
			expect(checkoutEvent.payload.engineInvoiceId).toBe('lago_inv_checkout_1')
			expect(checkoutEvent.payload.amountCents).toBe(29900)
			expect(checkoutEvent.payload.gatewayTxId).toBe('ch_checkout_1')

			const instrument = checkoutEvent.payload.instrument
			expect(instrument?.type).toBe(PaymentMethodType.CARD)
			expect(instrument?.supportsOffSession).toBe(true)
			expect(instrument?.captureOrigin).toBe(CaptureOrigin.CHECKOUT_PAYMENT)
			expect(instrument?.originGatewayTxId).toBe('ch_checkout_1')
			if (instrument && instrument.type === PaymentMethodType.CARD) {
				expect(instrument.pmRef).toBe('card_checkout_1')
				expect(instrument.brand).toBe('visa')
				expect(instrument.last4).toBe('4242')
			}
		})

		it('sem `checkout.id` no payload → sessionRef cai para "order:<id>"', async () => {
			await seedInvoice(invoiceRepository, 'lago_inv_checkout_2', 'o11')

			const event = await mapOne({
				id: 'hook_checkout_2',
				type: 'order.paid',
				data: {
					id: 'or_checkout_2',
					code: 'lago_inv_checkout_2',
					amount: 10000,
					status: 'paid',
					charges: [
						{
							id: 'ch_checkout_2',
							amount: 10000,
							paid_amount: 10000,
							status: 'paid',
							payment_method: 'checkout',
							last_transaction: { card: { id: 'card_checkout_2', last_four_digits: '1111', brand: 'mastercard' } },
						},
					],
				},
			})

			expect(event).toBeInstanceOf(ExternalCheckoutCompletedEvent)
			expect((event as ExternalCheckoutCompletedEvent).payload.sessionRef).toBe('order:or_checkout_2')
		})

		it('order.code não é nosso (sem invoice) mas o customer.code é ownerId → ExternalCheckoutCompletedEvent sem engineInvoiceId (settle cru cobre)', async () => {
			const event = await mapOne({
				id: 'hook_checkout_3',
				type: 'order.paid',
				data: {
					id: 'or_checkout_3',
					code: 'some-pagarme-internal-code',
					amount: 5000,
					status: 'paid',
					customer: { id: 'cus_1', code: 'o12' },
					charges: [
						{
							id: 'ch_checkout_3',
							amount: 5000,
							paid_amount: 5000,
							status: 'paid',
							payment_method: 'checkout',
							last_transaction: { card: { id: 'card_checkout_3', last_four_digits: '2222', brand: 'elo' } },
						},
					],
				},
			})

			expect(event).toBeInstanceOf(ExternalCheckoutCompletedEvent)
			const checkoutEvent = event as ExternalCheckoutCompletedEvent
			expect(checkoutEvent.ownerId).toBe('o12')
			expect(checkoutEvent.payload.engineInvoiceId).toBeUndefined()
			expect(checkoutEvent.payload.amountCents).toBeUndefined()
			expect(checkoutEvent.payload.gatewayTxId).toBeUndefined()
		})

		it('payment_method:"checkout" mas sem cartão (ex.: pix no checkout) e sem code direto → no-op (nenhum evento)', async () => {
			const events = await mapper.map(
				webhook({
					id: 'hook_checkout_4',
					type: 'order.paid',
					data: {
						id: 'or_checkout_4',
						amount: 3000,
						status: 'paid',
						charges: [{ id: 'ch_checkout_4', amount: 3000, paid_amount: 3000, status: 'paid', payment_method: 'checkout' }],
					},
				}),
			)

			expect(events).toEqual([])
		})

		it('payment_method:"checkout" sem cartão mas com code resolvível → settle SEM instrument (nunca CARD_SUCCEEDED)', async () => {
			await seedInvoice(invoiceRepository, 'lago_inv_pix_ck', 'o14')

			const event = await mapOne({
				id: 'hook_checkout_5',
				type: 'order.paid',
				data: {
					id: 'or_checkout_5',
					code: 'lago_inv_pix_ck',
					amount: 3000,
					status: 'paid',
					charges: [{ id: 'ch_checkout_5', amount: 3000, paid_amount: 3000, status: 'paid', payment_method: 'checkout' }],
				},
			})

			// Pix pago DENTRO da página hospedada: liquida pelo caminho de settle do checkout
			// (sem vault) — o fallthrough antigo mislabelava isso como ExternalCardChargeSucceededEvent.
			expect(event).toBeInstanceOf(ExternalCheckoutCompletedEvent)
			const checkoutEvent = event as ExternalCheckoutCompletedEvent
			expect(checkoutEvent.payload.instrument).toBeUndefined()
			expect(checkoutEvent.payload.engineInvoiceId).toBe('lago_inv_pix_ck')
			expect(checkoutEvent.payload.amountCents).toBe(3000)
			expect(checkoutEvent.payload.gatewayTxId).toBe('ch_checkout_5')
		})

		it('direct order.paid MIT/CIT (payment_method:"credit_card", sem checkout) continua CARD_SUCCEEDED — não regressa para ExternalCheckoutCompletedEvent', async () => {
			await seedInvoice(invoiceRepository, 'lago_inv_mit_1', 'o13')

			const event = await mapOne({
				id: 'hook_mit_1',
				type: 'order.paid',
				data: {
					id: 'or_mit_1',
					code: 'order-internal-code',
					amount: 15000,
					status: 'paid',
					charges: [
						{
							id: 'ch_mit_1',
							code: 'lago_inv_mit_1',
							amount: 15000,
							paid_amount: 15000,
							status: 'paid',
							payment_method: 'credit_card',
						},
					],
				},
			})

			expect(event).toBeInstanceOf(ExternalCardChargeSucceededEvent)
			const cardEvent = event as ExternalCardChargeSucceededEvent
			expect(cardEvent.ownerId).toBe('o13')
			expect(cardEvent.payload.engineInvoiceId).toBe('lago_inv_mit_1')
		})
	})
})
