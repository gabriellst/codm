import { describe, it, expect, beforeEach } from 'bun:test'
import { MercadoPagoWebhookMapper } from './MercadoPagoWebhookMapper'
import { ExternalCheckoutCompletedEvent } from '@billing/events/ExternalCheckoutCompletedEvent'
import { ExternalPixPaidEvent } from '@billing/events/ExternalPixPaidEvent'
import { ExternalChargeFailedEvent } from '@billing/events/ExternalChargeFailedEvent'
import { ExternalChargeRefundedEvent } from '@billing/events/ExternalChargeRefundedEvent'
import { ExternalChargeDisputedEvent } from '@billing/events/ExternalChargeDisputedEvent'

import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { Invoice, CreditNote } from '@billing/entities'
import { InvoiceLineKind } from '@billing/enums/InvoiceLineKind'

import { InvoiceRepository, MockInvoiceRepository, CreditNoteRepository, MockCreditNoteRepository } from '@billing/repositories'
import { BillingPlatform, CheckoutIntent, CreditNoteReason } from '@template/contracts-typescript/wire/enums'

const webhook = (body: unknown) =>
	new Request('https://api.example.com/billing/webhooks/mercadopago', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	})

// Seeds the invoice the mapper resolves ownerId from — the invoice IS the source of truth for
// engineInvoiceId → ownerId (ownerId is never trusted off the MercadoPago payload).
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

// The GET /v1/payments/{id} shape the mapper re-fetches — matches MercadoPagoPaymentResponse.
interface FakePayment {
	id: number | string
	status?: string | null
	status_detail?: string | null
	external_reference?: string | null
	transaction_amount?: number | null
	transaction_amount_refunded?: number | null
	payment_method_id?: string | null
	payment_type_id?: string | null
}

class TestableMercadoPagoMapper extends MercadoPagoWebhookMapper {
	fetchCalls: string[] = []
	payment: FakePayment = { id: 0 }

	constructor(
		private fakePayment: () => FakePayment,
		invoiceRepository: InvoiceRepository,
		creditNoteRepository: CreditNoteRepository,
	) {
		super(invoiceRepository, creditNoteRepository)
	}

	protected override async fetchPayment(id: string): Promise<FakePayment> {
		this.fetchCalls.push(id)
		return this.fakePayment()
	}
}

