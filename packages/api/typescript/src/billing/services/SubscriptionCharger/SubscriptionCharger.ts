import { injectable } from 'tsyringe-neo'
import { Handler } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { tryCatchAsync } from '@template/core-typescript'
import { IdempotencyGuard, CommandQueue } from '@template/core-typescript'
import { IdempotencyScope } from '@shared/enums'
import { ProductConfig } from '@shared/config'
import { Charge, type PaymentMethod } from '@billing/entities'

import { ChargeRepository } from '@billing/repositories'
// Direct subpaths, NOT the '@billing/services' barrel — avoids the module cycle that TDZ-crashes
// at runtime (this module is re-exported by that barrel). reconcileJob is a deliberate leaf.
import { PaymentProviderFactory, type ChargeResult } from '@billing/services/PaymentProvider'
import { RECONCILE_CHARGE_COMMAND, reconcileJobId } from '@billing/services/ChargeReconciler/reconcileJob'
import { InvoicePaymentFailedEvent } from '@billing/events/InvoicePaymentFailedEvent'
import { LoggingService } from '@template/core-typescript'
import { PlanName } from '@template/contracts-typescript/wire/enums'

// Inert schema pair — SubscriptionCharger is never dispatched via execute()/Mediator (no
// use-case name, no controller). It extends Handler ONLY to reuse withTransaction()/
// domainEventRepository from the base class (and to ride the bindContainer cascade when it's
// injected into another Handler, e.g. ExternalInvoiceIssuedHandler / the future DunningRetryJob).
// charge() below is the sole entry point.
const SubscriptionChargerInputSchema = z.object({})

/**
 * Extracted from ExternalInvoiceIssuedHandler.chargeStoredCredential: the stored-credential
 * charge orchestration (idemKey `${engineInvoiceId}:${attemptNo}` → provider chargeStoredOnSession
 * (CIT, cycle 'first') / chargeOffSession (MIT, cycle 'subsequent') → record a Charge with
 * declineCode → InvoicePaymentFailedEvent on a synchronous decline). Reused by the issued-handler
 * (1st charge / renewal) and by the DunningRetryJob (re-tries a PAST_DUE invoice on schedule) —
 * same idemKey shape, same Charge ledger, same failure event either way.
 *
 * The idempotency CLAIM is the caller's responsibility (issued-handler / DunningRetryJob claim
 * `INVOICE_CHARGE:${engineInvoiceId}:${attemptNo}` before calling charge()) — this only RELEASES
 * the claim on a thrown provider error, so a redelivery can genuinely retry instead of silently
 * no-op'ing against a claim that was never fulfilled.
 */
@injectable()
export class SubscriptionCharger extends Handler<typeof SubscriptionChargerInputSchema> {
	readonly name = 'subscription_charger' as const
	readonly inputSchema = SubscriptionChargerInputSchema
	readonly outputSchema = z.void()

	constructor(
		private idempotencyGuard: IdempotencyGuard,
		private chargeRepository: ChargeRepository,
		private providerFactory: PaymentProviderFactory,
		private commandQueue: CommandQueue,
		private loggingService: LoggingService,
	) {
		super()
	}

