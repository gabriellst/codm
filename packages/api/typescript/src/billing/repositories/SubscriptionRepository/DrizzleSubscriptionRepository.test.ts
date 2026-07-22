// DrizzleSubscriptionRepository.test.ts — basic persistence cycle for the owned Subscription
// record (upsert -> findByOwnerId round-trip -> listByStatus -> listRenewalDue ->
// cancel/changePlan/setScheduledPlan) + the optimistic-lock guard across BOTH write styles
// (find→mutate→save AND the targeted conditional updates).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { SubscriptionRepository } from './SubscriptionRepository'
import { Subscription } from '../../entities'
import { PlanName, SubscriptionStatus } from '@template/contracts-typescript/wire/enums'

describe('DrizzleSubscriptionRepository', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let repo: SubscriptionRepository

	const OWNER = 'owner-subscription-repo'

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OWNER })
		repo = testBed.resolve(SubscriptionRepository)
	})

	beforeEach(async () => {
		await testBed.reset()
	})

	afterAll(async () => {
		await testBed.destroy()
	})

	it('upserts a subscription and round-trips it via findByOwnerId', async () => {
		const periodStart = new Date('2026-01-01T00:00:00.000Z')
		const periodEnd = new Date('2026-02-01T00:00:00.000Z')

		await repo.save(
			Subscription.create({
				ownerId: OWNER,
				engineSubscriptionId: 'sub_roundtrip',
				planName: PlanName.PRO,
				status: SubscriptionStatus.ACTIVE,
				currentPeriodStart: periodStart,
				currentPeriodEnd: periodEnd,
				cancelAtPeriodEnd: true,
				scheduledPlanName: PlanName.STARTER,
			}),
		)

		const found = await repo.findByOwnerId(OWNER)
		expect(found).not.toBeNull()
		expect(found!.ownerId).toBe(OWNER)
		expect(found!.engineSubscriptionId).toBe('sub_roundtrip')
		expect(found!.planName).toBe(PlanName.PRO)
		expect(found!.status).toBe(SubscriptionStatus.ACTIVE)
		expect(found!.currentPeriodStart?.toISOString()).toBe(periodStart.toISOString())
		expect(found!.currentPeriodEnd?.toISOString()).toBe(periodEnd.toISOString())
		expect(found!.trialEnd).toBeNull()
		expect(found!.canceledAt).toBeNull()
		expect(found!.cancelAtPeriodEnd).toBe(true)
		expect(found!.scheduledPlanName).toBe(PlanName.STARTER)
	})

	it('updates the row in place via find→mutate→save (no duplicate, version-carried)', async () => {
		await repo.save(
			Subscription.create({
				ownerId: OWNER,
				engineSubscriptionId: 'sub_v1',
				planName: PlanName.STARTER,
				status: SubscriptionStatus.TRIALING,
				trialEnd: new Date('2026-01-15T00:00:00.000Z'),
			}),
		)

		// Canonical in-place update: load (carries the row's version) → mutate → save. A blind upsert of a
		// FRESH entity would now (correctly) conflict — that's the next test.
		const loaded = await repo.findByOwnerId(OWNER)
		loaded!.resubscribe({
			engineSubscriptionId: 'sub_v2',
			planName: PlanName.PRO,
			status: SubscriptionStatus.ACTIVE,
			currentPeriodStart: null,
			currentPeriodEnd: null,
			trialEnd: null,
		})
		await repo.save(loaded!)

		const found = await repo.findByOwnerId(OWNER)
		expect(found!.engineSubscriptionId).toBe('sub_v2')
		expect(found!.planName).toBe(PlanName.PRO)
		expect(found!.status).toBe(SubscriptionStatus.ACTIVE)
	})

	it('optimistic lock: a stale save (loaded then someone else wrote) throws OPTIMISTIC_LOCK_CONFLICT', async () => {
		await repo.save(
			Subscription.create({ ownerId: OWNER, engineSubscriptionId: 'sub_v1', planName: PlanName.PRO, status: SubscriptionStatus.ACTIVE }),
		)

		// Two readers load the same row (same version).
		const readerA = await repo.findByOwnerId(OWNER)
		const readerB = await repo.findByOwnerId(OWNER)

		// A writes first — succeeds, bumps the stored version.
		readerA!.changePlan(PlanName.STARTER)
		await repo.save(readerA!)

		// B now holds a stale version → its save must conflict (instead of clobbering A's change).
		readerB!.changePlan(PlanName.PRO)
		await expect(repo.save(readerB!)).rejects.toMatchObject({ name: 'OPTIMISTIC_LOCK_CONFLICT' })

		// A's change stands.
		expect((await repo.findByOwnerId(OWNER))!.planName).toBe(PlanName.STARTER)
	})

	it('optimistic lock: a TARGETED update (markPastDue) bumps version → a concurrent stale save conflicts', async () => {
		await repo.save(
			Subscription.create({ ownerId: OWNER, engineSubscriptionId: 'sub_v1', planName: PlanName.PRO, status: SubscriptionStatus.ACTIVE }),
		)
		const reader = await repo.findByOwnerId(OWNER) // version N

		// A targeted conditional update (a webhook/job path) mutates the row + bumps version.
		await repo.markPastDue(OWNER)

		// The stale reader's save must now conflict — proving targeted updates participate in the guard.
		reader!.changePlan(PlanName.STARTER)
		await expect(repo.save(reader!)).rejects.toMatchObject({ name: 'OPTIMISTIC_LOCK_CONFLICT' })
	})

	it('findByOwnerId returns null when there is no subscription for the owner', async () => {
		const found = await repo.findByOwnerId('owner-with-no-subscription')
		expect(found).toBeNull()
	})

	it('listByStatus returns every subscription currently in that status', async () => {
		await repo.save(
			Subscription.create({
				ownerId: 'owner-active-1',
				engineSubscriptionId: 'sub_active_1',
				planName: PlanName.PRO,
				status: SubscriptionStatus.ACTIVE,
			}),
		)
		await repo.save(
			Subscription.create({
				ownerId: 'owner-active-2',
				engineSubscriptionId: 'sub_active_2',
				planName: PlanName.STARTER,
				status: SubscriptionStatus.ACTIVE,
			}),
		)
		await repo.save(
			Subscription.create({
				ownerId: 'owner-trialing-1',
				engineSubscriptionId: 'sub_trialing_1',
				planName: PlanName.PRO,
				status: SubscriptionStatus.TRIALING,
			}),
		)

		const active = await repo.listByStatus(SubscriptionStatus.ACTIVE)
		const ownerIds = active.map(s => s.ownerId).sort()
		expect(ownerIds).toEqual(['owner-active-1', 'owner-active-2'])
	})

	it('listRenewalDue returns ACTIVE rows past currentPeriodEnd and TRIALING rows past trialEnd', async () => {
		const past = new Date(Date.now() - 24 * 60 * 60 * 1000)
		const future = new Date(Date.now() + 24 * 60 * 60 * 1000)

		await repo.save(
			Subscription.create({
				ownerId: 'owner-active-due',
				engineSubscriptionId: 'sub_active_due',
				planName: PlanName.PRO,
				status: SubscriptionStatus.ACTIVE,
				currentPeriodEnd: past,
			}),
		)
		await repo.save(
			Subscription.create({
				ownerId: 'owner-active-not-due',
				engineSubscriptionId: 'sub_active_not_due',
				planName: PlanName.PRO,
				status: SubscriptionStatus.ACTIVE,
				currentPeriodEnd: future,
			}),
		)
		await repo.save(
			Subscription.create({
				ownerId: 'owner-trialing-due',
				engineSubscriptionId: 'sub_trialing_due',
				planName: PlanName.STARTER,
				status: SubscriptionStatus.TRIALING,
				trialEnd: past,
			}),
		)

		const due = await repo.listRenewalDue(new Date())
		const ownerIds = due.map(s => s.ownerId).sort()
		expect(ownerIds).toEqual(['owner-active-due', 'owner-trialing-due'])
	})

	it('cancel() sets status to CANCELED', async () => {
		await repo.save(
			Subscription.create({
				ownerId: OWNER,
				engineSubscriptionId: 'sub_to_cancel',
				planName: PlanName.PRO,
				status: SubscriptionStatus.ACTIVE,
			}),
		)

		await repo.cancel(OWNER)

		const found = await repo.findByOwnerId(OWNER)
		expect(found!.status).toBe(SubscriptionStatus.CANCELED)
	})

	it('changePlan() updates planName without changing status', async () => {
		await repo.save(
			Subscription.create({
				ownerId: OWNER,
				engineSubscriptionId: 'sub_to_change_plan',
				planName: PlanName.STARTER,
				status: SubscriptionStatus.ACTIVE,
			}),
		)

		await repo.changePlan(OWNER, PlanName.PRO)

		const found = await repo.findByOwnerId(OWNER)
		expect(found!.planName).toBe(PlanName.PRO)
		expect(found!.status).toBe(SubscriptionStatus.ACTIVE)
	})

	it('setScheduledPlan() records and clears the scheduled downgrade/upgrade', async () => {
		await repo.save(
			Subscription.create({
				ownerId: OWNER,
				engineSubscriptionId: 'sub_scheduled_plan',
				planName: PlanName.PRO,
				status: SubscriptionStatus.ACTIVE,
			}),
		)

		await repo.setScheduledPlan(OWNER, PlanName.STARTER)
		expect((await repo.findByOwnerId(OWNER))!.scheduledPlanName).toBe(PlanName.STARTER)

		await repo.setScheduledPlan(OWNER, null)
		expect((await repo.findByOwnerId(OWNER))!.scheduledPlanName).toBeNull()
	})

	it('finalizeCancellationMany finalizes only still-scheduled rows and returns exactly those owners', async () => {
		const seed = (ownerId: string, opts: { scheduled: boolean }) =>
			repo.save(
				Subscription.create({
					ownerId,
					engineSubscriptionId: `sub_${ownerId}`,
					planName: PlanName.PRO,
					status: SubscriptionStatus.ACTIVE,
					cancelAtPeriodEnd: opts.scheduled,
					canceledAt: opts.scheduled ? new Date() : null,
				}),
			)
		await seed('fin-a', { scheduled: true })
		await seed('fin-b', { scheduled: false }) // "resumed" since the sweep's snapshot — must not finalize
		await seed('fin-c', { scheduled: true })

		const finalized = await repo.finalizeCancellationMany(['fin-a', 'fin-b', 'fin-c'])

		expect(finalized.sort()).toEqual(['fin-a', 'fin-c'])
		expect((await repo.findByOwnerId('fin-a'))!.status).toBe(SubscriptionStatus.CANCELED)
		expect((await repo.findByOwnerId('fin-b'))!.status).toBe(SubscriptionStatus.ACTIVE) // untouched
		expect((await repo.findByOwnerId('fin-c'))!.status).toBe(SubscriptionStatus.CANCELED)
		expect(await repo.finalizeCancellationMany([])).toEqual([]) // empty is a no-op
	})

	it("applyScheduledPlanMany applies each row's OWN scheduled plan (self-referential) and skips concurrent cancels", async () => {
		const seed = (ownerId: string, scheduled: PlanName | null) =>
			repo.save(
				Subscription.create({
					ownerId,
					engineSubscriptionId: `sub_${ownerId}`,
					planName: PlanName.PRO,
					status: SubscriptionStatus.ACTIVE,
					scheduledPlanName: scheduled,
				}),
			)
		await seed('apl-a', PlanName.STARTER)
		await seed('apl-b', PlanName.FREE)
		// The downgrade was cancelled AFTER the sweep's snapshot — the row no longer has a schedule;
		// the conditional statement must skip it, never clobber.
		await seed('apl-c', PlanName.STARTER)
		await repo.setScheduledPlan('apl-c', null)

		const applied = await repo.applyScheduledPlanMany(['apl-a', 'apl-b', 'apl-c'])

		// Returns exactly who applied, with the plan each one LANDED on (source: the row itself).
		expect(applied.map(a => a.ownerId).sort()).toEqual(['apl-a', 'apl-b'])
		expect(new Map(applied.map(a => [a.ownerId, a.planName])).get('apl-a')).toBe(PlanName.STARTER)
		expect(new Map(applied.map(a => [a.ownerId, a.planName])).get('apl-b')).toBe(PlanName.FREE)

		const a = (await repo.findByOwnerId('apl-a'))!
		const b = (await repo.findByOwnerId('apl-b'))!
		const c = (await repo.findByOwnerId('apl-c'))!
		expect(a.planName).toBe(PlanName.STARTER)
		expect(a.scheduledPlanName).toBeNull()
		expect(b.planName).toBe(PlanName.FREE)
		expect(b.scheduledPlanName).toBeNull()
		// The concurrent cancel won: plan untouched.
		expect(c.planName).toBe(PlanName.PRO)
		expect(c.scheduledPlanName).toBeNull()
		expect(await repo.applyScheduledPlanMany([])).toEqual([]) // empty is a no-op
	})
})
