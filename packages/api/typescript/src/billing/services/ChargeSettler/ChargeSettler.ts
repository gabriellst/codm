import { injectable } from 'tsyringe-neo'
import { Handler } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { tryCatchAsync } from '@template/core-typescript'
import { IdempotencyGuard, CommandQueue } from '@template/core-typescript'
import { IdempotencyScope } from '@shared/enums'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { Charge } from '@billing/entities'

import { ChargeRepository, PaymentMethodRepository } from '@billing/repositories'
// Direct subpaths, NOT the '@billing/services' barrel: this module is itself re-exported by that
// barrel, so importing siblings through it forms a module cycle that TDZ-crashes at runtime
// (`Cannot access 'OperatorAlert' before initialization`). reconcileJob is a deliberate leaf.
import { PaymentProviderFactory } from '@billing/services/PaymentProvider'
import { RECONCILE_CHARGE_COMMAND, reconcileJobId } from '@billing/services/ChargeReconciler/reconcileJob'
import { OperatorAlert } from '@billing/services/OperatorAlert'
import { InvoicePaidEvent } from '@billing/events/InvoicePaidEvent'
import { RecoveredVia } from '@billing/enums/RecoveredVia'
import { LoggingService } from '@template/core-typescript'
import { BillingPlatform, ChargeStatus, DeclineReason, PaymentMethodType } from '@template/contracts-typescript/wire/enums'

// Inert schema pair — ChargeSettler is never dispatched via execute()/Mediator (no use-case name,
// no controller). It extends Handler ONLY to reuse withTransaction()/domainEventRepository from
// the base class, mirroring the SubscriptionCharger idiom. settleCharge()/failCharge() are the
// sole entry points.
const ChargeSettlerInputSchema = z.object({})

export interface SettleChargeParams {
	ownerId: string
	engineInvoiceId: string
	amountCents: number
	platform: BillingPlatform
	method: PaymentMethodType
	/** The gateway transaction id of the settling charge — resolves the SPECIFIC charge by identity. */
	gatewayTxId: string
	/**
	 * Settlement provenance forwarded onto InvoicePaidEvent → DunningLifecycle.onSettled, so a
	 * dunning-recovered invoice is labelled correctly. RETRY = off-session automatic re-charge;
	 * MANUAL = owner-driven pay (PIX / checkout / ad-hoc). Omitted → defaults to MANUAL.
	 */
	recoveredVia?: RecoveredVia
	/** Already-resolved charge (the reconciler passes the row it is reconciling); else resolved by gatewayTxId. */
	charge?: Charge
	/**
	 * Card / reconciler-of-card only: when the invoice is ALREADY settled by a DIFFERENT charge, this
	 * charge is a genuine second real capture (the checkout-CIT × manual-pay race) → refund it. Pix and
	 * engine settle paths pass this false — losing the cross-path INVOICE_SETTLED claim just means
	 * another path settled first, not a duplicate capture.
	 */
	refundDuplicate?: boolean
}

export interface FailChargeParams {
	ownerId: string
	engineInvoiceId: string
	/** The invoice amount — the placeholder charge records what we tried (or would have) collected. */
	amountCents: number
	/** Acquirer reason when the path carries one (sync/engine relay); absent → generic dunning copy. */
	declineCode?: DeclineReason
	/** Optimistic-UPGRADE proration → NOT dunning (Decision 8): the flip is reverted, never dunned. */
	isUpgrade: boolean
	/**
	 * The webhook/signal's own gateway transaction id — the disambiguator for the PENDING-in-place
	 * branch below. A PENDING charge and its OWN authoritative charge.failed webhook share the same
	 * gatewayTxId (SubscriptionCharger stamps it on the PENDING Charge when recording a `pending`
	 * gateway result). Absent for callers with no gateway signal at all (e.g. NO_PAYMENT_METHOD,
	 * engine-relayed) — for those, undefined never matches a real PENDING charge's gatewayTxId, so
	 * the in-place branch safely no-ops instead of transitioning someone else's attempt.
	 */
	gatewayTxId?: string
	/**
	 * The caller already holds `INVOICE_CHARGE:${engineInvoiceId}:0` for THIS slot
	 * (ExternalInvoiceIssuedHandler's NO_PAYMENT_METHOD branch claimed it to gate the renewal charge,
	 * then found no card). The slot is ours — record the placeholder directly without re-claiming.
	 * The outer claim already gates single execution.
	 */
	slotAlreadyClaimed?: boolean
	/** Reconciler passes the resolved stale charge directly; else resolved by gatewayTxId / latest. */
	charge?: Charge
}

