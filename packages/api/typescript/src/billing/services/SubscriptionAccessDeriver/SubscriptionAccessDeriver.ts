import type { Transaction } from '@template/core-typescript'

import type { SubscriptionProps } from '../../entities'
import { PlanName, SubscriptionStatus } from '@template/contracts-typescript/wire/enums'

/** The subscription fields the access derivation reads — satisfied by a Subscription entity. */
export type DerivableSubscription = Pick<
	SubscriptionProps,
	'planName' | 'trialEnd' | 'canceledAt' | 'cancelAtPeriodEnd' | 'currentPeriodEnd'
>

export interface DerivedAccess {
	/** Whether the owner currently HOLDS their paid plan's entitlements (trial or paid, within grace, not canceled). */
	hasAccess: boolean
	/** The plan whose entitlements apply right now — the record's plan while `hasAccess`, else FREE. */
	effectivePlan: PlanName
	/** The status to SHOW (derived, never stored) — CANCELED/TRIALING/ACTIVE/PAST_DUE/INCOMPLETE. */
	displayStatus: SubscriptionStatus
	/** The furthest period end backed by a paid, un-credited invoice, or null when nothing backs access. */
	paidThrough: Date | null
}

/**
 * Derives a subscription's access + effective plan from FACTS (the subscription record +
 * the invoice ledger) instead of a stored status machine — "derive, don't flip". `paidThrough` is
 * the MAX periodEnd over the owner's invoices that currently back access (a SUCCEEDED charge ∧ not
 * fully credited, per InvoiceStatusDeriver.backsAccess); access is retained for a dunning grace
 * window past it, or while a trial is live, and is revoked once a cancellation takes effect.
 */
export abstract class SubscriptionAccessDeriver {
	abstract derive(ownerId: string, now: Date, tx?: Transaction): Promise<DerivedAccess>

	/**
	 * Pure fact → access mapping. The single source of the access + display-status ordering; the
	 * concrete impl only resolves `paidThrough` (from the ledger) and delegates here.
	 */
	static computeAccess(args: { record: DerivableSubscription; paidThrough: Date | null; now: Date; graceDays: number }): DerivedAccess {
		const { record, paidThrough, now, graceDays } = args

		const inTrial = record.trialEnd != null && now < record.trialEnd
		const graceEnd = paidThrough != null ? SubscriptionAccessDeriver.addDays(paidThrough, graceDays) : null
		const canceledEffective = SubscriptionAccessDeriver.isCanceledEffective(record, now)

		const hasAccess = !canceledEffective && (inTrial || (paidThrough != null && graceEnd != null && now <= graceEnd))

		const displayStatus = canceledEffective
			? SubscriptionStatus.CANCELED
			: inTrial
				? SubscriptionStatus.TRIALING
				: paidThrough != null && now <= paidThrough
					? SubscriptionStatus.ACTIVE
					: paidThrough != null && graceEnd != null && now <= graceEnd
						? SubscriptionStatus.PAST_DUE
						: SubscriptionStatus.INCOMPLETE

		return {
			hasAccess,
			effectivePlan: hasAccess ? record.planName : PlanName.FREE,
			displayStatus,
			paidThrough,
		}
	}

	/**
	 * Whether a recorded cancellation is now in effect — the SINGLE source shared by `computeAccess` AND
	 * `CreateSubscription`'s re-subscribe guard, which must not hand-copy this predicate (it drifted once:
	 * the copy dropped the trial arm). A SCHEDULED cancel (`cancelAtPeriodEnd`) takes effect at the
	 * boundary that just closed — the TRIAL end while trialing (currentPeriodEnd is null during a trial),
	 * else the current period end; an IMMEDIATE cancel takes effect at `canceledAt`.
	 */
	static isCanceledEffective(
		record: Pick<DerivableSubscription, 'canceledAt' | 'cancelAtPeriodEnd' | 'currentPeriodEnd' | 'trialEnd'>,
		now: Date,
	): boolean {
		if (record.canceledAt == null) return false
		if (!record.cancelAtPeriodEnd) return now >= record.canceledAt
		const inTrial = record.trialEnd != null && now < record.trialEnd
		const boundary = inTrial ? record.trialEnd! : (record.currentPeriodEnd ?? record.canceledAt)
		return now >= boundary
	}

	private static addDays(from: Date, days: number): Date {
		return new Date(from.getTime() + days * 24 * 60 * 60 * 1000)
	}
}
