import { injectable } from 'tsyringe-neo'
import { ProductConfig } from '@shared/config'

const MS_PER_DAY = 86_400_000

/** The recurrence intervals the native clock understands. Monthly is the only cycle today. */
export type BillingInterval = 'monthly'

/**
 * Pure recurrence clock (no I/O, no Mock needed) — computes period boundaries + trial end for the
 * native Phase-C renewal loop. Self-bound across every profile like RefundPolicy: it's a
 * deterministic calculator, so the same class is correct everywhere. All arithmetic is in UTC.
 *
 * `nextPeriodEnd` adds one month with CORRECT day-clamping — Jan 31 → Feb 28/29, Aug 31 → Sep 30,
 * Dec → Jan year rollover — instead of the naive `d.setMonth(d.getMonth()+1)` (which overflows
 * Jan 31 → Mar 3).
 *
 * In BILLING_SANDBOX mode a "monthly" period (and the trial window) collapses to
 * `ProductConfig.env.BILLING_SANDBOX_PERIOD_MS` (default 60s) from its anchor, so dev subscriptions become
 * renewal-due within a minute and the native BillingClockJob can drive fast renewals. Reading the
 * flag from Config keeps the class pure — same input, same output for a given Config, no I/O.
 */
@injectable()
export class BillingClock {
	/**
	 * Deterministic native invoice id for a (owner, period-start) pair: `native:{ownerId}:{periodStartMs}`.
	 * The single source of this string — CreateSubscription's first invoice and BillingClockJob's renewal
	 * sweep both mint it here so their write-once invoice ledger + INVOICE_CHARGE idempotency keys line up.
	 */
	static nativeInvoiceId(ownerId: string, periodStartMs: number): string {
		return `native:${ownerId}:${periodStartMs}`
	}

	/** One `interval` after `from`, clamping the day-of-month to the target month's length. UTC. */
	nextPeriodEnd(from: Date, interval: BillingInterval = 'monthly'): Date {
		// `interval` is monthly-only today; the param keeps the seam for future cycles.
		void interval
		// Sandbox: collapse the "monthly" cycle to the compressed period so renewals fire in seconds.
		if (ProductConfig.env.BILLING_SANDBOX) return new Date(from.getTime() + ProductConfig.env.BILLING_SANDBOX_PERIOD_MS)
		return this.addMonthsUTC(from, 1)
	}

	/** `from` + `trialDays` whole days. UTC (DST-free, since we work in absolute ms). */
	trialEndFrom(from: Date, trialDays: number): Date {
		// Sandbox: the trial window collapses to the compressed period so trials end in seconds too.
		if (ProductConfig.env.BILLING_SANDBOX) return new Date(from.getTime() + ProductConfig.env.BILLING_SANDBOX_PERIOD_MS)
		return new Date(from.getTime() + trialDays * MS_PER_DAY)
	}

	/** A period is closed once its end is at or before `now`. Null end (no window) is never closed. */
	isClosed(currentPeriodEnd: Date | null, now: Date): boolean {
		return currentPeriodEnd != null && currentPeriodEnd.getTime() <= now.getTime()
	}

	/**
	 * Add `months` calendar months in UTC, clamping the day to the target month's last day so the
	 * result never rolls into the following month (the bug in Date.setMonth). Time-of-day preserved.
	 */
	protected addMonthsUTC(from: Date, months: number): Date {
		const year = from.getUTCFullYear()
		const month = from.getUTCMonth()
		const day = from.getUTCDate()

		const targetMonthIndex = month + months
		const targetYear = year + Math.floor(targetMonthIndex / 12)
		// JS % can be negative; normalize into [0, 11] for the wrapped month.
		const targetMonth = ((targetMonthIndex % 12) + 12) % 12

		const lastDayOfTargetMonth = this.daysInMonthUTC(targetYear, targetMonth)
		const clampedDay = Math.min(day, lastDayOfTargetMonth)

		return new Date(
			Date.UTC(
				targetYear,
				targetMonth,
				clampedDay,
				from.getUTCHours(),
				from.getUTCMinutes(),
				from.getUTCSeconds(),
				from.getUTCMilliseconds(),
			),
		)
	}

	/** Number of days in a given UTC month — day 0 of the next month is the last day of this one. */
	protected daysInMonthUTC(year: number, monthIndex: number): number {
		return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
	}
}