/**
 * The single charge-identity SETTLE primitive. Both the live card `charge.paid` webhook and the
 * reconciliation sweep call `settleCharge` for a SPECIFIC charge (resolved by gatewayTxId), so
 * settlement is one code path — loop-free by construction (the `Charge` machine's SUCCEEDED state is
 * absorbing) and correct whether triggered by a callback or a poll.
 *
 * Extends Handler (with an inert empty schema) only to reuse `withTransaction` + `domainEventRepository`
 * (the SubscriptionCharger idiom); it is never dispatched as an event handler.
 */
@injectable()
export class ChargeSettler extends Handler<typeof ChargeSettlerInputSchema> {
	readonly name = 'billing.charge-settler' as const
	readonly inputSchema = ChargeSettlerInputSchema
	readonly outputSchema = z.void()

	constructor(
		private idempotencyGuard: IdempotencyGuard,
		private chargeRepository: ChargeRepository,
		private providerFactory: PaymentProviderFactory,
		private paymentMethodRepository: PaymentMethodRepository,
		private commandQueue: CommandQueue,
		private operatorAlert: OperatorAlert,
		private loggingService: LoggingService,
	) {
		super()
	}

	/**
	 * Disarm the charge's pending-reconcile alarm on its terminal transition. Under the TRANSACTIONAL
	 * driver (postgres) the cancel joins the SAME tx as the status flip — alarm and terminal state
	 * can't disagree. Under a broker-backed driver (BullMQ) the cancel is Redis network I/O: it must
	 * NEVER fail (or stall) the money transaction it happens to run inside — Redis down would turn
	 * every settle/fail webhook into a poison-retry loop — so it is fired best-effort and swallowed
	 * on error. Either way the cancel is an OPTIMIZATION, not a correctness guard: a fired alarm
	 * no-ops on the non-PENDING charge (ReconcileCharge's guard). Harmless no-op for a charge that
	 * never had one (webhook-first fresh rows, sync SUCCEEDED/FAILED).
	 */
	private async disarmReconcile(chargeId: string, t: Transaction): Promise<void> {
		if (this.commandQueue.transactional) {
			await this.commandQueue.cancelCommand(RECONCILE_CHARGE_COMMAND, reconcileJobId(chargeId), t)
			return
		}
		const result = await tryCatchAsync(() => this.commandQueue.cancelCommand(RECONCILE_CHARGE_COMMAND, reconcileJobId(chargeId)))
		if (!result.success) {
			this.loggingService.warn({
				content: {
					message: 'ChargeSettler: best-effort reconcile-alarm cancel failed (broker driver)',
					chargeId,
					error: result.error.message,
				},
			})
		}
	}

