import { Handler } from '@template/core-typescript'
import { BaseError } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import { PaymentProviderFactory } from '@billing/services'
import { ChargeRepository, InvoiceRepository } from '@billing/repositories'

import { RefundSource } from '@billing/enums/RefundSource'
import { InvoiceRefundedEvent } from '@billing/events'
import type { InterfaceErrors } from '@billing/errors'
import { IdempotencyGuard } from '@template/core-typescript'
import { IdempotencyScope } from '@shared/enums'
import { ChargeStatus } from '@template/contracts-typescript/wire/enums'

export const RefundInvoiceInputSchema = z.object({
	ownerId: z.string().min(1),
	engineInvoiceId: z.string().min(1),
	amountCents: z.number().int().positive().optional(),
})

export const RefundInvoiceOutputSchema = z.object({
	ok: z.boolean(),
})

/**
 * Operator command: refunds a settled invoice.
 *
 * Cancels the underlying gateway charge (when a succeeded `Charge` with a `gatewayTxId`
 * exists — a partial/statement refund with no captured charge is still a legitimate operator
 * action). The invoice ledger is append-only: there is no status flip — the gateway's refund
 * webhook (ExternalChargeRefundedEvent → ExternalChargeRefundedHandler) records a REFUND credit
 * note, and InvoiceStatusDeriver then derives REFUNDED from the credit-note sum ("derive, don't flip").
 *
 * Raises `InvoiceRefundedEvent` so downstream reactions (access revocation, dunning, etc.)
 * can subscribe without coupling to this use case.
 */
@injectable()
export class RefundInvoice extends Handler<typeof RefundInvoiceInputSchema, typeof RefundInvoiceOutputSchema> {
	readonly name = 'refund_invoice' as const
	readonly inputSchema = RefundInvoiceInputSchema
	readonly outputSchema = RefundInvoiceOutputSchema

	constructor(
		private providerFactory: PaymentProviderFactory,
		private chargeRepository: ChargeRepository,
		private invoiceRepository: InvoiceRepository,
		private idempotencyGuard: IdempotencyGuard,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		// Phase 1: validate + resolve the (already-succeeded) gateway charge to cancel — read-only,
		// no local mutation yet, committed/closed BEFORE the external call below.
		// `tx` (if a caller ever passes one in) is honored here — same as before.
		const chargeToCancel = await this.withTransaction(tx, async tx => {
			const invoice = await this.invoiceRepository.findByEngineInvoiceId(input.engineInvoiceId, tx)
			if (!invoice || invoice.ownerId.value !== input.ownerId) {
				throw new BaseError<InterfaceErrors>('UNAUTHORIZED')
			}

			const charge = await this.chargeRepository.findByInvoiceId(input.engineInvoiceId, tx)
			return charge?.status === ChargeStatus.SUCCEEDED && charge.gatewayTxId
				? { gatewayTxId: charge.gatewayTxId, platform: charge.platform, amountCents: charge.amountCents }
				: null
		})

		// Phase 2: the provider call runs OUTSIDE any DB transaction. `cancelCharge` carries its own
		// Idempotency-Key so it's safe to repeat — there's no local claim to release here on failure
		// (there was no local mutation yet in phase 1); a thrown error simply propagates and a retry
		// re-validates + re-issues the same safe-to-repeat call. The key includes the AMOUNT: two
		// distinct partial refunds against the same charge ($10 then $15) must be distinct gateway
		// operations — a bare `cancel:${gatewayTxId}` made the second a replay of the first (the
		// gateway no-ops, but Phase 3 would record a refund that never moved money).
		if (chargeToCancel) {
			await this.providerFactory.for(chargeToCancel.platform).cancelCharge({
				gatewayTxId: chargeToCancel.gatewayTxId,
				amountCents: input.amountCents,
				idemKey: `cancel:${chargeToCancel.gatewayTxId}:${input.amountCents ?? 'full'}`,
			})
		}

		// Phase 3: record the accepted refund as an AUDIT fact. The ledger is append-only: no status
		// flip here, and EVERY money effect (credit note, derived REFUNDED, access revocation) lands
		// via the gateway's confirmed-refund webhook (ExternalChargeRefundedHandler), never here.
		// When the gateway call happened (chargeToCancel present), the payload also carries the
		// refund EXPECTATION (gatewayTxId/expectedAmountCents/source): the marker RefundReconcileJob
		// sweeps when the confirming webhook never arrives. Without a gateway call, the event stays
		// audit-only (no expectation fields, nothing for the sweep to poll against).
		//
		// Idempotency: only the EXPECTATION-bearing branch needs the guard — it's keyed PER-PARTIAL
		// (`{invoiceId}:{gatewayTxId}:{amountCents ?? 'full'}`), mirroring the `cancelCharge` idemKey
		// from Phase 2, so a repeat of the SAME partial skips the save while two genuinely DISTINCT
		// partials each still emit. Without this, a double-click on the same partial would persist TWO
		// expectations for one gateway refund — RefundReconcileJob sums expectations per (invoiceId,
		// gatewayTxId), so the inflated total can never match the real refund and the invoice never
		// reconciles. The audit-only branch (no chargeToCancel) has no gateway op to dedupe against, so
		// it is never guarded — it always records the audit fact.
		await this.withTransaction(undefined, async tx => {
			let claimed = true
			if (chargeToCancel) {
				claimed = await this.idempotencyGuard.claim(
					IdempotencyScope.REFUND_EXPECTATION,
					`${input.engineInvoiceId}:${chargeToCancel.gatewayTxId}:${input.amountCents ?? 'full'}`,
					tx,
				)
			}
			if (!claimed) return

			await this.domainEventRepository.save(
				new InvoiceRefundedEvent({
					entityId: input.engineInvoiceId,
					ownerId: input.ownerId,
					payload: {
						ownerId: input.ownerId,
						invoiceId: input.engineInvoiceId,
						...(input.amountCents !== undefined ? { amountCents: input.amountCents } : {}),
						...(chargeToCancel
							? {
									gatewayTxId: chargeToCancel.gatewayTxId,
									expectedAmountCents: input.amountCents ?? chargeToCancel.amountCents,
									source: RefundSource.OPERATOR,
								}
							: {}),
					},
				}),
				tx,
			)
		})

		return { ok: true }
	}
}
