import { describe, it, expect } from 'bun:test'
import { Subscription } from './Subscription'
import { PlanName, SubscriptionStatus } from '@template/contracts-typescript/wire/enums'

const build = (status: SubscriptionStatus): Subscription =>
	Subscription.create({
		ownerId: 'owner-1',
		engineSubscriptionId: 'sub_1',
		planName: PlanName.PRO,
		status,
		currentPeriodEnd: null,
	})

describe('Subscription aggregate — transitionTo', () => {
	it('allows INCOMPLETE → ACTIVE (normal path)', () => {
		const subscription = build(SubscriptionStatus.INCOMPLETE)

		const result = subscription.transitionTo(SubscriptionStatus.ACTIVE)

		expect(result).toEqual({ status: SubscriptionStatus.ACTIVE, changed: true })
		expect(subscription.status).toBe(SubscriptionStatus.ACTIVE)
	})

	it('blocks leaving CANCELED (terminal, no-op)', () => {
		const subscription = build(SubscriptionStatus.CANCELED)

		const result = subscription.transitionTo(SubscriptionStatus.ACTIVE)

		expect(result).toEqual({ status: SubscriptionStatus.CANCELED, changed: false })
		expect(subscription.status).toBe(SubscriptionStatus.CANCELED)
	})

	it('blocks leaving INCOMPLETE_EXPIRED (terminal, no-op)', () => {
		const subscription = build(SubscriptionStatus.INCOMPLETE_EXPIRED)

		const result = subscription.transitionTo(SubscriptionStatus.PAST_DUE)

		expect(result).toEqual({ status: SubscriptionStatus.INCOMPLETE_EXPIRED, changed: false })
		expect(subscription.status).toBe(SubscriptionStatus.INCOMPLETE_EXPIRED)
	})

	it('reports changed=false when the target equals the current status', () => {
		const subscription = build(SubscriptionStatus.ACTIVE)

		const result = subscription.transitionTo(SubscriptionStatus.ACTIVE)

		expect(result).toEqual({ status: SubscriptionStatus.ACTIVE, changed: false })
	})

	it('treats TRIALING as non-terminal', () => {
		expect(Subscription.isTerminalStatus(SubscriptionStatus.TRIALING)).toBe(false)
	})

	it('allows TRIALING → ACTIVE (trial converts to a paying subscription)', () => {
		const subscription = build(SubscriptionStatus.TRIALING)

		const result = subscription.transitionTo(SubscriptionStatus.ACTIVE)

		expect(result).toEqual({ status: SubscriptionStatus.ACTIVE, changed: true })
		expect(subscription.status).toBe(SubscriptionStatus.ACTIVE)
	})
})

describe('Subscription — scheduledPlanName', () => {
	it('defaults scheduledPlanName to null and round-trips a set value', () => {
		const none = Subscription.create({ ownerId: 'o', engineSubscriptionId: 's', planName: PlanName.PRO, status: SubscriptionStatus.ACTIVE })
		expect(none.scheduledPlanName).toBeNull()
		const scheduled = Subscription.create({
			ownerId: 'o',
			engineSubscriptionId: 's',
			planName: PlanName.PRO,
			status: SubscriptionStatus.ACTIVE,
			scheduledPlanName: PlanName.STARTER,
		})
		expect(scheduled.scheduledPlanName).toBe(PlanName.STARTER)
	})
})

describe('Subscription — changePlan (invariant: blocked when scheduled for cancellation)', () => {
	it('flips planName and clears any pending scheduledPlanName', () => {
		const subscription = Subscription.create({
			ownerId: 'owner-1',
			engineSubscriptionId: 'sub_1',
			planName: PlanName.PRO,
			status: SubscriptionStatus.ACTIVE,
			scheduledPlanName: PlanName.STARTER,
		})

		subscription.changePlan(PlanName.STARTER)

		expect(subscription.planName).toBe(PlanName.STARTER)
		expect(subscription.scheduledPlanName).toBeNull()
	})

	it('throws SUBSCRIPTION_PENDING_CANCELLATION when cancelAtPeriodEnd is true', () => {
		const subscription = Subscription.create({
			ownerId: 'owner-1',
			engineSubscriptionId: 'sub_1',
			planName: PlanName.PRO,
			status: SubscriptionStatus.ACTIVE,
			cancelAtPeriodEnd: true,
		})

		expect(() => subscription.changePlan(PlanName.STARTER)).toThrow(expect.objectContaining({ name: 'SUBSCRIPTION_PENDING_CANCELLATION' }))
		expect(subscription.planName).toBe(PlanName.PRO)
	})
})