	async settleCharge(params: SettleChargeParams, tx?: Transaction): Promise<void> {
		// The dup-refund provider call must not hold a DB transaction's locks — collect the "refund
		// needed" flag inside the tx and fire it after withTransaction returns (mirrors
		// ExternalCardChargeSucceededHandler's existing no-lock discipline). The gateway idemKey
		// (`dup-refund:${gatewayTxId}`) makes a redelivery of this same settle call safe either way.
		let refundNeeded: { gatewayTxId: string } | undefined

		await this.withTransaction(tx, async (t: Transaction) => {
			// Resolve the SPECIFIC charge: passed in (reconciler) → by gatewayTxId (card webhook) →
			// the invoice's latest PENDING (invoice-level pix/engine mode) → create (webhook-first).
			let charge =
				params.charge ??
				(await this.chargeRepository.findByGatewayTxId(params.gatewayTxId, params.engineInvoiceId, t)) ??
				(await this.latestPending(params.engineInvoiceId, params.method, t)) ??
				Charge.create({
					ownerId: params.ownerId,
					invoiceId: params.engineInvoiceId,
					platform: params.platform,
					method: params.method,
					amountCents: params.amountCents,
					attemptNo: 0,
				})

			// Idempotent: an already-SUCCEEDED charge means this settlement already ran.
			if (charge.status === ChargeStatus.SUCCEEDED) return

			// A resolved TERMINAL-FAILED charge cannot transition to SUCCEEDED (the Charge machine's
			// terminal states are absorbing — markSucceeded would throw INVALID_CHARGE_TRANSITION and
			// crash the handler into an outbox poison-message loop). This happens when a PENDING charge
			// was already marked FAILED in place by failCharge (a matching charge.failed webhook) and a
			// reordered/duplicate charge.paid for the SAME gatewayTxId now arrives → findByGatewayTxId
			// returns that FAILED charge. Idempotency here keys on the INVOICE, not the ambiguous
			// gatewayTxId: the fresh SUCCEEDED charge below is stamped with that same gatewayTxId, so two
			// rows share it and findByGatewayTxId (limit(1)/no-order) can return either — on every
			// at-least-once redelivery it may return the FAILED row again, bypassing the SUCCEEDED
			// early-return and creating ANOTHER fresh SUCCEEDED per delivery. So key on the INVOICE's
			// settlement and split by WHO settled it: already settled by OUR gatewayTxId → a redelivery of
			// the fresh SUCCEEDED we created → no-op; already settled by a DIFFERENT charge → ch_x is a
			// genuine second real capture → dup-refund it (no new row); not settled → carry the SUCCEEDED
			// fact on a FRESH attemptNo:0 charge (the FAILED row stays FAILED). Applies to BOTH the won- and
			// lost-claim branches below.
			if (charge.status === ChargeStatus.FAILED) {
				// A resolved TERMINAL-FAILED charge can't transition (absorbing). This is contradictory gateway
				// data (the same gatewayTxId reported failed then paid). Key idempotency + dup-refund on the
				// INVOICE's settlement, not the ambiguous gatewayTxId (findByGatewayTxId is limit(1)/no-order and
				// can return either of the two rows sharing this id):
				const settled = await this.chargeRepository.findSucceededByInvoiceId(params.engineInvoiceId, t)
				if (settled) {
					// Already settled. By OUR gatewayTxId → a redelivery of the fresh SUCCEEDED charge we already
					// created; idempotent no-op. By a DIFFERENT charge → ch_x is a genuine second real capture →
					// refund it (dup-refund, gateway-idempotent via the idemKey; a redundant re-fire is a gateway
					// no-op). Never create another SUCCEEDED row — the invoice is already settled.
					if (params.refundDuplicate && settled.gatewayTxId !== params.gatewayTxId) {
						refundNeeded = { gatewayTxId: params.gatewayTxId }
					}
					return
				}
				// Not settled → carry the SUCCEEDED fact on a fresh attemptNo:0 charge (the FAILED row stays FAILED).
				charge = Charge.create({
					ownerId: params.ownerId,
					invoiceId: params.engineInvoiceId,
					platform: params.platform,
					method: params.method,
					amountCents: params.amountCents,
					attemptNo: 0,
				})
			}

			// Invoice effects, guarded once per invoice (cross-path dedup with pix/engine).
			const won = await this.idempotencyGuard.claim(IdempotencyScope.INVOICE_SETTLED, params.engineInvoiceId, t)

			if (won) {
				// This charge is the settling one: mark it SUCCEEDED (loop-free terminal) and emit
				// InvoicePaidEvent (InvoicePaidHandler activates downstream — same for every settle path).
				charge.markSucceeded(params.gatewayTxId)
				await this.chargeRepository.save(charge, t)
				await this.disarmReconcile(charge.id.value, t)
				await this.domainEventRepository.save(
					new InvoicePaidEvent({
						entityId: params.engineInvoiceId,
						ownerId: params.ownerId,
						payload: {
							ownerId: params.ownerId,
							invoiceId: params.engineInvoiceId,
							amountCents: params.amountCents,
							currency: CurrencyCode.BRL,
							...(params.recoveredVia ? { recoveredVia: params.recoveredVia } : {}),
						},
					}),
					t,
				)
				return
			}

			// The invoice was already settled by a DIFFERENT charge. Capture that prior settled charge
			// BEFORE marking THIS one SUCCEEDED: findSucceededByInvoiceId returns the EARLIEST-created
			// SUCCEEDED row, so once THIS charge is SUCCEEDED it would return THIS charge itself whenever
			// it is the earliest-created row on the invoice (its own gatewayTxId === params.gatewayTxId),
			// masking the duplicate and skipping the refund → the customer is charged twice, never
			// refunded. Since the claim was lost, the invoice is already settled by a different charge, so
			// this pre-mark read returns that OTHER charge (this one is still PENDING). Compare ITS
			// gatewayTxId to ours; if different → this is a second real capture to refund.
			const priorSettled = await this.chargeRepository.findSucceededByInvoiceId(params.engineInvoiceId, t)

			// Still transition THIS charge to SUCCEEDED terminal (loop-free — it leaves listStalePending)
			// and, for a card capture, refund the duplicate money exactly once (idemKey = this charge's
			// own gatewayTxId), fired AFTER the tx (no DB lock held during the provider call).
			charge.markSucceeded(params.gatewayTxId)
			const saved = await tryCatchAsync(() => this.chargeRepository.save(charge, t))
			if (!saved.success) {
				// Benign redelivery race (found by the concurrent-settlement scale test): two deliveries
				// of the SAME charge.paid resolve the same PENDING charge; the winner claims + marks it
				// SUCCEEDED and commits; the loser lands here holding a pre-race version, so the
				// optimistic save conflicts. The racer already did OUR exact work on OUR exact charge —
				// re-read and no-op instead of throwing (which cost a pointless outbox poison-retry
				// round per race). Any other conflict cause rethrows: the redelivery converges it.
				// (The optimistic-lock throw is OURS on 0 rows — the tx is NOT aborted; reads still run.)
				const current = await this.chargeRepository.findById(charge.id.value, t)
				if (current?.status === ChargeStatus.SUCCEEDED) return
				throw saved.error
			}
			await this.disarmReconcile(charge.id.value, t)

			if (params.refundDuplicate && priorSettled?.gatewayTxId && priorSettled.gatewayTxId !== params.gatewayTxId) {
				refundNeeded = { gatewayTxId: params.gatewayTxId }
			}
		})

		if (refundNeeded) {
			try {
				await this.providerFactory
					.for(params.platform)
					.cancelCharge({ gatewayTxId: refundNeeded.gatewayTxId, idemKey: `dup-refund:${refundNeeded.gatewayTxId}` })
			} catch (err) {
				// Contradictory gateway data (a charge.paid for a gatewayTxId whose own row is terminal
				// FAILED / never captured): the gateway may reject cancelling an unknown/failed charge. Log
				// and swallow — never poison-loop the handler on webhook redelivery. A genuine duplicate
				// capture's refund succeeds here; a spurious one is a tolerated no-op.
				this.loggingService.warn({
					content: {
						message: 'ChargeSettler: dup-refund failed (possibly a non-existent/failed capture on contradictory gateway data)',
						gatewayTxId: refundNeeded.gatewayTxId,
						error: err instanceof Error ? err.message : String(err),
					},
				})

				// A double-captured customer whose refund ALSO failed must be visible to an operator, not
				// just a warn-level log — a genuine dup capture (not the spurious/contradictory-data case
				// above) leaves the customer charged twice with no automatic recovery. Claim-guarded (its
				// own small tx, own scope — see IdempotencyScope.CHARGE_SETTLER_ALERT) because this runs
				// post-commit on every at-least-once redelivery of the same settle call: without the claim,
				// a gateway that keeps rejecting the cancel would re-alert on every redelivery.
				const failedGatewayTxId = refundNeeded.gatewayTxId
				const alertKey = `dup-refund-failed:${failedGatewayTxId}`
				await this.withTransaction(undefined, async (alertTx: Transaction) => {
					if (await this.idempotencyGuard.claim(IdempotencyScope.CHARGE_SETTLER_ALERT, alertKey, alertTx)) {
						this.operatorAlert.emit({
							kind: 'dup-refund-failed',
							key: alertKey,
							context: {
								invoiceId: params.engineInvoiceId,
								ownerId: params.ownerId,
								gatewayTxId: failedGatewayTxId,
								amountCents: params.amountCents,
								platform: params.platform,
							},
							runbook: 'estornar manualmente a captura duplicada no dashboard do gateway; o cliente foi capturado duas vezes',
						})
					}
				})
			}
		}
	}

