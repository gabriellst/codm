import { injectable } from 'tsyringe-neo'
import { ProductConfig } from '@shared/config'
import { Charge } from '@billing/entities'

import { RefundBasis } from '@billing/enums/RefundBasis'
import { InvoiceLineKind } from '@billing/enums/InvoiceLineKind'
import type { InvoiceProps } from '@billing/entities'
import { ChargeStatus } from '@template/contracts-typescript/wire/enums'

// Re-export so existing `import { RefundBasis } from '.../RefundPolicy'` consumers keep working.
export { RefundBasis }

const MS_PER_DAY = 86_400_000
/** Pre-Phase-C invoices carry no period → assume a 30-day cycle starting at the payment date. */
const FALLBACK_PERIOD_DAYS = 30

/** Half-up rounding for a non-negative amount of cents (Math.floor(x + 0.5) is exact half-up for x ≥ 0). */
const roundHalfUp = (value: number): number => Math.floor(value + 0.5)

export interface RefundableFacts {
	/** The parent invoice's props — the settled total (`amountCents`) + optional period. */
	invoice: InvoiceProps
	/** The charges recorded against the invoice; a SUCCEEDED one means the invoice is paid. */
	charges: Charge[]
	/** Σ amount_cents already credited against this invoice (credit-note sum). */
	creditedCents: number
	/** Evaluation instant (kept explicit so the service stays pure / deterministic). */
	now: Date
}

export interface RefundableResult {
	amountCents: number
	basis: RefundBasis
}

/**
 * Pure, usage-aware refund calculator for a user-facing refund request. Takes already-loaded facts
 * (no I/O) and returns the fair refundable amount + the basis it was computed on.
 *
 * Invariant: `0 ≤ amountCents ≤ paid − alreadyCredited`, where `paid` is the settled total
 * (the invoice's `amountCents`, valid once a SUCCEEDED charge exists).
 *
 * - CDC_WINDOW (full): within `BILLING_WITHDRAWAL_WINDOW_DAYS` (default 7) days of the payment date
 *   (the earliest SUCCEEDED charge's `createdAt`) the consumer is owed a full refund of what's left
 *   uncredited (Código de Defesa do Consumidor art. 49 — right of withdrawal).
 * - PRO_RATA: past the window, only the unused slice of the billing period is refundable:
 *   `round_half_up(paid × remainingDays / periodDays) − alreadyCredited`, clamped to ≥ 0. Period from
 *   the invoice (`periodStart`/`periodEnd`); pre-Phase-C rows (null period) fall back to a 30-day
 *   cycle starting at the payment date.
 * - NONE: no SUCCEEDED charge, or nothing left to credit (`paid − alreadyCredited ≤ 0`).
 */
@injectable()
export class RefundPolicy {
	refundableFor(facts: RefundableFacts): RefundableResult {
		const { invoice, charges, creditedCents, now } = facts

		const paymentDate = this.earliestSucceededAt(charges)
		// No settled charge → nothing was paid → nothing to refund.
		if (!paymentDate) return { amountCents: 0, basis: RefundBasis.NONE }

		const paid = invoice.amountCents
		const remainingCredit = paid - creditedCents
		if (remainingCredit <= 0) return { amountCents: 0, basis: RefundBasis.NONE }

		// CDC withdrawal window: a full refund of what's left uncredited.
		const windowDays = ProductConfig.env.BILLING_WITHDRAWAL_WINDOW_DAYS ?? 7
		const daysSincePayment = (now.getTime() - paymentDate.getTime()) / MS_PER_DAY
		if (daysSincePayment <= windowDays) {
			return { amountCents: remainingCredit, basis: RefundBasis.CDC_WINDOW }
		}

		// Pro-rata of the unused period — the time-refundable base is everything paid EXCEPT delivered
		// OVERAGE. OVERAGE bills usage already consumed (messages sent), which unused TIME can't refund;
		// SUBSCRIPTION and one-time PRORATION (a mid-period upgrade's own unused slice) ARE time-based.
		// Subtracting only OVERAGE (rather than summing SUBSCRIPTION) correctly covers UPGRADE invoices,
		// which carry a PRORATION line — not SUBSCRIPTION — plus OVERAGE. (The CDC withdrawal FULL refund
		// above is unaffected — that is the legal right of withdrawal on the whole payment.)
		const overagePaid = invoice.lineItems
			.filter(line => line.kind === InvoiceLineKind.OVERAGE)
			.reduce((sum, line) => sum + line.amountCents, 0)
		const proRataBase = Math.max(0, paid - overagePaid)
		const { periodStart, periodEnd } = this.resolvePeriod(invoice, paymentDate)
		const periodDays = (periodEnd.getTime() - periodStart.getTime()) / MS_PER_DAY
		const remainingDays = Math.max(0, (periodEnd.getTime() - now.getTime()) / MS_PER_DAY)

		// Degenerate/elapsed period → nothing unused to refund.
		const proRata = periodDays > 0 ? roundHalfUp((proRataBase * remainingDays) / periodDays) : 0
		const amountCents = Math.min(remainingCredit, Math.max(0, proRata - creditedCents))
		return { amountCents, basis: RefundBasis.PRO_RATA }
	}

	/** The earliest SUCCEEDED charge's createdAt == the invoice's payment date, or null when none is settled. */
	private earliestSucceededAt(charges: Charge[]): Date | null {
		const succeeded = charges.filter(c => c.status === ChargeStatus.SUCCEEDED)
		if (succeeded.length === 0) return null
		// Seed with the max representable date so the earliest createdAt always wins (no index access).
		return succeeded.reduce<Date>((earliest, c) => (c.createdAt < earliest ? c.createdAt : earliest), new Date(8.64e15))
	}

	/** The billing period; pre-Phase-C invoices (null period) fall back to a 30-day cycle from the payment date. */
	private resolvePeriod(invoice: InvoiceProps, paymentDate: Date): { periodStart: Date; periodEnd: Date } {
		if (invoice.periodStart && invoice.periodEnd) {
			return { periodStart: invoice.periodStart, periodEnd: invoice.periodEnd }
		}
		return {
			periodStart: paymentDate,
			periodEnd: new Date(paymentDate.getTime() + FALLBACK_PERIOD_DAYS * MS_PER_DAY),
		}
	}
}
