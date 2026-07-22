import { injectable } from 'tsyringe-neo'
import { Handler } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { IdempotencyGuard } from '@template/core-typescript'
import { IdempotencyScope } from '@shared/enums'
import { ProductConfig } from '@shared/config'
import { ChargeRepository, InvoiceRepository, SubscriptionRepository } from '@billing/repositories'

import { DeclineClassifier } from '@billing/services/DeclineClassifier'
import { DunningRetryPolicy } from '@billing/services/DunningRetryPolicy'
import { DunningStartedEvent } from '@billing/events/DunningStartedEvent'
import { DunningAttemptFailedEvent } from '@billing/events/DunningAttemptFailedEvent'
import { DunningSucceededEvent } from '@billing/events/DunningSucceededEvent'
import { RecoveredVia } from '@billing/enums/RecoveredVia'
import { LoggingService } from '@template/core-typescript'
import { ChargeStatus } from '@template/contracts-typescript/wire/enums'

// Inert schema pair — mirrors SubscriptionCharger: DunningLifecycle is never dispatched via
// execute()/Mediator (no use-case name, no controller). It extends Handler ONLY to reuse
// withTransaction()/domainEventRepository from the base class. onChargeFailed()/onSettled() below
// are the sole entry points.
const DunningLifecycleInputSchema = z.object({})

/**
 * Derives the dunning PHASE straight from the Charge ledger (no read-model) and emits the
 * matching lifecycle event, exactly once per phase (its own idempotency claim per event kind).
 * Called from the charge-outcome reactions:
 *
 *  - `onChargeFailed` — InvoicePaymentFailedHandler, after a renewal charge fails. The FIRST
 *    FAILED charge on an invoice emits DunningStartedEvent; every subsequent one emits
 *    DunningAttemptFailedEvent. Excludes optimistic-upgrade-revert failures (Decision 8: a
 *    declined upgrade proration isn't dunning at all — the plan flip is reverted instead).
 *  - `onSettled` — ExternalCardChargeSucceededHandler / InvoicePaidHandler, after an invoice
 *    settles. Only emits DunningSucceededEvent if the invoice had ≥1 prior FAILED charge —
 *    otherwise it never entered dunning to begin with.
 */
@injectable()
export class DunningLifecycle extends Handler<typeof DunningLifecycleInputSchema> {
	readonly name = 'dunning_lifecycle' as const
	readonly inputSchema = DunningLifecycleInputSchema
	readonly outputSchema = z.void()

	constructor(
		private idempotencyGuard: IdempotencyGuard,
		private chargeRepository: ChargeRepository,
		private invoiceRepository: InvoiceRepository,
		private subscriptionRepository: SubscriptionRepository,
		private classifier: DeclineClassifier,
		private policy: DunningRetryPolicy,
		private loggingService: LoggingService,
	) {
		super()
	}

