import { injectable } from 'tsyringe-neo'
import { BaseError } from '@template/core-typescript'
import type { BaseInfrastructureErrors, Transaction } from '@template/core-typescript'

import { Subscription } from '../../entities'
import { SubscriptionRepository } from './SubscriptionRepository'
import { PlanName, SubscriptionStatus } from '@template/contracts-typescript/wire/enums'

@injectable()
export class MockSubscriptionRepository extends SubscriptionRepository {
	// Keyed by ownerId (the entity id). Stores its own copy; reads hand back fresh copies so callers
	// can't mutate the store except through the lifecycle writes below.
	private rows = new Map<string, Subscription>()

	// Rehydrate via the constructor (mirrors the Drizzle toDomain) so the stored `version` is preserved
	// — the optimistic-lock parity below depends on find→mutate→save carrying the right previous version.
	private static copy(sub: Subscription): Subscription {
		return new Subscription({
			id: sub.id.value,
			engineSubscriptionId: sub.engineSubscriptionId,
			planName: sub.planName,
			status: sub.status,
			currentPeriodStart: sub.currentPeriodStart,
			currentPeriodEnd: sub.currentPeriodEnd,
			trialEnd: sub.trialEnd,
			canceledAt: sub.canceledAt,
			cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
			scheduledPlanName: sub.scheduledPlanName,
			version: sub.version,
		})
	}

	async findByOwnerId(ownerId: string, _tx?: Transaction): Promise<Subscription | null> {
		const row = this.rows.get(ownerId)
		return row ? MockSubscriptionRepository.copy(row) : null
	}

	async listByStatus(status: SubscriptionStatus, _tx?: Transaction): Promise<Subscription[]> {
		return [...this.rows.values()].filter(row => row.status === status).map(row => MockSubscriptionRepository.copy(row))
	}

	async listRenewalDue(now: Date, _tx?: Transaction): Promise<Subscription[]> {
		return [...this.rows.values()]
			.filter(row => {
				const activeDue =
					row.status === SubscriptionStatus.ACTIVE && row.currentPeriodEnd != null && row.currentPeriodEnd.getTime() <= now.getTime()
				const trialDue = row.status === SubscriptionStatus.TRIALING && row.trialEnd != null && row.trialEnd.getTime() <= now.getTime()
				return activeDue || trialDue
			})
			.map(row => MockSubscriptionRepository.copy(row))
	}

	// Version-guarded (parity with DrizzleSubscriptionRepository.save → saveWithOptimisticLock): bump
	// the entity's version, then insert-or-update ONLY when the stored row's version still equals the one
	// this entity was loaded with — else throw OPTIMISTIC_LOCK_CONFLICT, exactly like the Drizzle path.
	async save(sub: Subscription, _tx?: Transaction): Promise<Subscription> {
		const previousVersion = sub.version
		sub.incrementVersion()
		const existing = this.rows.get(sub.id.value)
		if (existing && existing.version !== previousVersion) {
			throw new BaseError<BaseInfrastructureErrors>(
				'OPTIMISTIC_LOCK_CONFLICT',
				`Optimistic lock conflict: subscription ${sub.id.value} was modified concurrently (expected version ${previousVersion})`,
			)
		}
		this.rows.set(sub.id.value, MockSubscriptionRepository.copy(sub))
		return sub
	}

	async activate(ownerId: string, currentPeriodEnd?: Date | null, _tx?: Transaction): Promise<void> {
		const row = this.rows.get(ownerId)
		if (!row) return
		if (Subscription.isTerminalStatus(row.status)) return
		row.status = SubscriptionStatus.ACTIVE
		if (currentPeriodEnd !== undefined) row.currentPeriodEnd = currentPeriodEnd
		row.incrementVersion() // parity with the SQL version+1 on every targeted update
	}

	async markPastDue(ownerId: string, _tx?: Transaction): Promise<void> {
		const row = this.rows.get(ownerId)
		if (!row) return
		if (Subscription.isTerminalStatus(row.status)) return
		row.status = SubscriptionStatus.PAST_DUE
		row.incrementVersion()
	}

	async cancel(ownerId: string, _tx?: Transaction): Promise<void> {
		const row = this.rows.get(ownerId)
		if (!row) return
		// Parity with DrizzleSubscriptionRepository.cancel: terminal rows don't re-transition.
		if (Subscription.isTerminalStatus(row.status)) return
		row.status = SubscriptionStatus.CANCELED
		row.canceledAt = new Date()
		row.incrementVersion()
	}

	async finalizeCancellation(ownerId: string, _tx?: Transaction): Promise<boolean> {
		const row = this.rows.get(ownerId)
		if (!row) return false
		// Parity with the Drizzle conditional: only a still-scheduled, non-terminal cancellation finalizes;
		// a resumed sub (cleared canceledAt/cancelAtPeriodEnd) is skipped. Preserves canceledAt.
		if (!row.cancelAtPeriodEnd || row.canceledAt == null || Subscription.isTerminalStatus(row.status)) return false
		row.status = SubscriptionStatus.CANCELED
		row.incrementVersion()
		return true
	}

	async changePlan(ownerId: string, planName: PlanName, _tx?: Transaction): Promise<void> {
		const row = this.rows.get(ownerId)
		if (!row) return
		row.planName = planName
		row.incrementVersion()
	}

	async setScheduledPlan(ownerId: string, planName: PlanName | null, _tx?: Transaction): Promise<void> {
		const row = this.rows.get(ownerId)
		if (!row) return
		row.scheduledPlanName = planName
		row.incrementVersion()
	}

	// Batch siblings — fold over the single-owner methods (same per-row conditional semantics).

	async finalizeCancellationMany(ownerIds: string[], tx?: Transaction): Promise<string[]> {
		const finalized: string[] = []
		for (const ownerId of ownerIds) {
			if (await this.finalizeCancellation(ownerId, tx)) finalized.push(ownerId)
		}
		return finalized
	}

	async applyScheduledPlanMany(ownerIds: string[], _tx?: Transaction): Promise<{ ownerId: string; planName: PlanName }[]> {
		const applied: { ownerId: string; planName: PlanName }[] = []
		for (const ownerId of ownerIds) {
			const row = this.rows.get(ownerId)
			// Parity with the Drizzle conditional: only a still-scheduled, non-terminal row applies —
			// a concurrently-cancelled schedule (scheduledPlanName null) is skipped, never clobbered.
			if (!row?.scheduledPlanName || Subscription.isTerminalStatus(row.status)) continue
			row.planName = row.scheduledPlanName
			row.scheduledPlanName = null
			row.incrementVersion()
			applied.push({ ownerId, planName: row.planName })
		}
		return applied
	}

	clear(): void {
		this.rows.clear()
	}
}
