import { injectable } from 'tsyringe-neo'
import { Handler } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { ProductConfig } from '@shared/config'
import { IdempotencyGuard } from '@template/core-typescript'
import { IdempotencyScope } from '@shared/enums'
import type { Charge } from '@billing/entities'

import { ChargeRepository } from '@billing/repositories'
// Direct subpaths, NOT the '@billing/services' barrel — avoids the module cycle that TDZ-crashes
// at runtime (this module is re-exported by that barrel).
import { PaymentProviderFactory } from '@billing/services/PaymentProvider'
import { ChargeSettler } from '@billing/services/ChargeSettler'
import { OperatorAlert } from '@billing/services/OperatorAlert'
import { ExternalInvoiceIssuedEvent } from '@billing/events/ExternalInvoiceIssuedEvent'
import { InvoicePaymentFailedEvent } from '@billing/events/InvoicePaymentFailedEvent'
import { ChargeStatus, PlanName } from '@template/contracts-typescript/wire/enums'

// Inert schema pair — ChargeReconciler is never dispatched via execute()/Mediator. It extends Handler
// ONLY to reuse withTransaction()/domainEventRepository (the ChargeSettler/SubscriptionCharger idiom).
// reconcile() below is the sole entry point.
const ChargeReconcilerInputSchema = z.object({})

// The optimistic-upgrade pair as it may appear on the persisted issued event — both members parsed
// through PlanName so raw JSON never leaks an unvalidated string onto the failure event. Mirrors
// ExternalChargeFailedHandler: the webhook and reconcile paths rehydrate the pair identically.
const UpgradePairSchema = z.object({ upgradedFromPlan: z.enum(PlanName), upgradedToPlan: z.enum(PlanName) })

/**
 * Reconciles ONE stale PENDING charge against the gateway's real status — the recovery for a dropped
 * settlement webhook. Extracted VERBATIM from ReconcilePendingChargesJob.reconcileOne so BOTH delivery
 * mechanisms run the identical hardened logic:
 *  - the per-charge delayed command (`ReconcileChargeCommand`, scheduled when the charge is recorded
 *    PENDING — the scalable path: O(new charges), no ledger sweep), and
 *  - the low-frequency sweep (`ReconcilePendingChargesJob` — the backstop for a lost/never-scheduled
 *    alarm; also the only place the max-age still-pending alert fires repeatedly).
 * Idempotent by construction: a charge already terminal (settled by the webhook that raced us) makes
 * every branch no-op — safe under at-least-once delivery from either mechanism.
 */
@injectable()
export class ChargeReconciler extends Handler<typeof ChargeReconcilerInputSchema> {
	readonly name = 'billing.charge-reconciler' as const
	readonly inputSchema = ChargeReconcilerInputSchema
	readonly outputSchema = z.void()

	constructor(
		private chargeRepository: ChargeRepository,
		private providerFactory: PaymentProviderFactory,
		private chargeSettler: ChargeSettler,
		private idempotencyGuard: IdempotencyGuard,
		private operatorAlert: OperatorAlert,
	) {
		super()
	}