describe('MercadoPagoWebhookMapper', () => {
	let invoiceRepository: MockInvoiceRepository
	let creditNoteRepository: MockCreditNoteRepository
	let payment: FakePayment
	let mapper: TestableMercadoPagoMapper

	const mapOne = async (body: unknown) => {
		const events = await mapper.map(webhook(body))
		return events[0]
	}

	// The REAL thin MercadoPago envelope — only `type` + `data.id` guaranteed, every other field
	// commonly arrives null depending on delivery version.
	const thinPayload = (overrides: Partial<{ type: string | null; dataId: string | number }> = {}) => ({
		id: null,
		action: null,
		api_version: null,
		data: { id: overrides.dataId ?? 'pay_1' },
		date_created: null,
		live_mode: null,
		type: overrides.type ?? 'payment',
		user_id: null,
	})

	beforeEach(() => {
		invoiceRepository = new MockInvoiceRepository()
		creditNoteRepository = new MockCreditNoteRepository()
		payment = { id: 'pay_1' }
		mapper = new TestableMercadoPagoMapper(() => payment, invoiceRepository, creditNoteRepository)
	})

	it('maps an approved card payment from a checkout preference → ExternalCheckoutCompletedEvent without instrument', async () => {
		await seedInvoice(invoiceRepository, 'inv-1', 'o1')
		payment = {
			id: 'pay_1',
			status: 'approved',
			external_reference: 'inv-1',
			transaction_amount: 299,
			payment_method_id: 'master',
			payment_type_id: 'credit_card',
		}

		const event = await mapOne(thinPayload({ dataId: 'pay_1' }))

		expect(mapper.fetchCalls).toEqual(['pay_1'])
		expect(event).toBeInstanceOf(ExternalCheckoutCompletedEvent)
		const checkoutEvent = event as ExternalCheckoutCompletedEvent
		expect(checkoutEvent.ownerId).toBe('o1')
		expect(checkoutEvent.payload.platform).toBe(BillingPlatform.MERCADOPAGO)
		expect(checkoutEvent.payload.intent).toBe(CheckoutIntent.PAYMENT)
		expect(checkoutEvent.payload.instrument).toBeUndefined()
		expect(checkoutEvent.payload.engineInvoiceId).toBe('inv-1')
		expect(checkoutEvent.payload.amountCents).toBe(29900)
		expect(checkoutEvent.payload.gatewayTxId).toBe('pay_1')
		expect(checkoutEvent.payload.sessionRef).toBe('pay_1')
	})

	it('maps an approved pix payment → ExternalPixPaidEvent', async () => {
		await seedInvoice(invoiceRepository, 'inv-2', 'o2')
		payment = { id: 'pay_2', status: 'approved', external_reference: 'inv-2', transaction_amount: 199, payment_method_id: 'pix' }

		const event = await mapOne(thinPayload({ dataId: 'pay_2' }))

		expect(event).toBeInstanceOf(ExternalPixPaidEvent)
		expect(event?.ownerId).toBe('o2')
		expect((event as ExternalPixPaidEvent).payload.amountCents).toBe(19900)
	})

	it('maps a rejected payment → ExternalChargeFailedEvent', async () => {
		await seedInvoice(invoiceRepository, 'inv-3', 'o3')
		payment = {
			id: 'pay_3',
			status: 'rejected',
			status_detail: 'cc_rejected_insufficient_amount',
			external_reference: 'inv-3',
			transaction_amount: 299,
			payment_method_id: 'visa',
		}

		const event = await mapOne(thinPayload({ dataId: 'pay_3' }))

		expect(event).toBeInstanceOf(ExternalChargeFailedEvent)
		expect(event?.ownerId).toBe('o3')
	})

	it('maps a refunded payment → ExternalChargeRefundedEvent with the full cumulative amount when no credit note exists yet', async () => {
		await seedInvoice(invoiceRepository, 'inv-4', 'o4')
		payment = {
			id: 'pay_4',
			status: 'refunded',
			external_reference: 'inv-4',
			transaction_amount: 299,
			transaction_amount_refunded: 299,
			payment_method_id: 'master',
		}

		const event = await mapOne(thinPayload({ dataId: 'pay_4' }))

		expect(event).toBeInstanceOf(ExternalChargeRefundedEvent)
		expect((event as ExternalChargeRefundedEvent).payload.amountCents).toBe(29900)
	})

	it('emits the DELTA (not the cumulative transaction_amount_refunded) when a credit note was already recorded', async () => {
		await seedInvoice(invoiceRepository, 'inv-5', 'o5')
		await creditNoteRepository.insert(
			CreditNote.create({
				ownerId: 'o5',
				invoiceId: 'inv-5',
				number: 'CN-000001',
				amountCents: 10000,
				currency: CurrencyCode.BRL,
				reason: CreditNoteReason.REFUND,
				gatewayRef: 'pay_5',
			}),
		)
		payment = {
			id: 'pay_5',
			status: 'refunded',
			external_reference: 'inv-5',
			transaction_amount: 29900,
			// Cumulative: 250 BRL = 25000 cents refunded so far; 10000 already credited → delta 15000.
			transaction_amount_refunded: 250,
			payment_method_id: 'master',
		}

		const event = await mapOne(thinPayload({ dataId: 'pay_5' }))

		expect((event as ExternalChargeRefundedEvent).payload.amountCents).toBe(15000)
	})

	it('maps charged_back → ExternalChargeDisputedEvent (a chargeback, NOT a refund)', async () => {
		await seedInvoice(invoiceRepository, 'inv-6', 'o6')
		payment = { id: 'pay_6', status: 'charged_back', external_reference: 'inv-6', transaction_amount: 299, payment_method_id: 'master' }

		const event = await mapOne(thinPayload({ dataId: 'pay_6' }))

		expect(event).toBeInstanceOf(ExternalChargeDisputedEvent)
		expect(event).not.toBeInstanceOf(ExternalChargeRefundedEvent)
		const disputedEvent = event as ExternalChargeDisputedEvent
		expect(disputedEvent.ownerId).toBe('o6')
		expect(disputedEvent.payload.engineInvoiceId).toBe('inv-6')
		expect(disputedEvent.payload.amountCents).toBe(29900)
		expect(disputedEvent.payload.gatewayTxId).toBe('pay_6')
	})

	it('still maps a genuine refunded payment → ExternalChargeRefundedEvent (not conflated with chargeback)', async () => {
		await seedInvoice(invoiceRepository, 'inv-11', 'o11')
		payment = {
			id: 'pay_11',
			status: 'refunded',
			external_reference: 'inv-11',
			transaction_amount: 299,
			transaction_amount_refunded: 299,
			payment_method_id: 'master',
		}

		const event = await mapOne(thinPayload({ dataId: 'pay_11' }))

		expect(event).toBeInstanceOf(ExternalChargeRefundedEvent)
		expect(event).not.toBeInstanceOf(ExternalChargeDisputedEvent)
	})

	it('no-ops on statuses with no resolved outcome (pending/in_process/authorized/cancelled)', async () => {
		await seedInvoice(invoiceRepository, 'inv-7', 'o7')
		for (const status of ['pending', 'in_process', 'authorized', 'cancelled', 'in_mediation']) {
			payment = { id: 'pay_7', status, external_reference: 'inv-7', transaction_amount: 299, payment_method_id: 'master' }
			expect(await mapper.map(webhook(thinPayload({ dataId: 'pay_7' })))).toEqual([])
		}
	})

	it('no-ops on topics other than "payment" (e.g. merchant_order) — never fetches the payment', async () => {
		const events = await mapper.map(webhook(thinPayload({ type: 'merchant_order', dataId: 'mo_1' })))
		expect(events).toEqual([])
		expect(mapper.fetchCalls).toEqual([])
	})

	it('no-ops when the invoice is absent (ownerId cannot be resolved)', async () => {
		payment = { id: 'pay_8', status: 'approved', external_reference: 'inv-missing', transaction_amount: 299, payment_method_id: 'master' }
		expect(await mapper.map(webhook(thinPayload({ dataId: 'pay_8' })))).toEqual([])
	})

	it('no-ops when the re-fetched payment has no external_reference', async () => {
		payment = { id: 'pay_9', status: 'approved', transaction_amount: 299, payment_method_id: 'master' }
		expect(await mapper.map(webhook(thinPayload({ dataId: 'pay_9' })))).toEqual([])
	})

	it('no-ops on an unparseable body (missing data.id)', async () => {
		expect(await mapper.map(webhook({ type: 'payment' }))).toEqual([])
		expect(mapper.fetchCalls).toEqual([])
	})

	it('accepts the REAL thin envelope (every field but type/data.id explicitly null)', async () => {
		await seedInvoice(invoiceRepository, 'inv-10', 'o10')
		payment = { id: 'pay_10', status: 'approved', external_reference: 'inv-10', transaction_amount: 100, payment_method_id: 'pix' }

		const events = await mapper.map(
			webhook({
				action: null,
				api_version: null,
				data: { id: 'pay_10' },
				date_created: null,
				id: null,
				live_mode: null,
				type: 'payment',
				user_id: null,
			}),
		)

		expect(events[0]).toBeInstanceOf(ExternalPixPaidEvent)
	})
})
