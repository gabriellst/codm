import type { Transaction } from '@template/core-typescript'
import { CheckoutSession } from '../../entities'

/**
 * Read/write surface for the local checkout-session record (`billing_checkout_sessions`) — the
 * accelerator's object of record (ChargeRepository/CreditNoteRepository mold: `insert` for the
 * one-time record-at-mint write, `save` for the status transition afterward, no `delete` — a
 * checkout session is never removed, only completed or expired).
 */
export abstract class CheckoutSessionRepository {
	/** One-time write at mint time (`CheckoutSessionRecorder`) — `sessionRef` is unique. */
	abstract insert(session: CheckoutSession, tx?: Transaction): Promise<void>
	/** The session by its natural key — the gateway's own session/order id. */
	abstract findBySessionRef(sessionRef: string, tx?: Transaction): Promise<CheckoutSession | undefined>
	/** Version-guarded update of a status transition (`complete()`/`expire()`). */
	abstract save(session: CheckoutSession, tx?: Transaction): Promise<CheckoutSession>
	/**
	 * PENDING sessions minted before `cutoff` — the sweep backstop's (`ReconcileCheckoutSessionsJob`)
	 * candidate list, `ChargeRepository.listStalePending` mold. Oldest-first; no cap.
	 */
	abstract listStalePending(cutoff: Date, tx?: Transaction): Promise<CheckoutSession[]>
	/** The PENDING session (if any) minted for a given engine invoice. */
	abstract findPendingByInvoiceId(engineInvoiceId: string, tx?: Transaction): Promise<CheckoutSession | undefined>
}
