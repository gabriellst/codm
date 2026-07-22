import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { IdempotencyGuard } from '@template/core-typescript'
import { IdempotencyScope } from '@shared/enums'
import { ExternalInvoicePaymentFailedEvent } from '@billing/events/ExternalInvoicePaymentFailedEvent'
import { InvoicePaymentFailedEvent } from '@billing/events/InvoicePaymentFailedEvent'
import { InvoiceStatus } from '@billing/enums/InvoiceStatus'
import { InvoiceRepository } from '@billing/repositories'
import { InvoiceStatusDeriver, ChargeSettler } from '@billing/services'

@injectable()
export class ExternalInvoicePaymentFailedHandler extends EventHandler<typeof ExternalInvoicePaymentFailedEvent> {
	readonly event = ExternalInvoicePaymentFailedEvent

	constructor(
		private idempotencyGuard: IdempotencyGuard,
		private invoiceRepository: InvoiceRepository,
		private invoiceStatusDeriver: InvoiceStatusDeriver,
		private chargeSettler: ChargeSettler,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.payload.ownerId
		const { engineInvoiceId, reason } = event.payload

		await this.withTransaction(undefined, async (tx: Transaction) => {
			// Phase-D posture on the "fully retires in D" note: the settled-invoice guard is KEPT, not
			// removed. Its job was never to protect a STORED access flip — access now DERIVES
			// (SubscriptionAccessDeriver reads the invoice's cancellation/trial anchors + the invoice
			// ledger, NEVER the stored `status` column, so the InvoicePaymentFailedHandler.markPastDue
			// flip no longer gates any access decision). What the guard still does is the one thing that
			// stays valid post-derivation: it SUPPRESSES DUNNING for an invoice we actually collected.
			//
			// The GATEWAY is the source of truth for collection. This handler exists to SUPPRESS dunning
			// for an invoice we already collected off the gateway, when an external engine-side
			// payment-failure signal arrives for an invoice we already settled. Ignoring those is still
			// correct — never dun the owner for money we already have. A GENUINE renewal-charge failure
			// does NOT come through here: it flows gateway → ExternalChargeFailedHandler →
			// InvoicePaymentFailedEvent → DunningLifecycle (derives the phase from the Charge ledger) →
			// DunningStartedEvent/DunningAttemptFailedEvent → DunningStartedHandler/
			// DunningAttemptFailedHandler, so the dunning email fires independently of this guard. Full
			// retirement of the stored status-flip machinery is deferred because that column still
			// drives the native renewal clock (listRenewalDue / listByStatus), not access — a later
			// cleanup task drops it.
			//
			// "Paid" is DERIVED from charge facts (a SUCCEEDED charge), not read from the invoice's
			// stored status column — the settlement handlers leave that charge on every path.
			const invoice = await this.invoiceRepository.findByEngineInvoiceId(engineInvoiceId, tx)

			// Out-of-order Kafka delivery: the engine's payment-failure signal can arrive before our OWN
			// invoice.issued (we haven't mirrored this invoice yet). This handler is a SUPPRESSOR for
			// engine-side signals, not the source of a genuine renewal failure — a real renewal failure
			// flows through our own issue+charge pipeline (ExternalInvoiceIssuedHandler ->
			// SubscriptionCharger/ExternalChargeFailedHandler), which produces the real dunning entry
			// once we've mirrored the invoice. Claiming INVOICE_FAILED and emitting
			// InvoicePaymentFailedEvent here would flip the subscription PAST_DUE
			// (InvoicePaymentFailedHandler.markPastDue) with NO recoverable dunning state (amount
			// unknown -> ChargeSettler.failCharge's amountCents<=0 guard skips the FAILED charge), and
			// the later real invoice.issued would then bail on its renewal-charge branch because the
			// subscription is no longer ACTIVE -- stranding the owner in PAST_DUE forever with no
			// dunning email, no retry, no cancel. Defer entirely instead.
			if (!invoice) return

			const derived = await this.invoiceStatusDeriver.derive(
				{ invoiceId: invoice.id.value, amountCents: invoice.amountCents, dueDate: invoice.dueDate },
				new Date(),
				tx,
			)
			if (derived.status === InvoiceStatus.PAID) return

			// Guard so outbox retries don't append duplicate failure events.
			if (!(await this.idempotencyGuard.claim(IdempotencyScope.INVOICE_FAILED, engineInvoiceId, tx))) return

			// An engine-relayed renewal failure (boleto/PIX/engine-initiated) records NO FAILED Charge —
			// SubscriptionCharger never ran on this path either. Without a FAILED ledger row the invoice
			// never enters dunning (DunningLifecycle sees 0 FAILED → no email; listDunningCandidates
			// never picks it up). Record the FIRST failure here via the shared charge-identity primitive.
			// This path carries no upgrade pair, so it is never an upgrade proration → isUpgrade=false.
			// No gatewayTxId — the engine relay carries none; `failCharge`'s PENDING-in-place branch
			// safely no-ops for an undefined gatewayTxId instead of transitioning someone else's attempt.
			const recordedFailure = await this.chargeSettler.failCharge(
				{ ownerId, engineInvoiceId, amountCents: invoice.amountCents, isUpgrade: false },
				tx,
			)

			// Same consistency rule as the other two ingress paths: only emit when a FAILED fact was
			// actually recorded. This path never carries an upgrade pair, so there is no second
			// condition — a known, non-settled invoice with a positive amount always records (see
			// `ChargeSettler.failCharge`), so this stays a no-op change for the covered flows; a
			// zero/negative-amount invoice now correctly emits nothing instead of flipping the
			// subscription PAST_DUE with no recoverable dunning state.
			if (recordedFailure) {
				await this.domainEventRepository.save(
					new InvoicePaymentFailedEvent({
						entityId: engineInvoiceId,
						ownerId,
						payload: { ownerId, invoiceId: engineInvoiceId, reason },
					}),
					tx,
				)
			} else {
				// Recorded nothing (e.g. an in-flight PENDING attempt this relay can't disambiguate, or an
				// already-paid invoice): RELEASE the INVOICE_FAILED latch claimed above within this tx, so a
				// later genuine failure signal for the invoice can still claim it and enter dunning instead
				// of being permanently swallowed by a burned latch.
				await this.idempotencyGuard.release(IdempotencyScope.INVOICE_FAILED, engineInvoiceId, tx)
			}
		})
	}
}
