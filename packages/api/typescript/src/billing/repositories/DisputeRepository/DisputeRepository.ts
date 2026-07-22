import type { Transaction } from '@template/core-typescript'
import { Dispute } from '../../entities'
import { BillingPlatform } from '@template/contracts-typescript/wire/enums'

/**
 * Surface of the dispute record (`billing_disputes`) — CheckoutSessionRepository mold:
 * `insert` on the dispute's first webhook, `save` for the won/lost transition, no delete.
 */
export abstract class DisputeRepository {
	/** First observation of the dispute — (gatewayDisputeRef, platform) is unique. Throws on a
	 *  duplicate (call sites that must observe a conflict as an error keep using this). */
	abstract insert(dispute: Dispute, tx?: Transaction): Promise<void>
	/** Idempotent-by-construction variant of `insert` — a duplicate (gatewayDisputeRef, platform) is a
	 *  silent no-op instead of a throw. The creation handler's natural shape: "record this dispute if
	 *  it isn't already recorded", without a separate findByRef probe first. */
	abstract insertIfNew(dispute: Dispute, tx?: Transaction): Promise<void>
	abstract findByRef(gatewayDisputeRef: string, platform: BillingPlatform, tx?: Transaction): Promise<Dispute | undefined>
	/** Version-guarded update for the won()/lose() transition. */
	abstract save(dispute: Dispute, tx?: Transaction): Promise<Dispute>
	/** The refs already known for an invoice — the ledger side of the drift detector's set-difference. */
	abstract listRefsByInvoiceId(invoiceId: string, tx?: Transaction): Promise<string[]>
}
