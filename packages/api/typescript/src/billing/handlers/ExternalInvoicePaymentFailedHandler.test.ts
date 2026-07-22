// ExternalInvoicePaymentFailedHandler.test.ts — the invoice-level failure relay's settled-invoice
// guard (B3). Production sources: StripeWebhookMapper (invoice.payment_failed, Stripe Billing).
// The gateway is the source of truth for collection — the handler must IGNORE a failure for an
// already-collected (derived PAID) invoice: never flip it OVERDUE or dun the owner for money we
// already have. For a genuinely unpaid invoice it records the FIRST failure (dunning entry) and
// emits InvoicePaymentFailedEvent. Ported from medscall's ExternalInvoicePaymentFailedHandler.test.ts.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, testId } from '@test/support'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { ExternalInvoicePaymentFailedHandler } from './ExternalInvoicePaymentFailedHandler'
import { ExternalInvoicePaymentFailedEvent } from '@billing/events/ExternalInvoicePaymentFailedEvent'
import { InvoicePaymentFailedEvent } from '@billing/events/InvoicePaymentFailedEvent'
import { InvoiceRepository, ChargeRepository } from '@billing/repositories'
import { Invoice, Charge } from '@billing/entities'
import { InvoiceLineKind } from '@billing/enums/InvoiceLineKind'
import { BillingPlatform, PaymentMethodType } from '@template/contracts-typescript/wire/enums'

describe('ExternalInvoicePaymentFailedHandler (settled-invoice guard)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	const OWNER = 'o1'

	const buildEvent = (invoiceId: string) =>
		new ExternalInvoicePaymentFailedEvent({
			entityId: invoiceId,
			ownerId: OWNER,
			payload: {
				externalId: `${invoiceId}:invoice.payment_failed`,
				ownerId: OWNER,
				engineInvoiceId: invoiceId,
				reason: 'GATEWAY_INVOICE_PAYMENT_FAILED:in_1',
			},
		})

	const seedInvoice = async (invoiceId: string) => {
		await testBed.resolve(InvoiceRepository).insert(
			Invoice.issue({
				invoiceId,
				ownerId: OWNER,
				ourNumber: 'INV-000001',
				number: 'INV-0001',
				amountCents: 29900,
				currency: CurrencyCode.BRL,
				description: `Fatura ${invoiceId}`,
				lineItems: [{ kind: InvoiceLineKind.SUBSCRIPTION, description: 'Subscription', amountCents: 29900 }],
			}),
		)
	}

	// "Paid" is DERIVED from a SUCCEEDED charge fact (what the settlement handlers leave on every
	// path), not the invoice's stored status — so the guard needs a real charge, not just a flag.
	const seedSucceededCharge = async (invoiceId: string) => {
		const charge = Charge.create({
			ownerId: OWNER,
			invoiceId,
			platform: BillingPlatform.PAGARME,
			method: PaymentMethodType.CARD,
			amountCents: 29900,
			attemptNo: 0,
		})
		charge.markSucceeded('gw_settled')
		await testBed.resolve(ChargeRepository).save(charge)
	}

	const failureEvents = async (invoiceId: string) => {
		const rows = await testBed.probe().persistedEvents({ name: InvoicePaymentFailedEvent.name })
		return rows.filter(r => (r.payload as { invoiceId?: string }).invoiceId === invoiceId)
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

	it('IGNORES a gateway failure relay for an already-PAID invoice — no InvoicePaymentFailedEvent', async () => {
		const invoiceId = testId('billing', 'invoice-failed', 'paid')
		await seedInvoice(invoiceId)
		await seedSucceededCharge(invoiceId) // the settlement fact the deriver reads → derives PAID

		await testBed.resolve(ExternalInvoicePaymentFailedHandler).handle(buildEvent(invoiceId))

		expect(await failureEvents(invoiceId)).toHaveLength(0)
	})

	it('processes a genuine failure for a PENDING invoice — records the first FAILED charge and emits InvoicePaymentFailedEvent', async () => {
		const invoiceId = testId('billing', 'invoice-failed', 'pending')
		await seedInvoice(invoiceId) // no charge, no due date → derives PENDING

		await testBed.resolve(ExternalInvoicePaymentFailedHandler).handle(buildEvent(invoiceId))

		expect(await failureEvents(invoiceId)).toHaveLength(1)
		// The recorded FAILED fact is what lets the invoice enter dunning (listDunningCandidates).
		const charges = await testBed.resolve(ChargeRepository).listByInvoiceId(invoiceId)
		expect(charges).toHaveLength(1)
	})

	it('defers entirely (no latch burn, no failure event) when the invoice is not mirrored yet — out-of-order delivery', async () => {
		const invoiceId = testId('billing', 'invoice-failed', 'unmirrored')

		await testBed.resolve(ExternalInvoicePaymentFailedHandler).handle(buildEvent(invoiceId))

		expect(await failureEvents(invoiceId)).toHaveLength(0)
		expect(await testBed.resolve(ChargeRepository).listByInvoiceId(invoiceId)).toHaveLength(0)
	})

	it('is idempotent — redelivery does not append a second failure event', async () => {
		const invoiceId = testId('billing', 'invoice-failed', 'redelivered')
		await seedInvoice(invoiceId)

		const event = buildEvent(invoiceId)
		await testBed.resolve(ExternalInvoicePaymentFailedHandler).handle(event)
		await testBed.resolve(ExternalInvoicePaymentFailedHandler).handle(event)

		expect(await failureEvents(invoiceId)).toHaveLength(1)
	})
})
