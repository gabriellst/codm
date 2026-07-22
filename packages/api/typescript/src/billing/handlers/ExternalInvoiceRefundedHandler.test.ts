// ExternalInvoiceRefundedHandler.test.ts — the invoice-level refund/void (B3). Production sources:
// AsaasWebhookMapper (PAYMENT_DELETED / PAYMENT_RECEIVED_IN_CASH_UNDONE) and StripeWebhookMapper
// (invoice.voided). The handler books an immutable full-amount REFUND credit note — no status flip:
// the DERIVED status (InvoiceStatusDeriver) reads Σ credit notes and yields REFUNDED. Ported from
// medscall's ExternalRefundHandlers.test.ts (invoice-level section).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, testId } from '@test/support'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { ExternalInvoiceRefundedHandler } from './ExternalInvoiceRefundedHandler'
import { ExternalInvoiceRefundedEvent } from '@billing/events/ExternalInvoiceRefundedEvent'
import { InvoiceRepository, CreditNoteRepository, ChargeRepository } from '@billing/repositories'
import { InvoiceStatusDeriver } from '@billing/services'
import { Invoice, Charge } from '@billing/entities'
import { InvoiceStatus } from '@billing/enums/InvoiceStatus'
import { InvoiceLineKind } from '@billing/enums/InvoiceLineKind'
import { BillingPlatform, CreditNoteReason, PaymentMethodType } from '@template/contracts-typescript/wire/enums'

describe('ExternalInvoiceRefundedHandler → full credit note → derived status', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	const OWNER = 'o1'
	// UUID — the shared events table indexes entityId as uuid (bp-18: testId, no hardcoded literals).
	const INVOICE_ID = testId('billing', 'invoice', 'external-refunded')
	const AMOUNT_CENTS = 29900

	const seedInvoice = async (invoiceId = INVOICE_ID) => {
		await testBed.resolve(InvoiceRepository).insert(
			Invoice.issue({
				invoiceId,
				ownerId: OWNER,
				ourNumber: 'INV-000001',
				number: 'INV-001',
				amountCents: AMOUNT_CENTS,
				currency: CurrencyCode.BRL,
				lineItems: [{ kind: InvoiceLineKind.SUBSCRIPTION, description: 'Subscription', amountCents: AMOUNT_CENTS }],
			}),
		)
	}

	const seedSucceededCharge = async (invoiceId = INVOICE_ID) => {
		const charge = Charge.create({
			ownerId: OWNER,
			invoiceId,
			platform: BillingPlatform.PAGARME,
			method: PaymentMethodType.CARD,
			amountCents: AMOUNT_CENTS,
			attemptNo: 0,
		})
		charge.markSucceeded('gw_settled')
		await testBed.resolve(ChargeRepository).save(charge)
	}

	const invoiceRefundEvent = (externalId = 'evt_refund_1') =>
		new ExternalInvoiceRefundedEvent({
			entityId: INVOICE_ID,
			ownerId: OWNER,
			payload: { externalId, ownerId: OWNER, engineInvoiceId: INVOICE_ID },
		})

	const derivedStatus = async (invoiceId = INVOICE_ID) => {
		const invoice = await testBed.resolve(InvoiceRepository).findByEngineInvoiceId(invoiceId)
		return (
			await testBed
				.resolve(InvoiceStatusDeriver)
				.derive({ invoiceId: invoice!.id.value, amountCents: invoice!.amountCents, dueDate: invoice!.dueDate }, new Date())
		).status
	}

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OWNER })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('ExternalInvoiceRefunded (no amount) → full-invoice REFUND credit note → derived REFUNDED', async () => {
		await seedInvoice()
		await seedSucceededCharge()

		await testBed.resolve(ExternalInvoiceRefundedHandler).handle(invoiceRefundEvent())

		expect(await testBed.resolve(CreditNoteRepository).sumByInvoiceId(INVOICE_ID)).toBe(AMOUNT_CENTS)
		const cn = await testBed.resolve(CreditNoteRepository).findByInvoiceAndGatewayRef(INVOICE_ID, 'evt_refund_1')
		expect(cn?.reason).toBe(CreditNoteReason.REFUND)
		expect(await derivedStatus()).toBe(InvoiceStatus.REFUNDED)
	})

	it('is idempotent — a re-delivered invoice refund records only ONE credit note (INVOICE_EVENT guard)', async () => {
		await seedInvoice()
		await seedSucceededCharge()

		await testBed.resolve(ExternalInvoiceRefundedHandler).handle(invoiceRefundEvent())
		await testBed.resolve(ExternalInvoiceRefundedHandler).handle(invoiceRefundEvent('evt_refund_redelivered'))

		expect(await testBed.resolve(CreditNoteRepository).sumByInvoiceId(INVOICE_ID)).toBe(AMOUNT_CENTS)
	})

	it('no-ops when no invoice exists — no credit note recorded', async () => {
		await testBed.resolve(ExternalInvoiceRefundedHandler).handle(invoiceRefundEvent())

		expect(await testBed.resolve(CreditNoteRepository).sumByInvoiceId(INVOICE_ID)).toBe(0)
	})
})