	/** `isUpgrade` true → an optimistic-upgrade-revert failure, not dunning (Decision 8) — no-op. */
	async onChargeFailed(ownerId: string, invoiceId: string, isUpgrade: boolean, tx: Transaction): Promise<void> {
		if (isUpgrade) return

		const charges = await this.chargeRepository.listByInvoiceId(invoiceId, tx)
		const failed = charges.filter(c => c.status === ChargeStatus.FAILED)
		if (failed.length === 0) return

		const failedCount = failed.length
		// listByInvoiceId is oldest-first.
		const first = failed[0]!
		const last = failed[failed.length - 1]!
		const classification = this.classifier.classify(last.declineCode)
		const maxAttempts = ProductConfig.env.BILLING_DUNNING_MAX_ATTEMPTS
		// DunningRetryPolicy.attemptNo is 0-indexed on the LAST FAILED charge's own index (same
		// convention as DunningRetryJob.retryOne: `candidate.attemptNo - 1`) — `failedCount` here is
		// a 1-indexed COUNT, so the policy check subtracts 1 to land on the same index.
		const nextRetryAt = this.policy.nextRetryAt({
			attemptNo: failedCount - 1,
			classification,
			firstFailedAt: first.createdAt,
			now: new Date(),
		})

		if (failedCount === 1) {
			// Read-only lookups first — nothing here is a side effect, so this is safe to do before
			// claiming. The invoice is the PREFERRED source for planName: it's a snapshot taken at
			// issue time (InvoiceService.issue stamps it from the subscription that existed THEN), so
			// it survives a subscription that is transiently or permanently missing NOW (e.g. a race,
			// or a downstream data inconsistency). Falling back to a live subscription lookup only
			// covers invoices issued before any subscription existed (planName not yet resolvable then).
			const invoice = await this.invoiceRepository.findByEngineInvoiceId(invoiceId, tx)
			const planName = invoice?.planName ?? (await this.subscriptionRepository.findByOwnerId(ownerId, tx))?.planName ?? null

			// Guard BEFORE taking the claim: if we claimed first and planName is genuinely
			// unresolvable, the claim would be committed for good and a later redelivery could never
			// emit DunningStarted. Claim only once we know we will actually emit. This is now a rare
			// data-inconsistency path (a failed charge whose invoice never got a plan snapshot AND has
			// no live subscription either) — surface it instead of silently dropping the email.
			if (!planName) {
				this.loggingService.warn({
					content: {
						message: 'DunningLifecycle onChargeFailed: no resolvable planName — skipping DunningStartedEvent',
						invoiceId,
						ownerId,
					},
				})
				return
			}
			if (!(await this.idempotencyGuard.claim(IdempotencyScope.INVOICE_DUNNING_STARTED, invoiceId, tx))) return

			await this.domainEventRepository.save(
				new DunningStartedEvent({
					entityId: invoiceId,
					ownerId,
					payload: {
						ownerId,
						invoiceId,
						planName,
						amountCents: invoice?.amountCents ?? 0,
						...(last.declineCode ? { declineCode: last.declineCode } : {}),
						classification,
						attemptNo: 1,
						maxAttempts,
						nextRetryAt: nextRetryAt?.toISOString() ?? null,
					},
				}),
				tx,
			)
		} else {
			if (!(await this.idempotencyGuard.claim(IdempotencyScope.INVOICE_DUNNING_ATTEMPT, `${invoiceId}:${failedCount}`, tx))) return

			await this.domainEventRepository.save(
				new DunningAttemptFailedEvent({
					entityId: invoiceId,
					ownerId,
					payload: {
						ownerId,
						invoiceId,
						attemptNo: failedCount,
						remainingAttempts: Math.max(0, maxAttempts - failedCount),
						...(last.declineCode ? { declineCode: last.declineCode } : {}),
						nextRetryAt: nextRetryAt?.toISOString() ?? null,
					},
				}),
				tx,
			)
		}
	}

	/** Only emits DunningSucceededEvent if the invoice had ≥1 prior FAILED charge. */
	async onSettled(ownerId: string, invoiceId: string, recoveredVia: RecoveredVia, tx: Transaction): Promise<void> {
		const charges = await this.chargeRepository.listByInvoiceId(invoiceId, tx)
		const failedCount = charges.filter(c => c.status === ChargeStatus.FAILED).length
		if (failedCount === 0) return

		if (!(await this.idempotencyGuard.claim(IdempotencyScope.INVOICE_DUNNING_SUCCEEDED, invoiceId, tx))) return

		await this.domainEventRepository.save(
			new DunningSucceededEvent({
				entityId: invoiceId,
				ownerId,
				payload: { ownerId, invoiceId, totalAttempts: failedCount + 1, recoveredVia },
			}),
			tx,
		)
	}

	protected async handle(): Promise<void> {
		// Unreachable — DunningLifecycle is a directly-injected service (onChargeFailed/onSettled),
		// never dispatched via execute()/Mediator. See the class doc comment.
		throw new Error('DunningLifecycle.handle() is unreachable — call onChargeFailed()/onSettled() directly')
	}
}
