// Acceptance tests for the billing pause-slice wiring spec
// (.specs/2026-06-10-billing-pause-slice-wiring.md). Authored by the feature-loop
// VERIFIER — the skill-evals harness injects this file at
// packages/api/typescript/src/billing/handlers/ExternalSubscriptionUpdatedHandler.paused.test.ts.
// It is RED at the task's base ref (SubscriptionTransition.PAUSED does not exist yet)
// and goes green exactly when spec Decisions 1–3 land:
//
//   AC1 — KiwifyWebhookMapper maps a `subscription_paused` webhook for a known
//         subscription to exactly one ExternalSubscriptionUpdatedEvent with
//         transition PAUSED (unit, MockSubscriptionRepository — mirrors
//         KiwifyWebhookMapper.test.ts).
//   AC2 — ExternalSubscriptionUpdatedHandler on transition PAUSED with an EXISTING
//         subscription: aggregate becomes inactive AND exactly one
//         SubscriptionPausedEvent row is persisted (integration TestBed).
//   AC3 — transition PAUSED with NO matching subscription: no throw, no save, no event.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, testId, givenSubscription } from '@test/support'
import { DomainEventRepository } from '@template/core-typescript'
import { BillingPlatform, PlanPeriod, PlanTier } from '@template/contracts-typescript/wire/enums'
import { ExternalSubscriptionUpdatedEvent } from '../events'
import { Subscription } from '../entities/Subscription'
import { SubscriptionRepository, MockSubscriptionRepository } from '../repositories/SubscriptionRepository'
import { KiwifyWebhookMapper } from '../services/KiwifyWebhookMapper'
import { ExternalSubscriptionUpdatedHandler } from './ExternalSubscriptionUpdatedHandler'
import { SubscriptionTransition } from '../enums'

const USER_ID = testId('user', '1')
const EXTERNAL_ID = 'kiwify_sub_paused_001'

describe('SubscriptionTransition — PAUSED (Decision 1)', () => {
	it('declares the PAUSED member', () => {
		expect(SubscriptionTransition.PAUSED).toBeDefined()
		expect(String(SubscriptionTransition.PAUSED)).toBe('PAUSED')
	})
})

// ─── AC1 — Kiwify mapper: subscription_paused → transition PAUSED ──────────
// Mirrors the fixture + mock-repo mechanics of KiwifyWebhookMapper.test.ts.

function asRequest(body: Record<string, unknown>): Request {
	return new Request('https://api.example.com/billing/webhooks/kiwify?signature=x', {
		method: 'POST',
		body: JSON.stringify(body),
	})
}

function makeWebhook(webhookEventType: string): Record<string, unknown> {
	return {
		order_id: 'order_001',
		order_ref: 'ref_001',
		order_status: 'paid',
		payment_method: 'credit_card',
		store_id: 'store_001',
		payment_merchant_id: 'merchant_001',
		installments: 1,
		sale_type: 'one_time',
		created_at: '2026-06-01T10:00:00.000Z',
		updated_at: '2026-06-01T10:00:00.000Z',
		webhook_event_type: webhookEventType,
		Product: {
			product_id: 'product_001',
			product_name: 'Plano 1 mensal',
		},
		Customer: {
			full_name: 'Alice',
			first_name: 'Alice',
			email: 'alice@example.com',
			mobile: '+5511999999999',
			ip: '127.0.0.1',
		},
		Commissions: {
			charge_amount: 19900,
			product_base_price: 19900,
			product_base_price_currency: 'BRL',
			kiwify_fee: 1000,
			kiwify_fee_currency: 'BRL',
			commissioned_stores: [],
			currency: 'BRL',
			my_commission: 18900,
			funds_status: 'completed',
		},
		TrackingParameters: { s1: USER_ID },
		checkout_link: 'https://kiwify.com.br/...',
		subscription_id: EXTERNAL_ID,
		Subscription: {
			start_date: '2026-06-01T10:00:00.000Z',
			next_payment: '2026-07-01T10:00:00.000Z',
			status: 'paused',
			customer_access: { has_access: false, active_period: false, access_until: null },
			plan: { id: 'plan_001', name: 'Plano 1 mensal', frequency: 'monthly', qty_charges: 12 },
			charges: { completed: [], future: [] },
		},
	}
}

