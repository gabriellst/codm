// ExternalInvoicePaidHandler.test.ts — the invoice-level settle (B3). The event's production
// sources are AsaasWebhookMapper (PAYMENT_DUNNING_RECEIVED — out-of-band dunning recovery) and
// StripeWebhookMapper (invoice.paid, Stripe Billing): the payment was recorded out-of-band, so
// there is no gateway charge attempt of ours — the handler settles the invoice with a synthetic
// `engine:<externalId>` charge ref. Ported from medscall's EngineInvoiceHandlers.test.ts
// (ExternalInvoicePaidHandler section).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, testId } from '@test/support'
import { ExternalInvoicePaidHandler } from './ExternalInvoicePaidHandler'
import { ExternalInvoicePaidEvent } from '@billing/events/ExternalInvoicePaidEvent'
import { InvoicePaidEvent } from '@billing/events/InvoicePaidEvent'
import { ChargeRepository } from '@billing/repositories'
import { ChargeStatus } from '@template/contracts-typescript/wire/enums'

describe('ExternalInvoicePaidHandler (invoice-level settle)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	const OWNER = 'o1'
	// UUID — the shared events table indexes entityId as uuid (bp-18: testId, no hardcoded literals).
	const ENGINE_INVOICE_ID = testId('billing', 'invoice', 'external-paid')

	const buildPaidEvent = () =>
		new ExternalInvoicePaidEvent({
			entityId: ENGINE_INVOICE_ID,
			ownerId: OWNER,
			payload: {
				externalId: 'evt_paid_1',
				ownerId: OWNER,
				engineInvoiceId: ENGINE_INVOICE_ID,
				amountCents: 29900,
			},
		})

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

	it('saves InvoicePaidEvent exactly once, deduped on redelivery', async () => {
		const event = buildPaidEvent()
		await testBed.resolve(ExternalInvoicePaidHandler).handle(event)
		await testBed.resolve(ExternalInvoicePaidHandler).handle(event)

		const invoicePaidRows = await testBed.probe().persistedEvents({ name: InvoicePaidEvent.name })
		expect(invoicePaidRows.length).toBe(1)
	})

	it('leaves a SUCCEEDED charge fact (synthetic engine: gateway ref) so a derived PAID read holds', async () => {
		const repo = testBed.resolve(ChargeRepository)
		// No prior charge on this path (payment recorded out-of-band) — the handler creates one.
		await testBed.resolve(ExternalInvoicePaidHandler).handle(buildPaidEvent())

		const succeeded = await repo.findSucceededByInvoiceId(ENGINE_INVOICE_ID)
		expect(succeeded?.status).toBe(ChargeStatus.SUCCEEDED)
		expect(succeeded?.gatewayTxId).toBe('engine:evt_paid_1')
		expect(succeeded?.attemptNo).toBe(0)
	})

	it('is idempotent — re-dispatching does not add a second charge', async () => {
		const event = buildPaidEvent()
		await testBed.resolve(ExternalInvoicePaidHandler).handle(event)
		await testBed.resolve(ExternalInvoicePaidHandler).handle(event)

		const all = await testBed.resolve(ChargeRepository).listByInvoiceId(ENGINE_INVOICE_ID)
		expect(all).toHaveLength(1)
	})
})
