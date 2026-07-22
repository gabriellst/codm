import { injectable } from 'tsyringe-neo'
import { Handler } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { tryCatch, tryCatchAsync } from '@template/core-typescript'
import { LoggingService } from '@template/core-typescript'

import { SubscriptionChangedEvent } from '@template/contracts-typescript/wire/events'
import { BillingClock, UsageRollup, OverageCalculator, UsageSource, type OwnerUsageWindow } from '@billing/services'
import { QuotaOverrideRepository } from '@quota/repositories'
import { PlanRegistry } from '@billing/objects'
import { SubscriptionRepository } from '@billing/repositories'
import { Subscription } from '@billing/entities'
import { ExternalInvoiceIssuedEvent } from '@billing/events/ExternalInvoiceIssuedEvent'
import { PlanName, QuotaKey } from '@template/contracts-typescript/wire/enums'

const BillingClockJobInputSchema = z.object({})

/** Owners per transaction. Bounds both the tx duration and the blast radius of a failed chunk. */
const CHUNK_SIZE = 100

/** A due subscription with its resolved windows. */
interface RenewalPlan {
	subscription: Subscription
	/** The NEW period opening at the boundary — goes on the invoice (paid-through derivation). */
	periodStart: Date
	periodEnd: Date
	/** The CLOSED period that actually RAN — the overage metering window. Null when no period was
	 *  open (first close of a trial seeded without currentPeriodStart) → zero metered usage. */
	usageWindow: { start: Date; end: Date } | null
}

/**
 * Native period-close sweep (Phase C) — the engine's autonomous renewal invoicing. Every
 * tick it finds the subscriptions whose period closed (ACTIVE past currentPeriodEnd) or whose
 * trial ended (TRIALING past trialEnd) and emits ONE `ExternalInvoiceIssuedEvent` per due
 * subscription onto the outbox, reusing the EXISTING charge saga (`ExternalInvoiceIssuedHandler`)
 * unchanged — verifier/mapper are bypassed; the signal is minted in-context.
 *
 * The `engineInvoiceId` is DETERMINISTIC per (owner, period-start): `native:{ownerId}:{periodMs}`.
 * A re-tick (the period hasn't advanced yet — that's a later task) re-emits the SAME id, so the
 * write-once invoice ledger (`InvoiceService.issue` is idempotent on correlationId=engineInvoiceId)
 * and the INVOICE_CHARGE idempotency claim collapse it to a no-op — NO double invoice, NO double
 * charge. Always on (not BILLING_SANDBOX-gated): the native clock is production's renewal driver.
 *
 * Batch shape: the due list is read OUTSIDE any tx and processed in CHUNKS of 100 owners — each
 * chunk is ONE small transaction of set-based statements (finalize/changePlan/usage/events), so the
 * per-owner statement count stays constant per chunk instead of 7×N, and no tx spans the whole
 * sweep. Never wrap per-item work in one shared tx with a per-item try/catch: under Postgres a
 * failed STATEMENT aborts the whole transaction, so every later item errors with "transaction
 * aborted" and the final commit rolls back the "successes" too — the isolation the try/catch
 * suggests doesn't exist. Chunks are the isolation unit instead: a failed chunk is logged and
 * skipped, and the next tick re-emits it idempotently (deterministic ids + claims).
 */
@injectable()
export class BillingClockJob extends Handler<typeof BillingClockJobInputSchema> {
	readonly name = 'billing.clock' as const
	readonly inputSchema = BillingClockJobInputSchema
	readonly outputSchema = z.void()

	constructor(
		private subscriptionRepository: SubscriptionRepository,
		private clock: BillingClock,
		private usageRollup: UsageRollup,
		private usageSource: UsageSource,
		private quotaOverrideRepository: QuotaOverrideRepository,
		private overageCalculator: OverageCalculator,
		private loggingService: LoggingService,
	) {
		super()
	}

	async handle(): Promise<void> {
		const now = new Date()
		const due = await this.subscriptionRepository.listRenewalDue(now)

		for (let i = 0; i < due.length; i += CHUNK_SIZE) {
			const chunk = due.slice(i, i + CHUNK_SIZE)
			const result = await tryCatchAsync(() => this.processChunk(chunk))
			if (!result.success) {
				// One chunk's failure must not starve the rest of the sweep; its owners are retried
				// (idempotently) on the next tick.
				this.loggingService.warn({
					content: { message: 'BillingClockJob chunk failed', chunkSize: chunk.length, error: result.error.message },
				})
			}
		}
	}

