import { describe, it, expect, beforeEach } from 'bun:test'
import { PagBankWebhookMapper } from './PagBankWebhookMapper'
import { ExternalCheckoutCompletedEvent } from '@billing/events/ExternalCheckoutCompletedEvent'
import { ExternalPixPaidEvent } from '@billing/events/ExternalPixPaidEvent'
import { ExternalChargeFailedEvent } from '@billing/events/ExternalChargeFailedEvent'
import { ExternalChargeRefundedEvent } from '@billing/events/ExternalChargeRefundedEvent'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { Invoice } from '@billing/entities'
import { InvoiceLineKind } from '@billing/enums/InvoiceLineKind'
import { MockInvoiceRepository } from '@billing/repositories'
import { CheckoutIntent } from '@template/contracts-typescript/wire/enums'

const webhook = (body: unknown) =>
	new Request('https://api.example.com/billing/webhooks/pagbank', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	})

// Seeds the invoice the mapper resolves ownerId from — the invoice IS the source of truth for
// engineInvoiceId (== order.reference_id) → ownerId; never trusted off the PagBank payload.
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

describe('PagBankWebhookMapper', () => {
	let invoiceRepository: MockInvoiceRepository
	let mapper: PagBankWebhookMapper

	const mapOne = async (body: unknown) => {
		const events = await mapper.map(webhook(body))
		if (events.length !== 1) throw new Error(`mapOne: expected exactly 1 event, got ${events.length}`)
		return events[0]!
	}

	beforeEach(() => {
		invoiceRepository = new MockInvoiceRepository()
		mapper = new PagBankWebhookMapper(invoiceRepository)
	})

	it('maps a PAID credit_card checkout charge to ExternalCheckoutCompletedEvent without an instrument', async () => {
		await seedInvoice(invoiceRepository, 'inv_1', 'owner_1')

		// Real PagBank Order shape — every field the gateway doesn't populate for this outcome
		// arrives as an explicit null (not omitted), including on the charge's own optional fields.
		const event = await mapOne({
			id: 'ORDE_1',
			reference_id: 'inv_1',
			created_at: '2026-07-10T12:00:00-03:00',
			charges: [
				{
					id: 'CHAR_1',
					reference_id: null,
					status: 'PAID',
					created_at: '2026-07-10T12:00:05-03:00',
					paid_at: '2026-07-10T12:00:06-03:00',
					amount: { value: 29900, currency: 'BRL' },
					payment_method: {
						type: 'CREDIT_CARD',
						installments: 1,
						card: {
							brand: 'VISA',
							first_digits: '411111',
							last_digits: '1111',
							exp_month: '12',
							exp_year: '2030',
						},
					},
					payment_response: { code: '0', message: 'SUCESSO', reference: '20250710120006' },
				},
			],
			qr_codes: null,
		})

		expect(event).toBeInstanceOf(ExternalCheckoutCompletedEvent)
		expect(event.ownerId).toBe('owner_1')
		if (event instanceof ExternalCheckoutCompletedEvent) {
			expect(event.payload).toMatchObject({
				externalId: 'CHAR_1',
				sessionRef: 'ORDE_1',
				intent: CheckoutIntent.PAYMENT,
				platform: 'PAGBANK',
				engineInvoiceId: 'inv_1',
				amountCents: 29900,
				gatewayTxId: 'CHAR_1',
			})
			expect(event.payload.instrument).toBeUndefined()
		}
	})

	it('maps a PAID pix charge to ExternalPixPaidEvent', async () => {
		await seedInvoice(invoiceRepository, 'inv_2', 'owner_2')

		const event = await mapOne({
			id: 'ORDE_2',
			reference_id: 'inv_2',
			created_at: '2026-07-10T12:00:00-03:00',
			charges: [
				{
					id: 'CHAR_2',
					reference_id: null,
					status: 'PAID',
					created_at: '2026-07-10T12:00:05-03:00',
					paid_at: '2026-07-10T12:00:06-03:00',
					amount: { value: 5000, currency: 'BRL' },
					payment_method: { type: 'PIX', installments: null, card: null },
					payment_response: null,
				},
			],
			qr_codes: [
				{
					id: 'QRCO_1',
					amount: { value: 5000, currency: null },
					expiration_date: '2026-07-10T13:00:00-03:00',
					text: '00020126580014BR.GOV.BCB.PIX...',
					links: [{ rel: 'QRCODE.PNG', href: 'https://api.pagseguro.com/qrcodes/QRCO_1.png' }],
				},
			],
		})

		expect(event).toBeInstanceOf(ExternalPixPaidEvent)
		expect(event.payload).toMatchObject({
			externalId: 'CHAR_2',
			ownerId: 'owner_2',
			engineInvoiceId: 'inv_2',
			amountCents: 5000,
			gatewayTxId: 'CHAR_2',
		})
	})

	it('maps a DECLINED charge to ExternalChargeFailedEvent', async () => {
		await seedInvoice(invoiceRepository, 'inv_3', 'owner_3')

		const event = await mapOne({
			id: 'ORDE_3',
			reference_id: 'inv_3',
			created_at: '2026-07-10T12:00:00-03:00',
			charges: [
				{
					id: 'CHAR_3',
					reference_id: null,
					status: 'DECLINED',
					created_at: '2026-07-10T12:00:05-03:00',
					paid_at: null,
					amount: { value: 29900, currency: 'BRL' },
					payment_method: {
						type: 'CREDIT_CARD',
						installments: 1,
						card: { brand: 'MASTERCARD', first_digits: '555555', last_digits: '4444', exp_month: '01', exp_year: '2027' },
					},
					payment_response: { code: '28000', message: 'NAO AUTORIZADA', reference: null },
				},
			],
			qr_codes: null,
		})

		expect(event).toBeInstanceOf(ExternalChargeFailedEvent)
		expect(event.payload).toMatchObject({
			externalId: 'CHAR_3',
			ownerId: 'owner_3',
			engineInvoiceId: 'inv_3',
			amountCents: 29900,
			gatewayTxId: 'CHAR_3',
		})
	})

	it('maps a CANCELED charge to ExternalChargeRefundedEvent', async () => {
		await seedInvoice(invoiceRepository, 'inv_4', 'owner_4')

		const event = await mapOne({
			id: 'ORDE_4',
			reference_id: 'inv_4',
			created_at: '2026-07-10T12:00:00-03:00',
			charges: [
				{
					id: 'CHAR_4',
					reference_id: null,
					status: 'CANCELED',
					created_at: '2026-07-10T12:00:05-03:00',
					paid_at: '2026-07-10T12:00:06-03:00',
					amount: { value: 29900, currency: 'BRL' },
					payment_method: { type: 'CREDIT_CARD', installments: 1, card: null },
					payment_response: null,
				},
			],
			qr_codes: null,
		})

		expect(event).toBeInstanceOf(ExternalChargeRefundedEvent)
		expect(event.payload).toMatchObject({
			externalId: 'CHAR_4',
			ownerId: 'owner_4',
			engineInvoiceId: 'inv_4',
			amountCents: 29900,
			gatewayTxId: 'CHAR_4',
		})
	})

	it('no-ops for charge statuses that carry no fact yet (AUTHORIZED / IN_ANALYSIS / WAITING)', async () => {
		await seedInvoice(invoiceRepository, 'inv_5', 'owner_5')

		const events = await mapper.map(
			webhook({
				id: 'ORDE_5',
				reference_id: 'inv_5',
				created_at: '2026-07-10T12:00:00-03:00',
				charges: [
					{
						id: 'CHAR_5',
						reference_id: null,
						status: 'IN_ANALYSIS',
						created_at: '2026-07-10T12:00:05-03:00',
						paid_at: null,
						amount: { value: 29900, currency: 'BRL' },
						payment_method: { type: 'CREDIT_CARD', installments: 1, card: null },
						payment_response: null,
					},
				],
				qr_codes: null,
			}),
		)

		expect(events).toEqual([])
	})

	it('no-ops when reference_id is absent (explicit null) — cannot attribute the order to an invoice', async () => {
		const events = await mapper.map(
			webhook({
				id: 'ORDE_6',
				reference_id: null,
				created_at: '2026-07-10T12:00:00-03:00',
				charges: [
					{
						id: 'CHAR_6',
						reference_id: null,
						status: 'PAID',
						created_at: '2026-07-10T12:00:05-03:00',
						paid_at: '2026-07-10T12:00:06-03:00',
						amount: { value: 29900, currency: 'BRL' },
						payment_method: { type: 'CREDIT_CARD', installments: 1, card: null },
						payment_response: null,
					},
				],
				qr_codes: null,
			}),
		)

		expect(events).toEqual([])
	})

	it('no-ops when the invoice/owner cannot be resolved from reference_id', async () => {
		const events = await mapper.map(
			webhook({
				id: 'ORDE_7',
				reference_id: 'unknown_invoice',
				created_at: '2026-07-10T12:00:00-03:00',
				charges: [
					{
						id: 'CHAR_7',
						reference_id: null,
						status: 'PAID',
						created_at: '2026-07-10T12:00:05-03:00',
						paid_at: '2026-07-10T12:00:06-03:00',
						amount: { value: 29900, currency: 'BRL' },
						payment_method: { type: 'CREDIT_CARD', installments: 1, card: null },
						payment_response: null,
					},
				],
				qr_codes: null,
			}),
		)

		expect(events).toEqual([])
	})

	it('no-ops on a schema-invalid payload (never crashes the ingest)', async () => {
		const events = await mapper.map(webhook({ not: 'a valid PagBank order' }))
		expect(events).toEqual([])
	})
})
