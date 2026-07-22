import { AggregateRoot, BaseError, z } from '@template/core-typescript'
import Z from 'zod'
import { SubscriptionStatus, PlanName } from '@template/contracts-typescript/wire/enums'
import type { DomainErrors } from '../errors'

// OUR owned subscription record — the `billing_subscriptions` row as a proper domain entity.
// Identity is the owner: the table PK is `owner_id`, used verbatim AS the entity's `id` —
// `entity.id.value` IS the ownerId, there is no separate generated id and no `ownerId` field on
// the schema.
//
// The stored `status` is kept as a HINT (used by `listRenewalDue` + the re-subscribe guard); the
// AUTHORITATIVE status is DERIVED from facts (paid-through invoices + cancellation) via
// SubscriptionAccessDeriver — "derive, don't flip".
export const SubscriptionSchema = z.object({
	engineSubscriptionId: z.string().min(1),
	planName: z.enum(PlanName),
	status: z.enum(SubscriptionStatus),
	// Open-period anchor (derived access) — the start of the currently-open period.
	currentPeriodStart: z.date().nullable(),
	currentPeriodEnd: z.date().nullable(),
	// Trial anchor (native clock) — when a TRIALING subscription is first due for renewal.
	trialEnd: z.date().nullable(),
	// Cancellation facts. `canceledAt` records when a cancellation took effect;
	// `cancelAtPeriodEnd` flags one scheduled for the current period's end.
	canceledAt: z.date().nullable(),
	cancelAtPeriodEnd: z.boolean(),
	// Scheduled paid→paid downgrade — the plan applied at the next renewal, or null.
	scheduledPlanName: z.enum(PlanName).nullable(),
})

export type SubscriptionProps = Z.infer<typeof SubscriptionSchema>

export class Subscription extends AggregateRoot<typeof SubscriptionSchema> {
	static override schema = SubscriptionSchema

	/**
	 * Create a fresh subscription (version 1). The `ownerId` (the `billing_subscriptions` PK — a NATURAL
	 * key) is used verbatim as the entity's `id`, so there is no generated id: `create` for this aggregate
	 * is a deterministic-id construction. Rehydration from the DB goes through the CONSTRUCTOR (carrying
	 * the stored version), never this factory — see DrizzleSubscriptionRepository.toDomain.
	 */
	static create(data: {
		ownerId: string
		engineSubscriptionId: string
		planName: PlanName
		status: SubscriptionStatus
		currentPeriodStart?: Date | null
		currentPeriodEnd?: Date | null
		trialEnd?: Date | null
		canceledAt?: Date | null
		cancelAtPeriodEnd?: boolean
		scheduledPlanName?: PlanName | null
	}): Subscription {
		return new Subscription({
			id: data.ownerId,
			engineSubscriptionId: data.engineSubscriptionId,
			planName: data.planName,
			status: data.status,
			currentPeriodStart: data.currentPeriodStart ?? null,
			currentPeriodEnd: data.currentPeriodEnd ?? null,
			trialEnd: data.trialEnd ?? null,
			canceledAt: data.canceledAt ?? null,
			cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
			scheduledPlanName: data.scheduledPlanName ?? null,
		})
	}

	/** The owner this subscription belongs to — the natural key, stored AS the entity id. */
	get ownerId(): string {
		return this.id.value
	}

	// ── Status rules (statics over the pure SubscriptionStatus wire enum) ─────────────────────
	// The enum is a closed set that lives in contracts (wire); the BEHAVIOUR about it — which
	// statuses are terminal, which grant access, the one transition rule — belongs to the aggregate,
	// not colocated next to the enum. Passed the status as a param so read-side deriver/repo/use-case
	// call sites share one authority (`Subscription.isTerminalStatus(x)`) instead of re-deriving a set.