	/**
	 * The invoice's latest charge iff it is PENDING AND of the SAME method as the settling signal — the
	 * invoice-level settle reusing that method's own in-flight attempt (awaiting its webhook). Method-
	 * scoped so a Pix settle can't HIJACK an in-flight CARD PENDING attempt (mark it SUCCEEDED under the
	 * Pix tx-id, corrupting the card attempt's identity so its own webhook can no longer resolve it);
	 * with a mismatch the ladder falls through to creating a fresh charge for the actual settling method.
	 */
	private async latestPending(engineInvoiceId: string, method: PaymentMethodType, t: Transaction): Promise<Charge | undefined> {
		const latest = await this.chargeRepository.findLatestByInvoiceId(engineInvoiceId, t)
		return latest && latest.status === ChargeStatus.PENDING && latest.method === method ? latest : undefined
	}

	/**
	 * The single writer of the placeholder FAILED `billing_charges` fact that makes a NON-synchronous
	 * decline ENTER dunning. Three ingress paths need it — the webhook `charge.failed` relay
	 * (ExternalChargeFailedHandler), the no-payment-method renewal (ExternalInvoiceIssuedHandler), and
	 * the engine-relayed payment failure (ExternalInvoicePaymentFailedHandler) — because on all three
	 * SubscriptionCharger (the sole FAILED-Charge writer for the sync path) never runs. Without a FAILED
	 * ledger row, DunningLifecycle.onChargeFailed sees 0 FAILED (no DunningStarted email) and
	 * listDunningCandidates never picks the invoice up (no retry/cancel).
	 *
	 * PENDING attempt in place: when the invoice's LATEST charge is PENDING (the sync/processing attempt
	 * SubscriptionCharger recorded for a `pending` gateway result, awaiting its webhook), a `charge.failed`
	 * whose gatewayTxId MATCHES that PENDING charge's own gatewayTxId is that attempt's authoritative
	 * decline — mark it PENDING→FAILED in place (a valid transition) instead of skipping via the `:0`
	 * claim. This closes the processing-then-decline gap cleanly and, because the recording side now
	 * writes PENDING (not a premature SUCCEEDED) for an unsettled charge, resolves the previously-
	 * documented premature-SUCCEEDED-then-decline limitation for the PENDING case.
	 *
	 * gatewayTxId is the disambiguator: webhooks are at-least-once and reorderable, so a stray/duplicate/
	 * out-of-order `charge.failed` can arrive for a DIFFERENT charge than the one currently PENDING on
	 * this invoice (e.g. an old attempt's late-arriving decline after a newer attempt is already
	 * in-flight). Without the match check, ANY `charge.failed` for the invoice would flip a PENDING
	 * attempt that is unrelated to it — duning a customer whose renewal actually settles. When the
	 * gatewayTxId does NOT match (or is absent), the PENDING charge is left untouched and nothing is
	 * recorded — no transition, no placeholder. Its own settlement webhook, or the reconciliation sweep,
	 * resolves it.
	 *
	 * Dedup is RACE-SAFE via the `INVOICE_CHARGE:${engineInvoiceId}:0` claim — the SAME scope/key the
	 * synchronous first charge (ExternalInvoiceIssuedHandler) reserves before charging — so a real
	 * synchronous decline plus a concurrent `charge.failed` webhook can never each record a second
	 * attemptNo-0 FAILED (which would inflate `attemptNo=COUNT(FAILED)` and shift the retry offset).
	 * (The in-place PENDING→FAILED path above is itself serialized per invoice by the caller's outer
	 * INVOICE_FAILED claim, which both webhook and engine-relayed callers hold before invoking this.)
	 * If the `:0` claim fails, the slot is already held (by a sync decline that recorded a FAILED, a
	 * concurrent webhook, or a genuinely-SETTLED SUCCEEDED) — we return WITHOUT recording. There is no
	 * recovery onto a second slot, on purpose: nothing here can tell a genuinely-settled SUCCEEDED apart
	 * from any other, so a recovery slot would let a stray/duplicate/out-of-order `charge.failed` for a
	 * truly-PAID invoice record a FAILED, flip the paying subscription to PAST_DUE, and re-charge/cancel
	 * a customer who already paid. Never dun a customer who has paid — a false positive is far worse than
	 * a missed retry.
	 *
	 * Never-dun-a-payer is also an UNCONDITIONAL guard, on top of the claim-based dedup: `findSucceededByInvoiceId`
	 * is checked directly — both right after the PENDING-in-place branch (covering an absent/non-PENDING
	 * latest) AND as the return gate inside the PENDING-in-place branch itself (covering a non-latest
	 * SUCCEEDED elsewhere on the invoice, e.g. a card PENDING sitting alongside a Pix SUCCEEDED on the
	 * same invoice). Robust to a SUCCEEDED that isn't `latest` and to a settlement landing via an
	 * out-of-order webhook (e.g. the settling `charge.paid`/`payment.paid` arrives before the synchronous
	 * attempt claims its own `:0` slot) — either way the `:0` claim can be unclaimed while the invoice is
	 * nonetheless genuinely paid, and a stray `charge.failed` landing in that window must not dun a paid
	 * customer. This is also what keeps the specific-charge path LOOP-FREE for the reconciler (T6): the
	 * matched PENDING charge always transitions to FAILED (a terminal state — it leaves
	 * `listStalePending`) even when the invoice is paid; only the DUNNING side-effect (the boolean return)
	 * is suppressed. Money-safety false-negative (missing a dun) is always preferred over the
	 * false-positive (dunning someone who paid).
	 *
	 * A non-positive `amountCents` is never recorded: an unknown/zero invoice amount (e.g. an
	 * out-of-order engine event arriving before our invoice.issued) would otherwise persist a 0-cent
	 * placeholder FAILED that DunningRetryJob re-charges as an invalid 0-cent gateway charge. The entry
	 * is simply deferred — when the real invoice.issued arrives and a genuine charge attempt fails, the
	 * invoice enters dunning normally.
	 *
	 * Return value: `true` when this call actually created a placeholder FAILED charge OR transitioned a
	 * PENDING charge to FAILED (matching gatewayTxId) AND the invoice is not otherwise already paid — i.e.
	 * there is now a real, DUNNING-worthy FAILED fact on the ledger. `false` on every skip path
	 * (stray-gatewayTxId-mismatch PENDING, any-SUCCEEDED-on-invoice, isUpgrade, amountCents<=0, lost
	 * idempotency claim, or the defensive slotAlreadyClaimed-already-recorded case) — INCLUDING the
	 * PENDING-in-place transition itself when the invoice already has a SUCCEEDED charge (the charge still
	 * transitions to FAILED for loop-freedom; only the dun signal is suppressed). Callers use this to
	 * decide whether emitting `InvoicePaymentFailedEvent` is warranted — a webhook that recorded nothing
	 * (or recorded a terminal transition on an already-paid invoice) must NOT flip the subscription
	 * PAST_DUE (see ExternalChargeFailedHandler).
	 */
	async failCharge(params: FailChargeParams, tx?: Transaction): Promise<boolean> {
		return this.withTransaction(tx, async (t: Transaction) => {
			if (params.isUpgrade) return false
			// No positive amount to collect → never persist a placeholder the retry job would re-charge as
			// an invalid 0-cent gateway charge. Guarded here so every caller is protected.
			if (params.amountCents <= 0) return false

			// A PENDING latest charge is the sync/processing attempt awaiting its webhook (SubscriptionCharger
			// records a `pending` gateway result as PENDING, never a premature SUCCEEDED). This failure signal
			// is that attempt's authoritative decline → transition it PENDING→FAILED in place so the invoice
			// enters dunning, instead of returning empty-handed because the attempt already holds its :N slot.
			// An absent latest charge falls through to the claim-gated placeholder path below.
			const latest = params.charge ?? (await this.chargeRepository.findLatestByInvoiceId(params.engineInvoiceId, t))
			if (latest && latest.status === ChargeStatus.PENDING) {
				// Only transition when the webhook is genuinely about THIS attempt. A stray/duplicate/
				// out-of-order charge.failed with no matching gatewayTxId (or none at all) must NOT touch
				// someone else's in-flight PENDING charge — return without recording (no placeholder either).
				if (params.gatewayTxId !== undefined && latest.gatewayTxId === params.gatewayTxId) {
					latest.markFailed(params.declineCode)
					await this.chargeRepository.save(latest, t)
					await this.disarmReconcile(latest.id.value, t)
					// The specific charge is now terminal (loop-free — the reconciler won't re-list it). Only
					// DUN if the invoice isn't already settled by another path (cross-path: a card PENDING
					// whose invoice was paid via Pix/engine must transition FAILED but NOT dun a paid customer).
					if (await this.chargeRepository.findSucceededByInvoiceId(params.engineInvoiceId, t)) return false
					return true
				}
				return false
			}

			// Never dun a payer: if the invoice already has ANY SUCCEEDED charge it is paid — never record a
			// dunning-relevant FAILED, regardless of whether the `:0` claim below is currently held (a
			// webhook-first / cross-path settlement can leave it unclaimed). Robust to a non-latest SUCCEEDED.
			if (await this.chargeRepository.findSucceededByInvoiceId(params.engineInvoiceId, t)) return false

			const record = async (): Promise<void> => {
				// The card that (would have) declined is normally the owner's wallet default; fall back to the
				// configured gateway + CARD as the intended-method placeholder if none is on file.
				const defaultMethod = await this.paymentMethodRepository.findDefaultByOwnerId(params.ownerId, t)
				const charge = Charge.create({
					ownerId: params.ownerId,
					invoiceId: params.engineInvoiceId,
					platform: defaultMethod?.platform ?? this.providerFactory.defaultPlatform(),
					method: defaultMethod?.instrument.type ?? PaymentMethodType.CARD,
					amountCents: params.amountCents,
					attemptNo: 0,
				})
				charge.markFailed(params.declineCode)
				await this.chargeRepository.save(charge, t)
			}

			// NO_PAYMENT_METHOD renewal: the caller already reserved slot 0 (and gates single execution) —
			// record directly. The 0-FAILED guard is defensive; the outer claim already precludes a prior one.
			if (params.slotAlreadyClaimed) {
				const existing = await this.chargeRepository.listByInvoiceId(params.engineInvoiceId, t)
				if (existing.some(c => c.status === ChargeStatus.FAILED)) return false
				await record()
				return true
			}

			// Webhook / engine-relayed: reserve slot 0. Winning means no attempt-0 charge exists yet.
			// If the claim fails the slot is held — return WITHOUT recording (no recovery slot; see the
			// doc comment above: nothing here can distinguish a premature SUCCEEDED from a genuinely-settled one).
			if (await this.idempotencyGuard.claim(IdempotencyScope.INVOICE_CHARGE, `${params.engineInvoiceId}:0`, t)) {
				await record()
				return true
			}
			// The slot is already held by someone else — this call recorded nothing. Two different holders
			// need two different answers: a SYNCHRONOUS decline that already recorded a FAILED (the
			// race-safe-dedup case — this webhook is the confirming, redundant signal for a REAL failure)
			// must still tell the caller a genuine failure exists so dunning proceeds; a genuinely-SETTLED
			// SUCCEEDED holding the slot (or any other non-FAILED holder) must not — see the doc comment
			// above: never dun a customer who has paid. Distinguish by re-checking what's actually on the
			// ledger.
			const existing = await this.chargeRepository.listByInvoiceId(params.engineInvoiceId, t)
			return existing.some(c => c.status === ChargeStatus.FAILED)
		})
	}

	protected async handle(): Promise<void> {
		// Unreachable — ChargeSettler is a directly-injected service (settleCharge()/failCharge()),
		// never dispatched via execute()/Mediator. See the class doc comment.
		throw new Error('ChargeSettler.handle() is unreachable — call settleCharge() directly')
	}
}
