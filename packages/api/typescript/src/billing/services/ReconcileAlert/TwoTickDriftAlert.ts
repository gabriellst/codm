import { injectable } from 'tsyringe-neo'
import { Handler } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { IdempotencyGuard } from '@template/core-typescript'
import { IdempotencyScope } from '@shared/enums'

// Inert schema pair — TwoTickDriftAlert is never dispatched via execute()/Mediator. It extends
// Handler ONLY to reuse withTransaction() (molde ChargeReconciler/CheckoutSessionReconciler).
// observe() below is the sole entry point.
const TwoTickDriftAlertInputSchema = z.object({})

export interface TwoTickDriftAlertParams {
	/** Claim key for the "first tick observed drift" latch — scope RECONCILE_STALE_ALERT, same as
	 *  the alert claim. Caller owns the key shape (`<concern>-drift-pending:{invoiceId}`). */
	pendingKey: string
	/** Claim key for the exactly-once alert — scope RECONCILE_STALE_ALERT. Caller owns the key
	 *  shape (`<concern>-drift:{invoiceId}`) and the message. */
	alertKey: string
	/** The caller's own alert (logs an error with runbook via LoggingService) — called
	 *  synchronously, at most once, only when THIS call wins the alertKey claim. */
	emit: () => void
	/**
	 * Bypasses the pendingKey gate entirely and claims alertKey directly — for a caller that already
	 * has its OWN in-flight brake protecting against a false alarm (RefundReconcileJob's engine
	 * expectation min-age gate) and therefore doesn't need the extra tick of persistence. Omit (or
	 * false) for the full two-tick dance. See the class doc comment for why this exists.
	 */
	skipPendingGate?: boolean
	/**
	 * Optional bucket suffixing `pendingKey` (`{pendingKey}:{bucket}`) — gives the pending claim a
	 * natural expiry instead of living forever. Without a bucket, a pending claim taken for a drift
	 * that later resolves gateway-side (no CN ever booked, so nothing ever clears the claim) stays
	 * taken indefinitely; a brand-new, UNRELATED drift on the same invoice years later would then
	 * skip straight past the pending gate (the claim is already held) and escalate to a real alert on
	 * a SINGLE tick — a false alarm, and it burns the claim against a webhook that might still be in
	 * transit. A caller that derives the bucket from the tick's own clock (e.g. a monthly
	 * `YYYY-MM`) makes a dry pending claim expire naturally at the bucket boundary instead of
	 * persisting forever. `ChargebackReconcileJob` passes a monthly bucket (chargeback totals are NOT
	 * monotonic — a dispute can be won and reversed, so a stale pending claim is a real risk).
	 * `RefundReconcileJob` does NOT pass one (refund totals ARE monotonic — the only way drift
	 * resolves is a credit note actually being booked, so a stale pending claim was never possible;
	 * keeping it bucket-less keeps its keys byte-identical to before this parameter existed).
	 */
	pendingBucket?: string
}

/**
 * Camada 3 shared choreography — the "two-tick" persistence that guards a detect-and-alert job's
 * exactly-once operator alert against a false alarm from a webhook still in transit. Extracted
 * VERBATIM from `RefundReconcileJob`/`ChargebackReconcileJob` (they were byte-identical duplicates,
 * see `docs/BILLING.md` → "O contrato de reconciliação") so a fix to the coreography applies to
 * every detect-and-alert reconciler at once.
 *
 * The dance: the first tick that observes drift claims `pendingKey` (scope RECONCILE_STALE_ALERT)
 * and returns WITHOUT alerting (`false`) — a webhook that was merely in transit resolves the drift
 * before a second tick ever runs, so the pending claim sits inert forever. Only a SUBSEQUENT tick
 * that still observes drift (the pendingKey claim fails — already held) escalates: it claims
 * `alertKey` and, if it wins that claim, calls the caller's `emit()` exactly once and returns
 * `true`. If neither claim is won (both already held, or an unrelated invocation), it is silent and
 * returns `false`.
 *
 * `skipPendingGate` is a parametrization, not a normalization — the two call sites are NOT
 * byte-identical in their surrounding conditionals: `RefundReconcileJob` only engages the pending
 * gate when it has NO engine expectation for the invoice (`!hasExpectation`); WITH an expectation,
 * its own in-flight brake (a min-age check against the expectation's emission time) already
 * protects against the false alarm, so it skips straight to the alertKey claim. `ChargebackReconcileJob`
 * has no engine-expectation concept (it never initiates a dispute) and always engages the full
 * two-tick dance. Passing `skipPendingGate: true` reproduces the direct-to-alert path without
 * forcing a pending claim that the original code never took.
 */
@injectable()
export class TwoTickDriftAlert extends Handler<typeof TwoTickDriftAlertInputSchema> {
	readonly name = 'billing.two-tick-drift-alert' as const
	readonly inputSchema = TwoTickDriftAlertInputSchema
	readonly outputSchema = z.void()

	constructor(private idempotencyGuard: IdempotencyGuard) {
		super()
	}

	/** Returns `true` iff THIS call won the alertKey claim and called `emit()`. */
	async observe(params: TwoTickDriftAlertParams): Promise<boolean> {
		if (!params.skipPendingGate) {
			// `pendingBucket` (when the caller passes one) suffixes the pending key so it expires
			// naturally at the bucket boundary instead of living forever — see the param doc comment.
			const pendingKey = params.pendingBucket ? `${params.pendingKey}:${params.pendingBucket}` : params.pendingKey
			const claimedPending = await this.withTransaction(undefined, (tx: Transaction) =>
				this.idempotencyGuard.claim(IdempotencyScope.RECONCILE_STALE_ALERT, pendingKey, tx),
			)
			if (claimedPending) return false // first tick to observe drift — wait one more tick
			// pending claim already taken on an earlier tick AND drift still persists now => escalate.
		}

		return this.withTransaction(undefined, async (tx: Transaction) => {
			if (await this.idempotencyGuard.claim(IdempotencyScope.RECONCILE_STALE_ALERT, params.alertKey, tx)) {
				params.emit()
				return true
			}
			return false
		})
	}

	protected async handle(): Promise<void> {
		// Unreachable — TwoTickDriftAlert is a directly-injected service (observe()), never
		// dispatched via execute()/Mediator. See the class doc comment.
		throw new Error('TwoTickDriftAlert.handle() is unreachable — call observe() directly')
	}
}