	/** Terminal (absorbing) statuses — re-subscribing goes through CreateSubscription, not a transition.
	 *  Exposed as data (not only a predicate) so the repo can spread it into a SQL `notInArray` guard. */
	static readonly TERMINAL_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
		SubscriptionStatus.CANCELED,
		SubscriptionStatus.INCOMPLETE_EXPIRED,
	])

	/** Statuses in which the owner actually HOLDS their paid plan's entitlements. INCOMPLETE is excluded
	 *  (the paid plan is granted only once an invoice is PAID); PAST_DUE keeps access during dunning. */
	static readonly ACCESS_GRANTING_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
		SubscriptionStatus.ACTIVE,
		SubscriptionStatus.TRIALING,
		SubscriptionStatus.PAST_DUE,
	])

	/** A subscription in a terminal state is, for access/uniqueness purposes, no subscription at all. */
	static isTerminalStatus(status: SubscriptionStatus): boolean {
		return Subscription.TERMINAL_STATUSES.has(status)
	}

	/** Whether this status grants the paid plan's entitlements. */
	static grantsAccess(status: SubscriptionStatus): boolean {
		return Subscription.ACCESS_GRANTING_STATUSES.has(status)
	}

	/** The ONE status-transition rule: a terminal status is absorbing (returns null — a no-op for the
	 *  caller); every other status can move to any target. */
	static nextStatus(current: SubscriptionStatus, target: SubscriptionStatus): SubscriptionStatus | null {
		if (Subscription.isTerminalStatus(current)) return null
		return target
	}

	// ── State predicates ────────────────────────────────────────────────────────────────────
	// Domain-language questions over the stored status, so call sites read intent
	// (`sub.isTrialing()`) instead of re-deriving `sub.status === SubscriptionStatus.TRIALING`.

	isTrialing(): boolean {
		return this.status === SubscriptionStatus.TRIALING
	}

	isActive(): boolean {
		return this.status === SubscriptionStatus.ACTIVE
	}

	isIncomplete(): boolean {
		return this.status === SubscriptionStatus.INCOMPLETE
	}

	isPastDue(): boolean {
		return this.status === SubscriptionStatus.PAST_DUE
	}

	isCanceled(): boolean {
		return this.status === SubscriptionStatus.CANCELED
	}

	/**
	 * The subscription is awaiting its FIRST real charge — either a fresh non-trial subscribe
	 * (INCOMPLETE, invoiced at subscribe time) or a trial converting at its end (TRIALING, invoiced
	 * by the native clock at `trialEnd`). Both take the vault-first CIT 'first' charge on the stored
	 * card; PAST_DUE is deliberately excluded (a dunning state, not a first charge).
	 */
	awaitsFirstCharge(): boolean {
		return this.isIncomplete() || this.isTrialing()
	}

	/**
	 * The boundary the current period is anchored on for a renewal: a trialing subscription renews at
	 * its `trialEnd`; any other (active) subscription at its `currentPeriodEnd`. Null when neither
	 * anchor is set (the subscription is not yet due — `SubscriptionRepository.listRenewalDue`
	 * guarantees the relevant anchor is present for the rows it returns).
	 */
	renewalAnchor(): Date | null {
		return this.isTrialing() ? this.trialEnd : this.currentPeriodEnd
	}

	/**
	 * Attempts to move the subscription to `target`. A terminal current status
	 * (CANCELED/INCOMPLETE_EXPIRED) absorbs any transition — the call is a no-op. Centralizes the
	 * ONE terminal-status/transition rule (`nextSubscriptionStatus`) so every call site shares the
	 * same guard instead of re-deriving its own terminal set.
	 */
	transitionTo(target: SubscriptionStatus): { status: SubscriptionStatus; changed: boolean } {
		const next = Subscription.nextStatus(this.status, target)
		if (next === null || next === this.status) {
			return { status: this.status, changed: false }
		}
		this.status = next
		return { status: next, changed: true }
	}

	/**
	 * Upgrade/downgrade-now — INVARIANT: refused while a cancellation is scheduled
	 * (`cancelAtPeriodEnd`). Flipping the plan on a subscription that's about to lapse would let the
	 * owner "resurrect" access via a plan switch instead of going through ResumeSubscription first.
	 * An immediate plan change also clears any STALE scheduled downgrade (the new plan supersedes
	 * whatever was queued for the next renewal).
	 */
	changePlan(newPlan: PlanName): void {
		if (this.cancelAtPeriodEnd) {
			throw new BaseError<DomainErrors>('SUBSCRIPTION_PENDING_CANCELLATION')
		}
		this.planName = newPlan
		this.scheduledPlanName = null
	}

	/**
	 * Queue a paid→paid downgrade for the next renewal — same INVARIANT as `changePlan`: refused
	 * while a cancellation is already scheduled (the subscription is on its way out; there is no
	 * "next renewal" to apply the downgrade at).
	 */
	scheduleDowngrade(newPlan: PlanName): void {
		if (this.cancelAtPeriodEnd) {
			throw new BaseError<DomainErrors>('SUBSCRIPTION_PENDING_CANCELLATION')
		}
		this.scheduledPlanName = newPlan
	}

	/**
	 * "Resume subscription" — suspend a pending scheduled cancellation, restoring normal active
	 * state. Clears BOTH `cancelAtPeriodEnd` and `canceledAt`: access is DERIVED from the pair, so a
	 * genuine restore must clear both (leaving `canceledAt` set would still read as a past
	 * cancellation fact to the deriver).
	 *
	 * INVARIANT (terminal guard, checked FIRST): a subscription already finalized to a terminal status
	 * (CANCELED / INCOMPLETE_EXPIRED) can never be "resumed" — `finalizeCancellationMany` sets `status`
	 * to CANCELED at the boundary but deliberately does NOT clear `cancelAtPeriodEnd`/`canceledAt`, so
	 * the OLD cancelAtPeriodEnd-only check would still pass here and clear those facts — leaving
	 * `status` stuck at the terminal value (this method never touches `status`) while
	 * `SubscriptionAccessDeriver` (which ignores the stored `status` column) re-derives ACTIVE forever:
	 * free access, no re-billing, and the row falls out of `listRenewalDue`'s ACTIVE/TRIALING scan for
	 * good. The documented reactivation path for a terminal subscription is `resubscribe` (via
	 * `CreateSubscription`), which resets `status` along with the cancellation facts — Resume is only
	 * for suspending a cancellation that hasn't taken effect yet.
	 */
	resumeScheduledCancellation(): void {
		if (Subscription.isTerminalStatus(this.status)) {
			throw new BaseError<DomainErrors>('SUBSCRIPTION_ALREADY_FINALIZED')
		}
		if (!this.cancelAtPeriodEnd) {
			throw new BaseError<DomainErrors>('SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION')
		}
		this.cancelAtPeriodEnd = false
		this.canceledAt = null
	}

	/**
	 * Cancel the subscription by recording the cancellation facts the access derivation reads — the
	 * invariant lives HERE, not in the use case (Tell-Don't-Ask). Access is DERIVED from
	 * `canceledAt`/`cancelAtPeriodEnd`:
	 *  - IMMEDIATE (`immediate=true`): access ends now, so ALSO finalize the stored status to the
	 *    terminal CANCELED — otherwise the renewal sweep (`listRenewalDue` selects `status = ACTIVE`)
	 *    would re-charge + resurrect it, and the re-subscribe guard (reads stored status) would lock the
	 *    owner out.
	 *  - SCHEDULED (`immediate=false`): access holds until the period boundary, so status is kept as-is;
	 *    the billing clock finalizes it to CANCELED at the boundary instead of renewing.
	 * Mutates in place, so a pending `scheduledPlanName` is preserved (a later resume restores it intact).
	 */
	cancel(immediate: boolean, now: Date): void {
		this.canceledAt = now
		this.cancelAtPeriodEnd = !immediate
		if (immediate) this.status = SubscriptionStatus.CANCELED
	}

	/**
	 * Re-subscribe over an existing (terminal / effectively-cancelled / INCOMPLETE) record — restart it
	 * as a FRESH subscription IN PLACE. Mutating the loaded entity (instead of building a new one) keeps
	 * the natural-key identity AND the optimistic-lock version, so the version-guarded `save` overwrites
	 * exactly the row it was loaded from (a concurrent change since the load correctly 409s). CLEARS all
	 * cancellation/schedule facts — a fresh subscription carries none; leaving `canceledAt` set would let
	 * the billing clock finalize (cancel) the just-paid subscription (the R3 regression this centralizes).
	 */
	resubscribe(data: {
		engineSubscriptionId: string
		planName: PlanName
		status: SubscriptionStatus
		currentPeriodStart: Date | null
		currentPeriodEnd: Date | null
		trialEnd: Date | null
	}): void {
		this.engineSubscriptionId = data.engineSubscriptionId
		this.planName = data.planName
		this.status = data.status
		this.currentPeriodStart = data.currentPeriodStart
		this.currentPeriodEnd = data.currentPeriodEnd
		this.trialEnd = data.trialEnd
		this.canceledAt = null
		this.cancelAtPeriodEnd = false
		this.scheduledPlanName = null
	}
}

// Declaration merging — interface BELOW class
export interface Subscription extends SubscriptionProps {}