describe('Subscription — scheduleDowngrade (invariant: blocked when scheduled for cancellation)', () => {
	it('sets scheduledPlanName without touching the current planName', () => {
		const subscription = Subscription.create({
			ownerId: 'owner-1',
			engineSubscriptionId: 'sub_1',
			planName: PlanName.PRO,
			status: SubscriptionStatus.ACTIVE,
		})

		subscription.scheduleDowngrade(PlanName.STARTER)

		expect(subscription.planName).toBe(PlanName.PRO)
		expect(subscription.scheduledPlanName).toBe(PlanName.STARTER)
	})

	it('throws SUBSCRIPTION_PENDING_CANCELLATION when cancelAtPeriodEnd is true', () => {
		const subscription = Subscription.create({
			ownerId: 'owner-1',
			engineSubscriptionId: 'sub_1',
			planName: PlanName.PRO,
			status: SubscriptionStatus.ACTIVE,
			cancelAtPeriodEnd: true,
		})

		expect(() => subscription.scheduleDowngrade(PlanName.STARTER)).toThrow(
			expect.objectContaining({ name: 'SUBSCRIPTION_PENDING_CANCELLATION' }),
		)
		expect(subscription.scheduledPlanName).toBeNull()
	})
})

describe('Subscription — resumeScheduledCancellation', () => {
	it('clears BOTH cancelAtPeriodEnd and canceledAt when a cancellation is scheduled', () => {
		const subscription = Subscription.create({
			ownerId: 'owner-1',
			engineSubscriptionId: 'sub_1',
			planName: PlanName.PRO,
			status: SubscriptionStatus.ACTIVE,
			cancelAtPeriodEnd: true,
			canceledAt: new Date(),
		})

		subscription.resumeScheduledCancellation()

		expect(subscription.cancelAtPeriodEnd).toBe(false)
		expect(subscription.canceledAt).toBeNull()
	})

	it('throws SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION when nothing is scheduled', () => {
		const subscription = Subscription.create({
			ownerId: 'owner-1',
			engineSubscriptionId: 'sub_1',
			planName: PlanName.PRO,
			status: SubscriptionStatus.ACTIVE,
			cancelAtPeriodEnd: false,
		})

		expect(() => subscription.resumeScheduledCancellation()).toThrow(
			expect.objectContaining({ name: 'SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION' }),
		)
	})

	// Revenue-defect guard ("the zombie of Resume post-finalization"): finalizeCancellationMany
	// sets status=CANCELED but deliberately does NOT clear cancelAtPeriodEnd/canceledAt — so a
	// post-finalization row still reads as "scheduled" to the OLD guard (which only checked
	// cancelAtPeriodEnd). Resuming it would clear the cancellation facts and leave status stuck
	// at the terminal CANCELED while access re-derives ACTIVE forever (free access, no re-billing,
	// and the row falls out of listRenewalDue's ACTIVE/TRIALING scan). The terminal check must run
	// FIRST, before the cancelAtPeriodEnd check, and must NOT mutate any cancellation fact.
	it('throws SUBSCRIPTION_ALREADY_FINALIZED for a terminal (CANCELED) subscription — even with cancelAtPeriodEnd still true from a pre-finalization schedule', () => {
		const canceledAt = new Date()
		const subscription = Subscription.create({
			ownerId: 'owner-1',
			engineSubscriptionId: 'sub_1',
			planName: PlanName.PRO,
			status: SubscriptionStatus.CANCELED,
			cancelAtPeriodEnd: true,
			canceledAt,
		})

		expect(() => subscription.resumeScheduledCancellation()).toThrow(expect.objectContaining({ name: 'SUBSCRIPTION_ALREADY_FINALIZED' }))
		// The guard must not have mutated the cancellation facts on its way to throwing.
		expect(subscription.cancelAtPeriodEnd).toBe(true)
		expect(subscription.canceledAt).toEqual(canceledAt)
		expect(subscription.status).toBe(SubscriptionStatus.CANCELED)
	})

	it('throws SUBSCRIPTION_ALREADY_FINALIZED for a terminal (INCOMPLETE_EXPIRED) subscription', () => {
		const subscription = Subscription.create({
			ownerId: 'owner-1',
			engineSubscriptionId: 'sub_1',
			planName: PlanName.PRO,
			status: SubscriptionStatus.INCOMPLETE_EXPIRED,
			cancelAtPeriodEnd: true,
			canceledAt: new Date(),
		})

		expect(() => subscription.resumeScheduledCancellation()).toThrow(expect.objectContaining({ name: 'SUBSCRIPTION_ALREADY_FINALIZED' }))
	})
})

