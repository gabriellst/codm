import { injectable } from 'tsyringe-neo'
import { LoggingService } from '@template/core-typescript'

/**
 * Every operator-alert concern billing's reconciliation layer can raise. Each kind maps 1:1 to a
 * claim-guarded call site (see `docs/BILLING.md` → "O contrato de reconciliação" for the manifest of
 * who emits what) — adding a new alert site means adding a new kind here first, never inventing an
 * ad-hoc string at the call site.
 */
export type OperatorAlertKind =
	| 'refund-drift'
	| 'refund-unmonitored'
	| 'chargeback-drift'
	| 'charge-stale'
	| 'charge-unpollable'
	| 'checkout-stale'
	// Not part of the C3 uniform-reconciliation manifest (billing/reconciliation-coverage.test.ts) —
	// it fires from ChargeSettler.settleCharge (a synchronous settle-time path), not a scheduled
	// *ReconcileJob.ts/*Reconciler.ts sweep, so it is claim-guarded under its own
	// IdempotencyScope.CHARGE_SETTLER_ALERT rather than RECONCILE_STALE_ALERT.
	| 'dup-refund-failed'

export interface OperatorAlertParams {
	/** Which concern is alerting — becomes the `alert` field Grafana/Loki filters on. */
	kind: OperatorAlertKind
	/** The idempotency-claim key that guarded this specific emission (exactly-once by construction —
	 *  every call site here is already claim-guarded before calling `emit`). Becomes `alertKey`. */
	key: string
	/** The actionable text an operator follows to resolve the alert (re-deliver the webhook, check
	 *  the gateway dashboard, etc.) — never folded into an interpolated message string. */
	runbook: string
	/** Structured context (invoiceId, gatewayTxId, totals, platform, ...) — merged flat into the log
	 *  content so Grafana can filter/aggregate on individual fields, never serialized into a message. */
	context: Record<string, unknown>
}

/**
 * The ONLY path for a billing operator alert. Every reconciliation call site (RefundReconcileJob,
 * ChargebackReconcileJob, ChargeReconciler, ReconcilePendingChargesJob, CheckoutSessionReconciler)
 * routes its claim-guarded "something needs a human" signal through `emit()` instead of raw
 * stderr logging — the reconciliation-coverage rail enforces this mechanically.
 *
 * Every call is exactly-once by construction: the caller has ALREADY won an
 * `IdempotencyScope.RECONCILE_STALE_ALERT` claim before calling `emit` (see `TwoTickDriftAlert`,
 * `ChargeReconciler`, `ReconcilePendingChargesJob`, `CheckoutSessionReconciler`) — this service never
 * re-guards, it only logs.
 *
 * Fields are STRUCTURED (never an interpolated message string) so Grafana/Loki can filter and
 * aggregate on them directly. Suggested LogQL alert rule (fires when any `alert` kind logged in the
 * last 10 minutes):
 *
 *   count_over_time({service_name=~".+"} | json | alert != `` [10m]) by (alert) > 0
 *
 * Thin by design — no `extends Handler`, no transaction: emitting a log entry is not a domain
 * operation and never needs a `tx`.
 */
@injectable()
export class OperatorAlert {
	constructor(private loggingService: LoggingService) {}

	emit(alert: OperatorAlertParams): void {
		this.loggingService.error({
			content: {
				alert: alert.kind,
				alertKey: alert.key,
				runbook: alert.runbook,
				...alert.context,
			},
			severity: 1,
		})
	}
}