	private async processChunk(chunk: Subscription[]): Promise<void> {
		// Partition in memory — no I/O. A cancellation whose period closed FINALIZES instead of
		// renewing (renewing would charge the card and RESURRECT a customer who cancelled). The
		// period anchor is the boundary that just closed; listRenewalDue guarantees it's set for the
		// rows it returns — guard defensively so a not-yet-due row is skipped rather than crashing.
		const toFinalize = chunk.filter(s => s.canceledAt)
		const renewals: RenewalPlan[] = chunk
			.filter(s => !s.canceledAt)
			.flatMap(s => {
				const anchor = s.renewalAnchor()
				if (!anchor) return []
				return [
					{
						subscription: s,
						// The new period opens at the boundary that just closed and runs one cycle forward.
						periodStart: anchor,
						periodEnd: this.clock.nextPeriodEnd(anchor, 'monthly'),
						// The CLOSED period is what the owner actually USED — [currentPeriodStart, anchor).
						// Metering the freshly-opened [anchor, next) window (the old shape) counted a
						// (near-)empty future window and never billed overage at all.
						usageWindow: s.currentPeriodStart ? { start: s.currentPeriodStart, end: anchor } : null,
					},
				]
			})
		// Candidates only — whether the downgrade still stands is decided by the ROW, in SQL, below.
		const downgradeCandidates = renewals
			.filter(r => r.subscription.scheduledPlanName && r.subscription.scheduledPlanName !== r.subscription.planName)
			.map(r => r.subscription.ownerId)

		await this.withTransaction(undefined, async (tx: Transaction) => {
			// Finalizations: ONE conditional statement — `finalizeCancellationMany` re-checks
			// cancel_at_period_end/canceled_at in SQL per row, so a ResumeSubscription committed since
			// this sweep's snapshot is NOT blindly re-cancelled (it just doesn't match, and renews on
			// the next tick). Only actually-finalized owners are announced.
			const finalized = await this.subscriptionRepository.finalizeCancellationMany(
				toFinalize.map(s => s.ownerId),
				tx,
			)

			// Scheduled downgrades take effect BEFORE pricing, so the invoice bills the lower base.
			// applyScheduledPlanMany is SELF-REFERENTIAL (plan_name = the row's CURRENT
			// scheduled_plan_name, condition re-checked in SQL): a CancelScheduledDowngrade or paid
			// upgrade committed since the sweep's snapshot is skipped per-row, never clobbered — the
			// applied set (owner + the plan it landed on) is what prices and announces below.
			const applied = await this.subscriptionRepository.applyScheduledPlanMany(downgradeCandidates, tx)
			const appliedPlan = new Map(applied.map(a => [a.ownerId, a.planName]))

			// Overage for the CLOSED period, batched: one usage read for the whole chunk (each owner's
			// own closed window), one bulk audit-snapshot insert reusing that SAME count (the single-row
			// path used to fold the events twice), one override-delta GROUP BY.
			const windows: OwnerUsageWindow[] = renewals.flatMap(r =>
				r.usageWindow ? [{ ownerId: r.subscription.ownerId, start: r.usageWindow.start, end: r.usageWindow.end }] : [],
			)
			const usage = await this.usageSource.usageInWindows(windows, QuotaKey.EXAMPLE_KEY, tx)
			await this.usageRollup.snapshotUsageMany(
				renewals.flatMap(r =>
					r.usageWindow
						? [
								{
									ownerId: r.subscription.ownerId,
									periodStart: r.usageWindow.start,
									periodEnd: r.usageWindow.end,
									quantity: usage.get(r.subscription.ownerId) ?? 0,
								},
							]
						: [],
				),
				QuotaKey.EXAMPLE_KEY,
				tx,
			)
			const overrideDeltas = await this.quotaOverrideRepository.currentDeltaMany(
				renewals.map(r => r.subscription.ownerId),
				QuotaKey.EXAMPLE_KEY,
				tx,
			)

			// Build every renewal invoice event, GUARDED per owner: a pure-JS throw (a corrupt/unknown
			// planName makes PlanRegistry.get throw) must skip THAT owner, not poison the whole chunk —
			// listRenewalDue's stable ordering would re-place the bad owner in the same chunk every
			// tick, starving its ~99 neighbors forever.
			const issuedEvents: ExternalInvoiceIssuedEvent[] = []
			for (const r of renewals) {
				const effectivePlan = appliedPlan.get(r.subscription.ownerId) ?? r.subscription.planName
				const built = tryCatch(() => this.buildIssuedEvent(r, effectivePlan, usage, overrideDeltas))
				if (built.success) issuedEvents.push(built.data)
				else
					this.loggingService.error({
						content: { message: 'BillingClockJob skipping renewal for owner', ownerId: r.subscription.ownerId, error: built.error.message },
					})
			}
			await this.domainEventRepository.saveMany(issuedEvents, tx)

			// Thin cross-context triggers, one bulk write: the finalized owners + the owners whose plan
			// ACTUALLY turned over (the applied set — a skipped downgrade must not announce).
			const changedOwners = [...finalized, ...applied.map(a => a.ownerId)]
			await this.domainEventRepository.saveIntegrationEventMany(
				changedOwners.map(ownerId => new SubscriptionChangedEvent({ ownerId, payload: {} })),
				tx,
			)
		})
	}

	private buildIssuedEvent(
		renewal: RenewalPlan,
		effectivePlan: PlanName,
		usage: Map<string, number>,
		overrideDeltas: Map<string, number>,
	): ExternalInvoiceIssuedEvent {
		const ownerId = renewal.subscription.ownerId
		const periodStartMs = renewal.periodStart.getTime()
		const engineInvoiceId = BillingClock.nativeInvoiceId(ownerId, periodStartMs)

		// Overage prices the excess above the effective allowance for the plan the period RAN on
		// (subscription.planName — pre-downgrade); the BASE bills the plan the owner LANDED on
		// (effectivePlan — post-downgrade when the schedule actually applied).
		const { quantity: overageQty, amountCents: overageCents } = this.overageCalculator.compute({
			planName: renewal.subscription.planName,
			key: QuotaKey.EXAMPLE_KEY,
			usedInPeriod: usage.get(ownerId) ?? 0,
			overrideDelta: overrideDeltas.get(ownerId) ?? 0,
		})

		return new ExternalInvoiceIssuedEvent({
			entityId: engineInvoiceId,
			ownerId,
			payload: {
				externalId: `${engineInvoiceId}:issued`,
				ownerId,
				engineInvoiceId,
				amountCents: PlanRegistry.get(effectivePlan).basePrice.amountCents,
				number: null,
				dueDate: null,
				periodStart: renewal.periodStart.toISOString(),
				periodEnd: renewal.periodEnd.toISOString(),
				overageCents,
				overageQty,
				attemptNo: 0,
			},
		})
	}
}
