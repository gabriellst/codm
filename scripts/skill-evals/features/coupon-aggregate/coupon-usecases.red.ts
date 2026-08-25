// Acceptance tests (INTEGRATION) for the Sales coupon aggregate spec
// (.specs/2026-06-10-sales-coupon-aggregate.md). Authored by the feature-loop
// VERIFIER — the skill-evals harness injects this file at
// packages/api/typescript/src/sales/usecases/coupon-acceptance.test.ts
// (the builder's own colocated CreateCoupon.test.ts / DeactivateCoupon.test.ts
// per D15 live alongside; this file is the verifier's verdict).
// RED at base: CreateCoupon/DeactivateCoupon/Coupon/CouponRepository do not exist.
//
//   AC10 — duplicate code per store (case/whitespace-insensitive) →
//          COUPON_CODE_ALREADY_EXISTS with NO partial state; same code in
//          another store succeeds.
//   AC11 — CreateCoupon persists the coupon row AND exactly one
//          'sales.coupon.created' event (primitive/ISO payload), one tx.
//   AC12 — DeactivateCoupon persists status INACTIVE AND one
//          'sales.coupon.deactivated' event, one tx.
//   AC13 — unknown couponId OR another store's coupon → COUPON_NOT_FOUND
//          (no cross-tenant existence leak), no event.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenStore, testId } from '@test/support'
import { DomainEventRepository } from '@codm/core-typescript'
import { Coupon } from '../entities/Coupon'
import { CouponStatus, CouponType } from '../enums'
import { CouponCreatedEvent, CouponDeactivatedEvent } from '../events'
import { CouponRepository } from '../repositories/CouponRepository'
import { CreateCoupon } from './CreateCoupon'
import { DeactivateCoupon } from './DeactivateCoupon'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('Coupon use cases (US1/US2)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let createCoupon: CreateCoupon
	let deactivateCoupon: DeactivateCoupon
	let couponRepo: CouponRepository
	let domainEvents: DomainEventRepository
	let storeA: string
	let storeB: string

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		createCoupon = testBed.resolve(CreateCoupon)
		deactivateCoupon = testBed.resolve(DeactivateCoupon)
		couponRepo = testBed.resolve(CouponRepository)
		domainEvents = testBed.resolve(DomainEventRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
		storeA = (await givenStore(testBed)).id.value
		storeB = (await givenStore(testBed)).id.value
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	/** Seed a persisted coupon repo-direct (given rule: never via another use case). */
	async function seedCoupon(
		overrides: Partial<{ storeId: string; code: string; type: CouponType; value: number; status: CouponStatus }> = {},
	): Promise<Coupon> {
		const coupon = Coupon.create({
			storeId: overrides.storeId ?? storeA,
			code: overrides.code ?? 'SAVE10',
			type: overrides.type ?? CouponType.PERCENTAGE,
			value: overrides.value ?? 10,
		})
		if (overrides.status === CouponStatus.INACTIVE) coupon.deactivate()
		await couponRepo.save(coupon)
		return coupon
	}

	// ─── CreateCoupon (US1, AC10/AC11) ──────────────────────────────────────

	describe('CreateCoupon', () => {
		it('AC11: persists the coupon AND exactly one sales.coupon.created event — same transaction', async () => {
			const out = await createCoupon.execute({
				storeId: storeA,
				code: ' save10 ',
				type: CouponType.PERCENTAGE,
				value: 10,
			})

			expect(out.couponId).toMatch(UUID_RE)

			// Entity write visible…
			const saved = await couponRepo.findById(out.couponId)
			expect(saved).toBeDefined()
			expect(saved?.code).toBe('SAVE10')
			expect(saved?.status).toBe(CouponStatus.ACTIVE)
			expect(saved?.type).toBe(CouponType.PERCENTAGE)
			expect(saved?.value).toBe(10)
			expect(saved?.storeId.value).toBe(storeA)

			// …and the use-case-born event row, persisted via domainEventRepository
			// in the SAME tx (D9 — tx threading is double-checked by grep + judge).
			const events = await domainEvents.findByType(CouponCreatedEvent)
			expect(events).toHaveLength(1)
			expect(events[0]!.payload).toMatchObject({
				couponId: out.couponId,
				storeId: storeA,
				code: 'SAVE10',
				type: CouponType.PERCENTAGE,
				value: 10,
			})
			expect(events[0]!.payload.expiresAt).toBeUndefined()
		})

		it('AC11: carries expiresAt in the created event as an ISO datetime string', async () => {
			const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

			const out = await createCoupon.execute({
				storeId: storeA,
				code: 'XMAS',
				type: CouponType.FIXED_AMOUNT,
				value: 500,
				expiresAt: future.toISOString(),
			})

			const saved = await couponRepo.findById(out.couponId)
			expect(saved?.expiresAt).toBeInstanceOf(Date)
			expect(saved?.expiresAt?.getTime()).toBe(future.getTime())

			const events = await domainEvents.findByType(CouponCreatedEvent)
			expect(events).toHaveLength(1)
			expect(typeof events[0]!.payload.expiresAt).toBe('string')
			expect(new Date(events[0]!.payload.expiresAt as string).getTime()).toBe(future.getTime())
		})

		it('AC10: a duplicate code in the same store (case/whitespace-insensitive) throws COUPON_CODE_ALREADY_EXISTS and leaves NO partial state', async () => {
			const existing = await seedCoupon({ code: 'SAVE10' }) // repo-direct: no event rows exist yet

			await expect(
				createCoupon.execute({ storeId: storeA, code: ' save10 ', type: CouponType.FIXED_AMOUNT, value: 500 }),
			).rejects.toMatchObject({ name: 'COUPON_CODE_ALREADY_EXISTS' })

			// TRANSACTION: the rejected command leaves no partial state —
			// no event row was persisted…
			expect(await domainEvents.findByType(CouponCreatedEvent)).toHaveLength(0)
			// …and the surviving row is still the seeded coupon, untouched.
			const survivor = await couponRepo.findByCode(storeA, 'SAVE10')
			expect(survivor?.id.value).toBe(existing.id.value)
			expect(survivor?.type).toBe(CouponType.PERCENTAGE)
			expect(survivor?.value).toBe(10)
		})

		it('AC10: the same code in another store succeeds', async () => {
			await seedCoupon({ storeId: storeA, code: 'SAVE10' })

			const out = await createCoupon.execute({ storeId: storeB, code: 'save10', type: CouponType.PERCENTAGE, value: 25 })

			const saved = await couponRepo.findById(out.couponId)
			expect(saved?.storeId.value).toBe(storeB)
			expect(saved?.code).toBe('SAVE10')
			expect(await domainEvents.findByType(CouponCreatedEvent)).toHaveLength(1) // only the use-case-born one
		})
	})

	// ─── DeactivateCoupon (US2, AC12/AC13) ──────────────────────────────────

	describe('DeactivateCoupon', () => {
		it('AC12: persists status INACTIVE AND exactly one sales.coupon.deactivated event — same transaction', async () => {
			const coupon = await seedCoupon()

			await deactivateCoupon.execute({ storeId: storeA, couponId: coupon.id.value })

			const reloaded = await couponRepo.findById(coupon.id.value)
			expect(reloaded?.status).toBe(CouponStatus.INACTIVE)

			const events = await domainEvents.findByType(CouponDeactivatedEvent)
			expect(events).toHaveLength(1)
			expect(events[0]!.payload).toMatchObject({
				couponId: coupon.id.value,
				storeId: storeA,
				code: 'SAVE10',
			})
		})

		it('AC13: an unknown couponId throws COUPON_NOT_FOUND and persists no event', async () => {
			// ERR-VOCAB: assert the typed CODE, never the message.
			await expect(deactivateCoupon.execute({ storeId: storeA, couponId: testId() })).rejects.toMatchObject({
				name: 'COUPON_NOT_FOUND',
			})

			expect(await domainEvents.findByType(CouponDeactivatedEvent)).toHaveLength(0)
		})

		it("AC13: another store's coupon reads as COUPON_NOT_FOUND — same code as pure missing, no existence leak", async () => {
			const coupon = await seedCoupon({ storeId: storeA })

			await expect(deactivateCoupon.execute({ storeId: storeB, couponId: coupon.id.value })).rejects.toMatchObject({
				name: 'COUPON_NOT_FOUND',
			})

			// The foreign tenant changed nothing: still ACTIVE, no event.
			const reloaded = await couponRepo.findById(coupon.id.value)
			expect(reloaded?.status).toBe(CouponStatus.ACTIVE)
			expect(await domainEvents.findByType(CouponDeactivatedEvent)).toHaveLength(0)
		})

		it('persists NO event when the entity guard rejects the transition (already INACTIVE)', async () => {
			// EVENT-EMISSION: focus is the no-event-on-rejected-transition contract —
			// the guard itself is covered by the entity unit tests (D7/AC8).
			const coupon = await seedCoupon({ status: CouponStatus.INACTIVE })

			await expect(deactivateCoupon.execute({ storeId: storeA, couponId: coupon.id.value })).rejects.toMatchObject({
				name: 'COUPON_ALREADY_INACTIVE',
			})

			expect(await domainEvents.findByType(CouponDeactivatedEvent)).toHaveLength(0)
		})
	})
})
