import { Repository } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { Charge } from '../../entities'
import { DeclineReason } from '@template/contracts-typescript/wire/enums'

/**
 * A ledger-derived dunning candidate — one row per (ownerId, engineInvoiceId) currently in
 * dunning (≥1 FAILED Charge whose latest attempt is FAILED — see `listDunningCandidates`).
 * `attemptNo` is the count of FAILED attempts so far (the next charge uses this as its attemptNo);
 * `amountCents` is the latest FAILED attempt's amount (what the retry re-charges); `declineCode` is
 * the latest FAILED attempt's reason. No read-model — always derived fresh from `billing_charges`
 * at sweep time.
 */
export interface DunningCandidate {
	ownerId: string
	engineInvoiceId: string
	attemptNo: number
	firstFailedAt: Date
	amountCents: number
	declineCode?: DeclineReason
}

export abstract class ChargeRepository extends Repository<Charge> {
	abstract findById(id: string, transaction?: Transaction): Promise<Charge | undefined>
	abstract findByInvoiceId(invoiceId: string, transaction?: Transaction): Promise<Charge | undefined>
	/** The most recent charge attempt for an invoice (createdAt desc, then attemptNo desc). */
	abstract findLatestByInvoiceId(invoiceId: string, transaction?: Transaction): Promise<Charge | undefined>
	/** The earliest SUCCEEDED charge for an invoice — existence == "invoice is paid", its createdAt == paidAt. */
	abstract findSucceededByInvoiceId(invoiceId: string, transaction?: Transaction): Promise<Charge | undefined>
	/**
	 * The charge carrying this gateway transaction id — the charge-identity linchpin for settlement +
	 * reconciliation. Pass `invoiceId` (settlement always knows it) to SCOPE the lookup to that invoice:
	 * a gateway tx-id is unique only WITHIN a merchant account, so an unscoped match could bind a charge
	 * on a different owner/invoice that happens to share the id and settle the wrong invoice. Scoping by
	 * invoiceId (not platform) avoids depending on a platform value the raw card-webhook path derives
	 * from the current card rather than the capturing gateway.
	 */
	abstract findByGatewayTxId(gatewayTxId: string, invoiceId?: string, transaction?: Transaction): Promise<Charge | undefined>
	/**
	 * ALL charge attempts for an invoice (any status), oldest first. Drives the dunning lifecycle —
	 * it derives the dunning phase (Started/AttemptFailed/Succeeded) straight from this ledger
	 * slice, distinct from `listDunningCandidates` (which scans across invoices/owners).
	 */
	abstract listByInvoiceId(invoiceId: string, transaction?: Transaction): Promise<Charge[]>
	/**
	 * Invoices currently in dunning at `now`: not voided, owned by a PAST_DUE subscription, with ≥1
	 * FAILED Charge whose LATEST attempt is FAILED (0 SUCCEEDED, OR the latest FAILED is newer than
	 * the latest SUCCEEDED — so a premature-SUCCEEDED-then-declined renewal is included while a
	 * genuinely settled FAILED-then-SUCCEEDED invoice is excluded). Drives the dunning retry job —
	 * the retry/cancel context (`attemptNo`, `firstFailedAt`, `amountCents`, `declineCode`) is
	 * derived from the `billing_charges` ledger, never a stored read-model.
	 */
	abstract listDunningCandidates(now: Date, transaction?: Transaction): Promise<DunningCandidate[]>
	/**
	 * Stale PENDING charges the reconciliation sweep (`ReconcilePendingChargesJob`, W2b) should ask
	 * the gateway about: `status = PENDING`, `createdAt < olderThan`, AND a non-null `gatewayTxId`
	 * (the charge-identity linchpin `getChargeStatus` needs — a PENDING row with no gatewayTxId
	 * can't be resolved and is never swept). Oldest-first; no cap.
	 */
	abstract listStalePending(olderThan: Date, transaction?: Transaction): Promise<Charge[]>
	/**
	 * The UNPOLLABLE complement of `listStalePending`: stale PENDING charges with a NULL
	 * `gatewayTxId` — impossible to reconcile (no id to ask the gateway about) and previously
	 * invisible forever. The sweep alerts operators about them once (claim-guarded) instead of
	 * silently never resolving the invoice. Should be empty today (every `pending` gateway result
	 * stamps a txId); a row here means a new gateway/path broke that assumption.
	 */
	abstract listStaleUnpollablePending(olderThan: Date, transaction?: Transaction): Promise<Charge[]>
}