describe('Subscription — cancel (invariant owned by the entity)', () => {
	const NOW = new Date('2026-07-14T00:00:00Z')

	it('immediate cancel finalizes status to CANCELED + sets facts + preserves scheduledPlanName', () => {
		const subscription = Subscription.create({
			ownerId: 'owner-1',
			engineSubscriptionId: 'sub_1',
			planName: PlanName.PRO,
			status: SubscriptionStatus.ACTIVE,
			scheduledPlanName: PlanName.STARTER, // a pending downgrade must survive
		})

		subscription.cancel(true, NOW)

		expect(subscription.status).toBe(SubscriptionStatus.CANCELED) // finalized (excluded from renewal sweep + unlocks re-subscribe)
		expect(subscription.canceledAt).toBe(NOW)
		expect(subscription.cancelAtPeriodEnd).toBe(false)
		expect(subscription.scheduledPlanName).toBe(PlanName.STARTER) // preserved (in-place mutation)
	})

	it('scheduled cancel keeps status (access holds to boundary) + sets facts', () => {
		const subscription = Subscription.create({
			ownerId: 'owner-1',
			engineSubscriptionId: 'sub_1',
			planName: PlanName.PRO,
			status: SubscriptionStatus.ACTIVE,
		})

		subscription.cancel(false, NOW)

		expect(subscription.status).toBe(SubscriptionStatus.ACTIVE) // NOT finalized — the billing clock does that at the boundary
		expect(subscription.canceledAt).toBe(NOW)
		expect(subscription.cancelAtPeriodEnd).toBe(true)
	})
})

describe('Subscription — resubscribe (restart in place, clears cancellation facts)', () => {
	it('resets to fresh state AND clears canceledAt/cancelAtPeriodEnd/scheduledPlanName, preserving version', () => {
		const subscription = Subscription.create({
			ownerId: 'owner-1',
			engineSubscriptionId: 'old_sub',
			planName: PlanName.PRO,
			status: SubscriptionStatus.CANCELED,
			canceledAt: new Date('2026-07-01T00:00:00Z'),
			cancelAtPeriodEnd: true,
			scheduledPlanName: PlanName.STARTER,
		})
		subscription.incrementVersion() // simulate a loaded row at version 2
		const loadedVersion = subscription.version

		subscription.resubscribe({
			engineSubscriptionId: 'new_sub',
			planName: PlanName.PRO,
			status: SubscriptionStatus.INCOMPLETE,
			currentPeriodStart: new Date('2026-07-14T00:00:00Z'),
			currentPeriodEnd: null,
			trialEnd: null,
		})

		expect(subscription.engineSubscriptionId).toBe('new_sub')
		expect(subscription.planName).toBe(PlanName.PRO)
		expect(subscription.status).toBe(SubscriptionStatus.INCOMPLETE)
		// Cancellation/schedule facts cleared — else the clock would finalize the just-paid sub (R3).
		expect(subscription.canceledAt).toBeNull()
		expect(subscription.cancelAtPeriodEnd).toBe(false)
		expect(subscription.scheduledPlanName).toBeNull()
		// Version preserved (in-place mutation) → the version-guarded save overwrites the loaded row.
		expect(subscription.version).toBe(loadedVersion)
	})
})
