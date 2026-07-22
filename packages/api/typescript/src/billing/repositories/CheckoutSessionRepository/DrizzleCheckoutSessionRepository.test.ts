// DrizzleCheckoutSessionRepository.test.ts — insert/find/save/list surface for the CheckoutSession
// aggregate (DrizzleChargeRepository.test.ts mold).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { CheckoutSessionRepository } from './CheckoutSessionRepository'
import { CheckoutSession } from '../../entities'
import { BillingPlatform, CheckoutIntent, CheckoutSessionStatus } from '@template/contracts-typescript/wire/enums'

describe('DrizzleCheckoutSessionRepository', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let repo: CheckoutSessionRepository

	const OWNER = 'owner-checkout-session-repo'

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OWNER })
		repo = testBed.resolve(CheckoutSessionRepository)
	})

	beforeEach(async () => {
		await testBed.reset()
	})

	afterAll(async () => {
		await testBed.destroy()
	})

	it('inserts a new session and finds it by sessionRef', async () => {
		const session = CheckoutSession.create({
			sessionRef: 'cs_by_ref',
			ownerId: OWNER,
			platform: BillingPlatform.STRIPE,
			intent: CheckoutIntent.PAYMENT,
			engineInvoiceId: 'inv_by_ref',
		})

		await repo.insert(session)

		const found = await repo.findBySessionRef('cs_by_ref')
		expect(found).toBeDefined()
		expect(found!.id.value).toBe(session.id.value)
		expect(found!.ownerId.value).toBe(OWNER)
		expect(found!.platform).toBe(BillingPlatform.STRIPE)
		expect(found!.intent).toBe(CheckoutIntent.PAYMENT)
		expect(found!.engineInvoiceId?.value).toBe('inv_by_ref')
		expect(found!.status).toBe(CheckoutSessionStatus.PENDING)
		expect(found!.expiresAt).toBeUndefined()
	})

	it('returns undefined for a non-existent sessionRef', async () => {
		const found = await repo.findBySessionRef('does-not-exist')
		expect(found).toBeUndefined()
	})

	it('inserts a SETUP session with no engineInvoiceId and a future expiresAt', async () => {
		const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
		const session = CheckoutSession.create({
			sessionRef: 'cs_setup',
			ownerId: OWNER,
			platform: BillingPlatform.PAGARME,
			intent: CheckoutIntent.SETUP,
			expiresAt,
		})

		await repo.insert(session)

		const found = await repo.findBySessionRef('cs_setup')
		expect(found).toBeDefined()
		expect(found!.engineInvoiceId).toBeUndefined()
		expect(found!.expiresAt?.getTime()).toBe(expiresAt.getTime())
	})

	it('round-trips a status transition to COMPLETED', async () => {
		const session = CheckoutSession.create({
			sessionRef: 'cs_complete',
			ownerId: OWNER,
			platform: BillingPlatform.STRIPE,
			intent: CheckoutIntent.PAYMENT,
			engineInvoiceId: 'inv_complete',
		})
		await repo.insert(session)

		session.complete()
		await repo.save(session)

		const found = await repo.findBySessionRef('cs_complete')
		expect(found!.status).toBe(CheckoutSessionStatus.COMPLETED)
		expect(found!.version).toBeGreaterThan(1)
	})

	it('round-trips a status transition to EXPIRED', async () => {
		const session = CheckoutSession.create({
			sessionRef: 'cs_expire',
			ownerId: OWNER,
			platform: BillingPlatform.PAGARME,
			intent: CheckoutIntent.PAYMENT,
			engineInvoiceId: 'inv_expire',
		})
		await repo.insert(session)

		session.expire()
		await repo.save(session)

		const found = await repo.findBySessionRef('cs_expire')
		expect(found!.status).toBe(CheckoutSessionStatus.EXPIRED)
	})

	it('listStalePending returns only PENDING sessions minted before the cutoff, oldest first', async () => {
		const old = CheckoutSession.create({
			sessionRef: 'cs_stale_old',
			ownerId: OWNER,
			platform: BillingPlatform.STRIPE,
			intent: CheckoutIntent.PAYMENT,
			engineInvoiceId: 'inv_stale_old',
			mintedAt: new Date(Date.now() - 60 * 60 * 1000),
		})
		const recent = CheckoutSession.create({
			sessionRef: 'cs_stale_recent',
			ownerId: OWNER,
			platform: BillingPlatform.STRIPE,
			intent: CheckoutIntent.PAYMENT,
			engineInvoiceId: 'inv_stale_recent',
			mintedAt: new Date(),
		})
		const completed = CheckoutSession.create({
			sessionRef: 'cs_stale_completed',
			ownerId: OWNER,
			platform: BillingPlatform.STRIPE,
			intent: CheckoutIntent.PAYMENT,
			engineInvoiceId: 'inv_stale_completed',
			mintedAt: new Date(Date.now() - 60 * 60 * 1000),
		})
		completed.complete()

		await repo.insert(old)
		await repo.insert(recent)
		await repo.insert(completed)
		await repo.save(completed)

		const cutoff = new Date(Date.now() - 30 * 60 * 1000)
		const stale = await repo.listStalePending(cutoff)

		expect(stale.map(s => s.sessionRef)).toEqual(['cs_stale_old'])
	})

	it('findPendingByInvoiceId returns the PENDING session for an engine invoice, ignoring completed ones', async () => {
		const pending = CheckoutSession.create({
			sessionRef: 'cs_pending_for_invoice',
			ownerId: OWNER,
			platform: BillingPlatform.PAGARME,
			intent: CheckoutIntent.PAYMENT,
			engineInvoiceId: 'inv_probe',
		})
		await repo.insert(pending)

		const found = await repo.findPendingByInvoiceId('inv_probe')
		expect(found).toBeDefined()
		expect(found!.sessionRef).toBe('cs_pending_for_invoice')

		found!.complete()
		await repo.save(found!)

		const afterComplete = await repo.findPendingByInvoiceId('inv_probe')
		expect(afterComplete).toBeUndefined()
	})
})
