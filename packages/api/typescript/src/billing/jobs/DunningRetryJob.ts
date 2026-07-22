import { injectable } from 'tsyringe-neo'
import { Handler } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { tryCatchAsync } from '@template/core-typescript'
import { forEachWithConcurrency } from '@template/core-typescript'
import { ProductConfig } from '@shared/config'
import { IdempotencyGuard } from '@template/core-typescript'
import { IdempotencyScope } from '@shared/enums'
import { ChargeRepository, type DunningCandidate } from '@billing/repositories/ChargeRepository'
import { PaymentMethodRepository, SubscriptionRepository } from '@billing/repositories'
import { DunningRetryPolicy, DeclineClassifier, SubscriptionCharger } from '@billing/services'
import { SubscriptionChangedEvent } from '@template/contracts-typescript/wire/events'
import { DunningFailedEvent } from '@billing/events/DunningFailedEvent'
import { LoggingService } from '@template/core-typescript'

const DunningRetryJobInputSchema = z.object({})

/**
 * Sibling of BillingClockJob: sweeps invoices in dunning (≥1 Charge FAILED and the latest charge is
 * FAILED — i.e. no SUCCEEDED newer than it — invoice not voided, subscription PAST_DUE —
 * `ChargeRepository.listDunningCandidates`), derives
 * the retry context straight from the Charge ledger (no read-model), and re-charges the ones
 * whose `nextRetryAt` (DunningRetryPolicy, informed by DeclineClassifier) is due.
 *
 * `retryOne` first checks the terminal branch (dunning WINDOW exhausted → cancel the subscription +
 * emit DunningFailedEvent, once per invoice via the INVOICE_DUNNING_FAILED claim); only then does it
 * fall through to the retry policy ("no retry due yet (or ever) → skip"). The lifecycle events
 * (Started/AttemptFailed/Succeeded) are emitted elsewhere, on the charge-outcome reaction — not by
 * this sweep.
 */
@injectable()
export class DunningRetryJob extends Handler<typeof DunningRetryJobInputSchema> {
	readonly name = 'billing.dunning.retry' as const
	readonly inputSchema = DunningRetryJobInputSchema
	readonly outputSchema = z.void()

	constructor(
		private chargeRepository: ChargeRepository,
		private paymentMethodRepository: PaymentMethodRepository,
		private subscriptionRepository: SubscriptionRepository,
		private idempotencyGuard: IdempotencyGuard,
		private policy: DunningRetryPolicy,
		private classifier: DeclineClassifier,
		private charger: SubscriptionCharger,
		private loggingService: LoggingService,
	) {
		super()
	}

	/** In-flight gateway charges per tick — the sweep's cost is the gateway round-trip (no batch
	 *  API); bounded concurrency cuts wall-clock ~5× without stampeding the gateway's rate limit.
	 *  Safe: each retryOne opens its own small txs, and the (invoiceId, attemptNo) claim + gateway
	 *  idemKey already make concurrent/overlapping attempts collapse to one charge. */
	private static readonly SWEEP_CONCURRENCY = 5

	async handle(): Promise<void> {
		const now = new Date()
		const candidates = await this.chargeRepository.listDunningCandidates(now)

		await forEachWithConcurrency(candidates, DunningRetryJob.SWEEP_CONCURRENCY, async candidate => {
			const result = await tryCatchAsync(() => this.retryOne(candidate, now))
			if (!result.success) {
				// One owner's failed retry must not starve the rest of the sweep.
				this.loggingService.warn({
					content: {
						message: 'DunningRetryJob failed to retry owner',
						ownerId: candidate.ownerId,
						invoiceId: candidate.engineInvoiceId,
						error: result.error.message,
					},
				})
			}
		})
	}