	async reconcile(charge: Charge, now: Date): Promise<void> {
		const gatewayTxId = charge.gatewayTxId
		if (!gatewayTxId) return // listStalePending excludes these; defensive.
		const status = await this.providerFactory.for(charge.platform).getChargeStatus(gatewayTxId)
		if (status === 'settled') {
			await this.chargeSettler.settleCharge({
				ownerId: charge.ownerId.value,
				engineInvoiceId: charge.invoiceId.value,
				amountCents: charge.amountCents,
				platform: charge.platform,
				method: charge.method,
				gatewayTxId,
				charge,
				refundDuplicate: true,
			})
			return
		}
		if (status === 'failed') {
			// A dropped charge.failed webhook stranded this PENDING charge. Two SEPARATE concerns follow,
			// deliberately NOT conflated (the prior fix routed both through failCharge and let the dunning
			// claim + isUpgrade flag gate the charge transition — that stranded a second attempt's charge
			// on an already-dunning invoice, and an upgrade proration, in PENDING forever):
			//   LAYER 1 — charge-transition (loop-freedom): unconditional. The reconciler already holds
			//     THIS specific PENDING charge by identity, so it transitions it directly — no need for
			//     failCharge's claim-gated placeholder path (that path is for webhook/engine callers with
			//     no charge in hand).
			//   LAYER 2 — dunning (idempotent invoice effect): mirrors ExternalChargeFailedHandler's
			//     never-dun-a-payer + upgrade-revert + one-claim-per-invoice gate.
			await this.withTransaction(undefined, async (tx: Transaction) => {
				// LAYER 1 — ALWAYS terminalize THIS charge: the gateway says it failed, it is PENDING, and
				// it is THIS charge by identity. Unconditional — NOT gated on the dunning claim or isUpgrade
				// — so a second attempt's charge on an already-dunning invoice AND an upgrade proration both
				// leave listStalePending instead of being re-swept forever. No declineCode: getChargeStatus
				// returns only 'failed' (generic — matches the webhook path).
				if (charge.status === ChargeStatus.PENDING) {
					charge.markFailed()
					await this.chargeRepository.save(charge, tx)
				}

				// LAYER 2 — dunning/revert, idempotent per invoice. Never dun a payer: if the invoice is
				// already settled by another charge, terminalize (Layer 1, done) but do NOT dun.
				if (await this.chargeRepository.findSucceededByInvoiceId(charge.invoiceId.value, tx)) return

				// Rehydrate the optimistic-upgrade pair from the invoice's OWN issued event (its entityId
				// IS the engineInvoiceId) — identical rehydration to ExternalChargeFailedHandler. Present →
				// the emitted event drives revertOptimisticUpgrade (Decision 8) instead of markPastDue. One
				// source of truth (the issued event), two delivery paths (webhook + reconcile).
				const issued = await this.domainEventRepository.findLatestByEntityIdAndName(
					charge.invoiceId.value,
					ExternalInvoiceIssuedEvent.name,
					tx,
				)
				const pair = UpgradePairSchema.safeParse(issued?.payload)
				const upgradePair = pair.success ? pair.data : {}

				// A non-positive amount must never START DUNNING (DunningRetryJob would re-charge a 0-cent
				// invalid gateway charge — mirrors failCharge's amountCents<=0 guard) — BUT an optimistic-
				// upgrade proration must still emit so InvoicePaymentFailedHandler REVERTS the flip (Decision
				// 8), regardless of amount (ChargeSchema permits amountCents:0 — a fully-credited/coupon
				// upgrade). Mirror ExternalChargeFailedHandler's emit gate (recordedFailure || pair.success):
				// emit when pair.success OR amount>0; skip ONLY a non-upgrade non-positive amount. The charge
				// is still terminalized above (Layer 1, loop-free) — a skipped one just isn't dunned. This
				// guard sits AFTER the pair rehydration precisely so a 0-cent upgrade still reverts.
				if (charge.amountCents <= 0 && !pair.success) return

				// One dunning/revert trigger per invoice — dedup across deliveries AND vs the live webhook
				// handler's own INVOICE_FAILED claim. If it is already held the trigger fired; the Layer-1
				// transition above still stands (loop-free), only the duplicate emit is suppressed.
				if (!(await this.idempotencyGuard.claim(IdempotencyScope.INVOICE_FAILED, charge.invoiceId.value, tx))) return

				await this.domainEventRepository.save(
					new InvoicePaymentFailedEvent({
						entityId: charge.invoiceId.value,
						ownerId: charge.ownerId.value,
						// No declineCode on the reconcile path (getChargeStatus carries no acquirer code) —
						// dunning falls back to generic copy, same as the webhook path.
						payload: {
							ownerId: charge.ownerId.value,
							invoiceId: charge.invoiceId.value,
							reason: `GATEWAY_CHARGE_FAILED:${charge.gatewayTxId}`,
							...upgradePair,
						},
					}),
					tx,
				)
			})
			return
		}
		// status === 'pending' → still settling; leave it. Past max age it is a genuine stuck async
		// settlement (a gateway anomaly): alert operators exactly once (claim-guarded) and keep
		// querying it next sweep — never auto-fail a maybe-settling payment (would risk dunning a payer).
		const maxAgeMs = ProductConfig.env.BILLING_PENDING_RECONCILE_MAX_AGE_HOURS * 60 * 60_000
		if (now.getTime() - charge.createdAt.getTime() >= maxAgeMs) {
			await this.withTransaction(undefined, async tx => {
				if (await this.idempotencyGuard.claim(IdempotencyScope.RECONCILE_STALE_ALERT, gatewayTxId, tx)) {
					this.operatorAlert.emit({
						kind: 'charge-stale',
						key: gatewayTxId,
						runbook:
							"check the gateway dashboard for this charge's real status — if it settled or failed there but is not reflected here, the settlement webhook was likely dropped.",
						context: {
							gatewayTxId,
							ownerId: charge.ownerId.value,
							invoiceId: charge.invoiceId.value,
							maxAgeHours: ProductConfig.env.BILLING_PENDING_RECONCILE_MAX_AGE_HOURS,
						},
					})
				}
			})
		}
	}

	protected async handle(): Promise<void> {
		// Unreachable — ChargeReconciler is a directly-injected service (reconcile()), never dispatched
		// via execute()/Mediator. See the class doc comment.
		throw new Error('ChargeReconciler.handle() is unreachable — call reconcile() directly')
	}
}
