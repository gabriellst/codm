import { Handler } from '@template/core-typescript'
import { BaseError } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import { PaymentProviderFactory, RefundPolicy } from '@billing/services'
import { ChargeRepository, CreditNoteRepository, InvoiceRepository } from '@billing/repositories'
import { RefundBasis } from '@billing/enums/RefundBasis'
import { RefundSource } from '@billing/enums/RefundSource'
import { InvoiceRefundedEvent } from '@billing/events'
import type { InterfaceErrors } from '@billing/errors'
import { IdempotencyGuard } from '@template/core-typescript'
import { IdempotencyScope } from '@shared/enums'

export const RequestRefundInputSchema = z.object({
	ownerId: z.string().min(1),
	engineInvoiceId: z.string().min(1),
})

export const RequestRefundOutputSchema = z.object({
	/** The refundable amount computed by RefundPolicy and requested from the gateway (0 when nothing is owed). */
	requestedAmountCents: z.number().int().nonnegative(),
	// The shared RefundBasis enum (also returned by RefundPolicy) — never an inline literal that can drift.
	basis: z.enum(RefundBasis),
})

/**
 * User-facing refund request — the policy-driven sibling of the operator's `RefundInvoice`.
 *
 * Computes a fair, usage-aware refundable amount (`RefundPolicy`: CDC withdrawal window → full;
 * else pro-rata of the unused period) from the invoice + its SUCCEEDED charge + Σ credit notes,
 * then asks the gateway to refund exactly that amount. Nothing refundable (basis NONE / amount 0)
 * short-circuits with NO gateway call.
 *
 * The credit note is NOT written here — it lands via the confirmed-refund webhook path
 * (`ExternalChargeRefundedHandler` → `CreditNoteService`), keeping ledger issuance driven by a
 * gateway fact, never speculatively. Status then derives from Σ credit notes ("derive, don't flip").
 *
 * Idempotency: the gateway `cancelCharge` carries `Idempotency-Key: refund:${engineInvoiceId}`, so a
 * repeated identical request never double-refunds (one refund per invoice). The Phase-3 refund
 * EXPECTATION emission mirrors that same per-invoice key via `IdempotencyScope.REFUND_EXPECTATION` —
 * without it, a double-click that recomputes a shrinking PRO_RATA amount would persist TWO
 * expectations for the same gateway refund, and RefundReconcileJob (which SUMS expectations per
 * (invoiceId, gatewayTxId)) would then see an inflated expectedTotalCents the real refund can never
 * match — the invoice never reconciles and alerts forever.
 */
@injectable()
export class RequestRefund extends Handler<typeof RequestRefundInputSchema, typeof RequestRefundOutputSchema> {
	readonly name = 'request_refund' as const
	readonly inputSchema = RequestRefundInputSchema
	readonly outputSchema = RequestRefundOutputSchema

	constructor(
		private refundPolicy: RefundPolicy,
		private providerFactory: PaymentProviderFactory,
		private chargeRepository: ChargeRepository,
		private creditNoteRepository: CreditNoteRepository,
		private invoiceRepository: InvoiceRepository,
		private idempotencyGuard: IdempotencyGuard,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		// Phase 1: load the facts read-only (committed/closed BEFORE any external call). Missing/foreign
		// invoice collapses into UNAUTHORIZED — the IDOR guard the sibling usecases share.
		const facts = await this.withTransaction(tx, async tx => {
			const invoice = await this.invoiceRepository.findByInvoiceId(input.engineInvoiceId, tx)
			if (!invoice || invoice.ownerId.value !== input.ownerId) {
				throw new BaseError<InterfaceErrors>('UNAUTHORIZED')
			}

			const charge = await this.chargeRepository.findSucceededByInvoiceId(input.engineInvoiceId, tx)
			const creditedCents = await this.creditNoteRepository.sumByInvoiceId(input.engineInvoiceId, tx)
			return { invoice, charge, creditedCents }
		})

		const { amountCents, basis } = this.refundPolicy.refundableFor({
			invoice: facts.invoice,
			charges: facts.charge ? [facts.charge] : [],
			creditedCents: facts.creditedCents,
			now: new Date(),
		})

		// Nothing refundable → do NOT touch the gateway. This is the typed "nothing refundable" result.
		// (basis NONE always carries amount 0; a fully-elapsed PRO_RATA can also compute to 0.)
		if (basis === RefundBasis.NONE || amountCents === 0 || !facts.charge?.gatewayTxId) {
			return { requestedAmountCents: 0, basis: amountCents === 0 ? basis : RefundBasis.NONE }
		}

		// Phase 2: the partial refund runs OUTSIDE any DB tx. Pinned to the charge's own platform (never
		// re-routed), keyed per invoice so a retry is safe. NO local write / NO credit note here — the
		// credit note is issued only once the gateway confirms the refund (T5's webhook path).
		const gatewayTxId = facts.charge.gatewayTxId
		await this.providerFactory.for(facts.charge.platform).cancelCharge({
			gatewayTxId,
			amountCents,
			// Keyed PER INVOICE (never the amount): RequestRefund is the customer-facing refund and a given
			// invoice is refunded at most once, so a repeated request (double-click / client retry) must be
			// a gateway no-op. Encoding the amount here was a MONEY BUG — the credit note is written async by
			// the confirming webhook, so `creditedCents` is unchanged between two requests, while the PRO_RATA
			// amount SHRINKS with wall-clock time → two requests carry different amounts → different keys →
			// the gateway refunds TWICE. Prefer the false-negative (a blocked 2nd refund) over a double refund.
			idemKey: `refund:${input.engineInvoiceId}`,
		})

		// Phase 3: record the refund EXPECTATION -- the marker RefundReconcileJob sweeps when the
		// confirming webhook never arrives. Post-gateway on purpose: an expectation must only exist
		// for a cancel the gateway ACCEPTED (the early return above already guarantees this branch is
		// only reached when the gateway call happened).
		//
		// Idempotency: the claim key mirrors the gateway idemKey above (per invoice — one refund per
		// invoice). Without this guard, a double-click that recomputes a shrinking PRO_RATA amount
		// (the credit note lands async via webhook, so `creditedCents` is unchanged between the two
		// requests while wall-clock time keeps shrinking the pro-rata) would persist TWO expectations
		// for the SAME gateway refund — RefundReconcileJob sums expectations per (invoiceId,
		// gatewayTxId), so the inflated total can never match the real refund and the invoice never
		// reconciles. If already claimed, skip the save (the gateway already collapsed the call itself).
		await this.withTransaction(undefined, async tx => {
			const claimed = await this.idempotencyGuard.claim(IdempotencyScope.REFUND_EXPECTATION, input.engineInvoiceId, tx)
			if (!claimed) return

			await this.domainEventRepository.save(
				new InvoiceRefundedEvent({
					entityId: input.engineInvoiceId,
					ownerId: input.ownerId,
					payload: {
						ownerId: input.ownerId,
						invoiceId: input.engineInvoiceId,
						amountCents,
						gatewayTxId,
						expectedAmountCents: amountCents,
						source: RefundSource.POLICY,
					},
				}),
				tx,
			)
		})

		return { requestedAmountCents: amountCents, basis }
	}
}