	private async retryOne(candidate: DunningCandidate, now: Date): Promise<void> {
		// Terminal branch — the dunning WINDOW (anchored on the first failure, not the last) has
		// elapsed with the invoice still unpaid. Cancel the subscription (writes `canceledAt`, the
		// fact SubscriptionAccessDeriver.computeAccess reads to derive CANCELED) and emit
		// DunningFailedEvent once per invoice (INVOICE_DUNNING_FAILED claim guards re-delivery on a
		// later tick). Runs BEFORE the retry policy below — once the window is gone, no retry applies.
		const windowEnd = new Date(candidate.firstFailedAt.getTime() + ProductConfig.env.BILLING_DUNNING_WINDOW_DAYS * 24 * 60 * 60 * 1000)
		if (now >= windowEnd) {
			await this.withTransaction(undefined, async (tx: Transaction) => {
				// Never-dun-a-payer (TOCTOU): `candidates` was read at sweep start, OUTSIDE any tx. If the
				// owner PAID during the sweep, a SUCCEEDED charge now exists on this invoice — cancelling
				// (irreversibly) a customer who just paid, and emailing them a cancellation, is the worst
				// money bug here. The `INVOICE_DUNNING_FAILED` claim is a DIFFERENT scope from the
				// settlement's `INVOICE_SETTLED`, so it gives no mutual exclusion — re-check the ledger
				// inside the tx. Money wins (mirrors failCharge / the reconciler).
				if (await this.chargeRepository.findSucceededByInvoiceId(candidate.engineInvoiceId, tx)) return

				const claimed = await this.idempotencyGuard.claim(IdempotencyScope.INVOICE_DUNNING_FAILED, candidate.engineInvoiceId, tx)
				if (!claimed) return

				await this.subscriptionRepository.cancel(candidate.ownerId, tx)

				// Cross-context recipients (e.g. quota's GovernResourcesOnSubscriptionChangedHandler)
				// re-query current access — without this, a canceled-for-non-payment owner keeps full
				// resources/quotas. Same tx as the cancel + DunningFailedEvent below, guarded by the
				// same INVOICE_DUNNING_FAILED claim so it only fires once per invoice.
				await this.domainEventRepository.saveIntegrationEvent(new SubscriptionChangedEvent({ ownerId: candidate.ownerId, payload: {} }), tx)

				await this.domainEventRepository.save(
					new DunningFailedEvent({
						entityId: candidate.engineInvoiceId,
						ownerId: candidate.ownerId,
						payload: {
							ownerId: candidate.ownerId,
							invoiceId: candidate.engineInvoiceId,
							totalAttempts: candidate.attemptNo,
							...(candidate.declineCode ? { finalDeclineCode: candidate.declineCode } : {}),
						},
					}),
					tx,
				)
			})
			return
		}

		const classification = this.classifier.classify(candidate.declineCode)
		// DunningRetryPolicy.attemptNo is 0-indexed on the LAST FAILED charge's own `attemptNo`
		// (see DunningRetryPolicy.test.ts: attemptNo 0 == only the original charge has failed yet,
		// no retry attempted → offsets[0]/D+2 applies). `candidate.attemptNo` is COUNT(FAILED) — one
		// ahead of that (it already IS the attemptNo the next charge should use) — so the policy
		// check subtracts 1 to land on the last failed attempt's own index.
		const retryAt = this.policy.nextRetryAt({
			attemptNo: candidate.attemptNo - 1,
			classification,
			firstFailedAt: candidate.firstFailedAt,
			now,
		})
		// No retry left (hard decline / cap reached) or not due yet — the window-exhausted case was
		// already handled by the terminal branch above (window strictly implies no retry is due, but
		// a candidate can also have no retry left WITHIN the window — e.g. hard decline).
		if (!retryAt || retryAt > now) return

		const paymentMethod = await this.paymentMethodRepository.findDefaultByOwnerId(candidate.ownerId)
		if (!paymentMethod?.instrument.supportsOffSession) return

		// One MIT charge per (invoiceId, attemptNo) — same claim scope as the renewal charge
		// (ExternalInvoiceIssuedHandler), so a redelivered/overlapping tick at the same attemptNo
		// is a no-op instead of a duplicate charge. AND never-re-charge-a-payer (TOCTOU): if the owner
		// paid during the sweep, a SUCCEEDED charge exists — re-charging would double-charge (and a
		// synchronous MIT capture records a 2nd SUCCEEDED charge with no InvoicePaidEvent, so
		// ChargeSettler's dup-refund never runs). `INVOICE_CHARGE` is a different scope from
		// `INVOICE_SETTLED`, so re-check the ledger inside the claim tx. Money wins.
		const proceed = await this.withTransaction(undefined, async (tx: Transaction) => {
			if (await this.chargeRepository.findSucceededByInvoiceId(candidate.engineInvoiceId, tx)) return false
			return this.idempotencyGuard.claim(IdempotencyScope.INVOICE_CHARGE, `${candidate.engineInvoiceId}:${candidate.attemptNo}`, tx)
		})
		if (!proceed) return

		await this.charger.charge({
			ownerId: candidate.ownerId,
			engineInvoiceId: candidate.engineInvoiceId,
			// The re-charge amount is the latest FAILED charge's amount, folded into the sweep
			// aggregate (no per-candidate findLatestByInvoiceId lookup).
			amountCents: candidate.amountCents,
			attemptNo: candidate.attemptNo,
			paymentMethod,
			cycle: 'subsequent',
		})
	}
}
