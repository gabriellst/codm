import type { Transaction } from '@template/core-typescript'
import { Subscription } from '../../entities'
import { PlanName, SubscriptionStatus } from '@template/contracts-typescript/wire/enums'

/**
 * Read + write surface for our owned Subscription record (`billing_subscriptions`, keyed by
 * ownerId). `save` persists the aggregate; the lifecycle writes (`activate`/`markPastDue`/`cancel`/
 * `changePlan`) are intention-revealing operations the maintenance handlers + ChangePlan call, so
 * neither the handlers nor the record carry status logic.
 */
export abstract class SubscriptionRepository {
	abstract findByOwnerId(ownerId: string, tx?: Transaction): Promise<Subscription | null>
	/** Every subscription currently in `status` — the renewal clock's sweep (ACTIVE). */
	abstract listByStatus(status: SubscriptionStatus, tx?: Transaction): Promise<Subscription[]>
	/**
	 * Subscriptions due for renewal at `now` — the native clock's sweep: an ACTIVE row whose
	 * currentPeriodEnd has passed, OR a TRIALING row whose trialEnd has passed.
	 */
	abstract listRenewalDue(now: Date, tx?: Transaction): Promise<Subscription[]>
	/** Persist the aggregate (insert-or-update), version-guarded — throws OPTIMISTIC_LOCK_CONFLICT on a stale write. */
	abstract save(subscription: Subscription, tx?: Transaction): Promise<Subscription>
	/** → ACTIVE; pass currentPeriodEnd to advance the access window (omit to leave it). */
	abstract activate(ownerId: string, currentPeriodEnd?: Date | null, tx?: Transaction): Promise<void>
	/** → PAST_DUE (dunning). */
	abstract markPastDue(ownerId: string, tx?: Transaction): Promise<void>
	/** → CANCELED. */
	abstract cancel(ownerId: string, tx?: Transaction): Promise<void>
	/**
	 * Finalize a SCHEDULED cancellation at the period boundary → CANCELED, CONDITIONALLY: the update
	 * only fires while the row is still `cancel_at_period_end = true AND canceled_at IS NOT NULL` (and
	 * non-terminal), so a `ResumeSubscription` that committed since the clock's snapshot is not blindly
	 * re-cancelled. Preserves the request-time `canceledAt` (unlike `cancel`, which stamps now).
	 * Returns true iff a row was finalized.
	 */
	abstract finalizeCancellation(ownerId: string, tx?: Transaction): Promise<boolean>
	/** Reflect a paid-plan swap (status unchanged). */
	abstract changePlan(ownerId: string, planName: PlanName, tx?: Transaction): Promise<void>
	/** Record (or clear, with null) the plan to switch to at the next renewal. */
	abstract setScheduledPlan(ownerId: string, planName: PlanName | null, tx?: Transaction): Promise<void>

	// Batch siblings for the period-close sweep (the billing clock processes a chunk of owners per
	// tx). Same per-row conditional semantics as the single-owner methods — the condition lives in
	// SQL, so a row that no longer qualifies is skipped, never clobbered.

	/** `finalizeCancellation` over many owners in ONE statement. Returns the ownerIds actually finalized. */
	abstract finalizeCancellationMany(ownerIds: string[], tx?: Transaction): Promise<string[]>
	/**
	 * Apply each owner's OWN pending scheduled plan atomically: `plan_name = scheduled_plan_name`,
	 * schedule cleared, in ONE self-referential statement — the row's CURRENT scheduled value is the
	 * source, never the sweep's snapshot, so a CancelScheduledDowngrade (or a paid ChangePlan, which
	 * clears the schedule) committed since the sweep read the due list is NOT clobbered: the row
	 * simply no longer matches and is skipped. Returns the owners actually applied with the plan each
	 * one landed on (the sweep prices the renewal base and announces from THIS set).
	 */
	abstract applyScheduledPlanMany(ownerIds: string[], tx?: Transaction): Promise<{ ownerId: string; planName: PlanName }[]>
}
