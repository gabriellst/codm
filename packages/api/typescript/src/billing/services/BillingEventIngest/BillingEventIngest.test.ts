// BillingEventIngest.test.ts — the single ingest of external billing facts: the
// claim(WEBHOOK_<SOURCE>:externalId) + outbox loop shared by the webhook path and the
// window-reconciliation sweep. Ported from medscall's BillingEventIngest.test.ts, extended with
// the invoice-level / subscription-level External events (B3) flowing through the same loop.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, testId } from '@test/support'
import { BillingEventIngest } from './BillingEventIngest'
import { BillingWebhookSource } from '@billing/enums'
import { ExternalChargeRefundedEvent } from '@billing/events/ExternalChargeRefundedEvent'
import { ExternalInvoicePaidEvent } from '@billing/events/ExternalInvoicePaidEvent'
import { ExternalSubscriptionCanceledEvent } from '@billing/events/ExternalSubscriptionCanceledEvent'
import { BaseError } from '@template/core-typescript'

describe('BillingEventIngest', () => {
	let testBed: TestBed, testContainer: DependencyContainer, ingest: BillingEventIngest
	const OWNER = 'o1'

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OWNER })
		ingest = testBed.resolve(BillingEventIngest)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	// Deterministic ids (bp-18: testId, no literals). entity_id is TEXT — engine-minted ids
	// ('native:<owner>:<ms>') persist as-is; see the regression case below.
	const INVOICE_ID = testId('billing', 'ingest', 'invoice')

	const refundEvent = (externalId: string, engineInvoiceId = INVOICE_ID) =>
		new ExternalChargeRefundedEvent({
			entityId: engineInvoiceId,
			ownerId: OWNER,
			payload: {
				externalId,
				ownerId: OWNER,
				engineInvoiceId,
				amountCents: 500,
				gatewayTxId: `gw_${externalId}`,
			},
		})

	it("REGRESSION: an engine-minted TEXT entityId ('native:<owner>:<ms>') persists — entity_id is text, not uuid", async () => {
		const engineId = `native:${OWNER}:1721000000000`
		const accepted = await ingest.ingest(BillingWebhookSource.STRIPE, [refundEvent('evt_native', engineId)])
		expect(accepted).toBe(1)
		const rows = await testBed.probe().outboxRows({ ownerId: OWNER })
		expect(rows).toHaveLength(1)
		expect(rows[0]?.entityId).toBe(engineId)
	})

	it('first ingest of 2 events accepts both and writes 2 outbox rows', async () => {
		const events = [refundEvent('evt_1'), refundEvent('evt_2')]

		const accepted = await ingest.ingest(BillingWebhookSource.STRIPE, events)

		expect(accepted).toBe(2)
		const rows = await testBed.probe().outboxRows({ ownerId: OWNER })
		expect(rows).toHaveLength(2)
	})

	it('re-ingesting the same events (same externalIds, same source) is a no-op — accepted 0, zero new outbox rows', async () => {
		const events = [refundEvent('evt_1'), refundEvent('evt_2')]
		await ingest.ingest(BillingWebhookSource.STRIPE, events)

		const rowsAfterFirst = await testBed.probe().outboxRows({ ownerId: OWNER })
		expect(rowsAfterFirst).toHaveLength(2)

		const accepted = await ingest.ingest(BillingWebhookSource.STRIPE, events)

		expect(accepted).toBe(0)
		const rowsAfterSecond = await testBed.probe().outboxRows({ ownerId: OWNER })
		expect(rowsAfterSecond).toHaveLength(2)
	})

	it('the same externalId on a DIFFERENT source does not collide — both get accepted', async () => {
		// Different engineInvoiceId keeps the two events' content-hash ids distinct (see
		// DrizzleDomainEventRepository fixture note) — only `externalId` (the idempotency key) is
		// shared, which is exactly what this test exercises.
		const stripeEvent = refundEvent('evt_shared', testId('billing', 'ingest', 'stripe-leg'))
		const pagarMeEvent = refundEvent('evt_shared', testId('billing', 'ingest', 'pagarme-leg'))

		const stripeAccepted = await ingest.ingest(BillingWebhookSource.STRIPE, [stripeEvent])
		const pagarMeAccepted = await ingest.ingest(BillingWebhookSource.PAGARME, [pagarMeEvent])

		expect(stripeAccepted).toBe(1)
		expect(pagarMeAccepted).toBe(1)
	})

	it('ingests the invoice-level and subscription-level External events (B3) through the same claim + outbox loop', async () => {
		const subscriptionId = testId('billing', 'ingest', 'subscription')
		const events = [
			new ExternalInvoicePaidEvent({
				entityId: INVOICE_ID,
				ownerId: OWNER,
				payload: { externalId: 'evt_inv_paid', ownerId: OWNER, engineInvoiceId: INVOICE_ID, amountCents: 29900 },
			}),
			new ExternalSubscriptionCanceledEvent({
				entityId: subscriptionId,
				ownerId: OWNER,
				payload: { externalId: 'evt_sub_canceled', ownerId: OWNER, engineSubscriptionId: subscriptionId },
			}),
		]

		const accepted = await ingest.ingest(BillingWebhookSource.STRIPE, events)

		expect(accepted).toBe(2)
		const rows = await testBed.probe().outboxRows({ ownerId: OWNER })
		expect(rows).toHaveLength(2)

		// Redelivery of the same facts is a no-op.
		expect(await ingest.ingest(BillingWebhookSource.STRIPE, events)).toBe(0)
	})

	it('handle() is unreachable — invoking it via execute() throws a named BaseError, never a bare Error', async () => {
		expect.assertions(2)
		try {
			await ingest.execute({})
		} catch (error) {
			expect(error).toBeInstanceOf(BaseError)
			expect((error as BaseError).name).toBe('NOT_IMPLEMENTED')
		}
	})
})