describe('KiwifyWebhookMapper — subscription_paused (AC1, Decision 2)', () => {
	it('maps a subscription_paused webhook for a known subscription to exactly one PAUSED event', async () => {
		const repo = new MockSubscriptionRepository()
		repo.seed(
			Subscription.create({
				userId: USER_ID,
				platform: BillingPlatform.KIWIFY,
				externalSubscriptionId: EXTERNAL_ID,
				tier: PlanTier.BASIC,
				period: PlanPeriod.MONTHLY,
			}),
		)

		const out = await new KiwifyWebhookMapper(repo).map(asRequest(makeWebhook('subscription_paused')))

		expect(out).toHaveLength(1)
		expect(out[0]).toBeInstanceOf(ExternalSubscriptionUpdatedEvent)
		const evt = out[0] as ExternalSubscriptionUpdatedEvent
		expect(evt.payload.transition).toBe(SubscriptionTransition.PAUSED)
		expect(evt.payload).toMatchObject({
			externalId: EXTERNAL_ID,
			platform: BillingPlatform.KIWIFY,
			tier: PlanTier.BASIC,
		})
		// Same payload shape as CANCELLED/OVERDUE — no userId/period on the pause branch.
		expect(evt.payload.userId).toBeUndefined()
		expect(evt.payload.period).toBeUndefined()
	})
})

// ─── AC2 / AC3 — dispatcher owns the pause (Decision 3) ────────────────────
// Mirrors the TestBed + given mechanics of ExternalSubscriptionUpdatedHandler.test.ts.

describe('ExternalSubscriptionUpdatedHandler — transition PAUSED (AC2/AC3, Decision 3)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let handler: ExternalSubscriptionUpdatedHandler
	let subscriptionRepo: SubscriptionRepository
	let eventsRepo: DomainEventRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		handler = testBed.resolve(ExternalSubscriptionUpdatedHandler)
		subscriptionRepo = testBed.resolve(SubscriptionRepository)
		eventsRepo = testBed.resolve(DomainEventRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	function makePausedEvent(): ExternalSubscriptionUpdatedEvent {
		return new ExternalSubscriptionUpdatedEvent({
			entityId: EXTERNAL_ID,
			ownerId: USER_ID,
			payload: {
				externalId: EXTERNAL_ID,
				platform: BillingPlatform.KIWIFY,
				tier: PlanTier.BASIC,
				transition: SubscriptionTransition.PAUSED,
			},
		}) as ExternalSubscriptionUpdatedEvent
	}

	async function countSaved(eventName: string): Promise<number> {
		const { items } = await eventsRepo.findByOwnerIdAndNameLike(USER_ID, 'billing.%', { limit: 100, offset: 0 })
		return items.filter(e => e.name === eventName).length
	}

	it('AC2: pauses the existing aggregate and persists exactly one SubscriptionPausedEvent', async () => {
		await givenSubscription(testBed, {
			userId: USER_ID,
			platform: BillingPlatform.KIWIFY,
			externalSubscriptionId: EXTERNAL_ID,
			tier: PlanTier.BASIC,
			period: PlanPeriod.MONTHLY,
		})

		await handler.execute(makePausedEvent())

		const sub = await subscriptionRepo.findByPlatformAndExternalId(BillingPlatform.KIWIFY, EXTERNAL_ID)
		expect(sub).toBeDefined()
		expect(sub?.isActive).toBe(false)
		expect(await countSaved('billing.subscription.paused')).toBe(1)
	})

	it('AC3: PAUSED with no matching subscription — no throw, no save, no event', async () => {
		// Must resolve (out-of-order tolerance) — a throw fails this await.
		await handler.execute(makePausedEvent())

		expect(await countSaved('billing.subscription.paused')).toBe(0)
		const sub = await subscriptionRepo.findByPlatformAndExternalId(BillingPlatform.KIWIFY, EXTERNAL_ID)
		expect(sub).toBeFalsy()
	})
})