	async charge(p: {
		ownerId: string
		engineInvoiceId: string
		amountCents: number
		attemptNo: number
		paymentMethod: PaymentMethod
		cycle: 'first' | 'subsequent'
		upgrade?: { fromPlan: PlanName; toPlan: PlanName }
	}): Promise<ChargeResult> {
		// The provider call runs OUTSIDE any DB transaction. The idemKey is scoped per (invoice,
		// attemptNo) — NOT a fixed engineInvoiceId — so a dunning retry (attemptNo N+1) charges
		// afresh at the gateway instead of replaying the prior attempt's decline.
		const idemKey = `${p.engineInvoiceId}:${p.attemptNo}`
		const provider = this.providerFactory.for(p.paymentMethod.platform)
		let result: ChargeResult
		try {
			result =
				p.cycle === 'first'
					? await provider.chargeStoredOnSession({
							pmRef: p.paymentMethod.instrument.pmRef,
							ownerId: p.ownerId,
							amountCents: p.amountCents,
							engineInvoiceId: p.engineInvoiceId,
							idemKey,
						})
					: await provider.chargeOffSession({
							pmRef: p.paymentMethod.instrument.pmRef,
							amountCents: p.amountCents,
							idemKey,
							code: p.engineInvoiceId,
							...(p.paymentMethod.instrument.originGatewayTxId ? { originGatewayTxId: p.paymentMethod.instrument.originGatewayTxId } : {}),
						})
		} catch (err) {
			await this.idempotencyGuard.release(IdempotencyScope.INVOICE_CHARGE, idemKey)
			throw err
		}

		// Record the attempt. The authoritative paid/failed outcome arrives later via the
		// gateway webhook / the engine's own invoice.paid event.
		try {
			await this.withTransaction(undefined, async (tx: Transaction) => {
				const charge = Charge.create({
					ownerId: p.ownerId,
					invoiceId: p.engineInvoiceId,
					platform: p.paymentMethod.platform,
					method: p.paymentMethod.instrument.type,
					amountCents: p.amountCents,
					attemptNo: p.attemptNo,
				})

				if (result.ok && result.pending) {
					// Accepted but NOT yet settled (gateway 'pending'/'processing'): leave the Charge PENDING.
					// The authoritative outcome lands via webhook — charge.paid → ChargeSettler.settleCharge
					// marks it SUCCEEDED in place; charge.failed → ChargeSettler.failCharge marks it FAILED
					// in place. Do NOT markSucceeded (the invoice must not DERIVE as PAID before real
					// settlement) and do NOT emit InvoicePaymentFailedEvent (nothing has failed yet).
					// Record the gateway transaction id now — it's the only disambiguator
					// ChargeSettler.failCharge has to tell THIS attempt's authoritative charge.failed apart
					// from a stray/duplicate/out-of-order one for a different charge.
					charge.gatewayTxId = result.gatewayTxId
				} else if (result.ok) {
					charge.markSucceeded(result.gatewayTxId)
				} else {
					charge.markFailed(result.declineCode)
				}

				await this.chargeRepository.save(charge, tx)

				// Arm the per-charge reconcile alarm: if the settlement webhook is dropped, the
				// ReconcileCharge use case fires after the delay and polls the gateway for the real
				// status. Under the TRANSACTIONAL driver (postgres) the enqueue joins THIS tx — alarm
				// and PENDING row commit (or roll back) together, no orphan alarm, no unwatched PENDING.
				// Under a broker driver (BullMQ) the enqueue is Redis network I/O and must NEVER fail
				// the charge-recording tx — best-effort + swallowed: a lost alarm is exactly what the
				// ReconcilePendingChargesJob backstop sweep exists for. ChargeSettler CANCELS this jobId
				// on the charge's terminal transition, so in the happy path it never runs — and if the
				// cancel loses the race, the use case no-ops on a non-PENDING charge.
				if (result.ok && result.pending) {
					const armOpts = {
						delay: ProductConfig.env.BILLING_PENDING_RECONCILE_AFTER_MINUTES * 60_000,
						jobId: reconcileJobId(charge.id.value),
					}
					if (this.commandQueue.transactional) {
						await this.commandQueue.enqueueCommand(RECONCILE_CHARGE_COMMAND, { chargeId: charge.id.value }, armOpts, tx)
					} else {
						const armed = await tryCatchAsync(() =>
							this.commandQueue.enqueueCommand(RECONCILE_CHARGE_COMMAND, { chargeId: charge.id.value }, armOpts),
						)
						if (!armed.success) {
							this.loggingService.warn({
								content: {
									message: 'SubscriptionCharger: best-effort reconcile-alarm enqueue failed (broker driver; sweep backstop covers)',
									chargeId: charge.id.value,
									error: armed.error.message,
								},
							})
						}
					}
				}

				// On a synchronous failure, also surface the failed payment now. The upgrade marker is
				// FORWARDED so the failure handler can revert the optimistic plan flip (event-carried
				// flow state — deliberately not persisted on the invoice line).
				if (!result.ok) {
					await this.domainEventRepository.save(
						new InvoicePaymentFailedEvent({
							entityId: p.engineInvoiceId,
							ownerId: p.ownerId,
							payload: {
								ownerId: p.ownerId,
								invoiceId: p.engineInvoiceId,
								reason: result.reason,
								declineCode: result.declineCode,
								upgradedFromPlan: p.upgrade?.fromPlan,
								upgradedToPlan: p.upgrade?.toPlan,
							},
						}),
						tx,
					)
				}
			})
		} catch (err) {
			// The Charge-recording transaction failed (e.g. a transient DB error) with the
			// INVOICE_CHARGE claim still HELD and NO Charge row written. Release the claim before
			// rethrowing so the redelivered issued/dunning event can genuinely re-attempt this same
			// (invoice, attemptNo) — the gateway idemKey (`${invoice}:${attemptNo}`) makes that
			// re-charge return the SAME gateway result rather than charging the card a second time.
			// (A hard process CRASH mid-charge — not a thrown error — still leaves the claim held and
			// needs a separate reconciliation sweep; that is OUT OF SCOPE here, only the tx-throw
			// release is handled.)
			await this.idempotencyGuard.release(IdempotencyScope.INVOICE_CHARGE, idemKey)
			throw err
		}

		return result
	}

	protected async handle(): Promise<void> {
		// Unreachable — SubscriptionCharger is a directly-injected service (charge()), never
		// dispatched via execute()/Mediator. See the class doc comment.
		throw new Error('SubscriptionCharger.handle() is unreachable — call charge() directly')
	}
}
