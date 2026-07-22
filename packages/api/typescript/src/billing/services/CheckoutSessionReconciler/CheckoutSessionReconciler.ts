import { injectable } from 'tsyringe-neo'
import { Handler } from '@template/core-typescript'
import { BaseError } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { ProductConfig } from '@shared/config'
import { tryCatchAsync } from '@template/core-typescript'
import { IdempotencyGuard } from '@template/core-typescript'
import { IdempotencyScope } from '@shared/enums'
import type { CheckoutSession } from '@billing/entities'

import { CheckoutSessionRepository } from '@billing/repositories'
// Direct subpaths, NOT the '@billing/services' barrel — avoids the module cycle that TDZ-crashes
// at runtime (this module is re-exported by that barrel).
import { PaymentProviderFactory } from '@billing/services/PaymentProvider'
import { OperatorAlert } from '@billing/services/OperatorAlert'
import { ExternalCheckoutCompletedEvent } from '@billing/events/ExternalCheckoutCompletedEvent'
import { BillingPlatform, CheckoutIntent, CheckoutSessionStatus } from '@template/contracts-typescript/wire/enums'

// Inert schema pair — CheckoutSessionReconciler is never dispatched via execute()/Mediator. It
// extends Handler ONLY to reuse withTransaction()/domainEventRepository (molde ChargeReconciler).
// reconcile() below is the sole entry point.
const CheckoutSessionReconcilerInputSchema = z.object({})

/**
 * Resolves ONE stale PENDING `CheckoutSession` against the gateway's real status — the recovery
 * for a dropped `checkout.session.completed`(-equivalent) webhook. Molde `ChargeReconciler`: run
 * by BOTH delivery mechanisms with the IDENTICAL hardened logic —
 *  - the per-session delayed command (`RECONCILE_CHECKOUT_COMMAND`, armed by `CheckoutSessionRecorder`
 *    when the session is recorded PENDING), and
 *  - the low-frequency sweep (`ReconcileCheckoutSessionsJob` — backstop for a lost/never-scheduled
 *    alarm; also the only place the max-age still-pending operator alert fires).
 *
 * Identity, not fabrication (Decision 4 of the design spec): `paid` synthesizes
 * `ExternalCheckoutCompletedEvent` keyed by the SAME `sessionRef` the real webhook uses — that
 * `sessionRef` is already the `CHECKOUT_VAULT` idempotency claim's key on
 * `ExternalCheckoutCompletedHandler`, so a real webhook arriving before OR after the synthetic
 * event collides on the same claim and produces exactly one effect (both orderings are no-ops).
 * This is the anti-refund case: RefundReconcileJob never synthesizes because a cumulative refund
 * poll carries no per-refund identity — here the identity IS the session itself.
 *
 * Idempotent by construction: a session already terminal (completed by the webhook that raced us,
 * or by an earlier reconcile() call racing the sweep against the alarm) makes reconcile() a no-op —
 * safe under at-least-once delivery from either mechanism.
 */
@injectable()
export class CheckoutSessionReconciler extends Handler<typeof CheckoutSessionReconcilerInputSchema> {
	readonly name = 'billing.checkout-session-reconciler' as const
	readonly inputSchema = CheckoutSessionReconcilerInputSchema
	readonly outputSchema = z.void()

	constructor(
		private checkoutSessionRepository: CheckoutSessionRepository,
		private providerFactory: PaymentProviderFactory,
		private idempotencyGuard: IdempotencyGuard,
		private operatorAlert: OperatorAlert,
	) {
		super()
	}

	async reconcile(session: CheckoutSession, now: Date): Promise<void> {
		// Defense-in-depth against BOTH claim orderings racing straight into reconcile() itself (the
		// alarm firing right after the sweep already resolved this session, or vice versa; or a real
		// webhook completing it out-of-band via ExternalCheckoutCompletedHandler moments earlier) —
		// listStalePending/the use case's own PENDING guard already filter this in the normal path,
		// but a rehydrated session object can still be stale by the time reconcile() runs.
		if (session.status !== CheckoutSessionStatus.PENDING) return

		// Poll FORA de qualquer tx (rail cc-bp-22) — the gateway round-trip must never hold a DB
		// transaction open.
		const polled = await tryCatchAsync(() => this.providerFactory.for(session.platform).getCheckoutSessionStatus(session.sessionRef))

		if (!polled.success) {
			if (polled.error instanceof BaseError && polled.error.name === 'PROVIDER_CAPABILITY_UNSUPPORTED') {
				await this.handleUnresolvable(session, now, 'the platform has no getCheckoutSessionStatus override (webhook-only)')
				return
			}
			// A real transport/schema failure invalidates THIS session's read this tick — bubble to the
			// caller (the sweep's per-item tryCatch, molde ChargeReconciler/ReconcilePendingChargesJob,
			// covers it — AC-7).
			throw polled.error
		}

		const status = polled.data

		if (status.state === 'expired') {
			session.expire()
			await this.checkoutSessionRepository.save(session)
			return
		}

		if (status.state === 'open') return // still open — re-poll next tick, no-op

		// status.state === 'paid'
		if (session.platform === BillingPlatform.PAGBANK) {
			// PagBank's hosted checkout mints EVERY session with `payment_methods: [CREDIT_CARD, PIX]`
			// (see PagBankPaymentProvider.createCheckoutSession) — the SAME order can be paid by either
			// method. The real webhook path discriminates correctly (PagBankWebhookMapper branches on
			// `charge.payment_method.type`: CREDIT_CARD → ExternalCheckoutCompletedEvent, PIX →
			// ExternalPixPaidEvent), but `getCheckoutSessionStatus`'s frozen port contract
			// (`CheckoutSessionStatusResult.paid`) carries only `gatewayTxId`/`instrument`/`amountCents`
			// — no payment-method-type signal survives the port abstraction (Stripe's `paid.instrument`
			// shape has no PagBank equivalent to generalize from). So a `paid` result here is IRREDUCIBLY
			// AMBIGUOUS from this poll alone: synthesizing ExternalCheckoutCompletedEvent could mask a
			// charge that was actually PIX-paid (wrong event, wrong downstream fact). Per the money-code
			// posture (prefer the false negative), we do NOT guess — treat it as paid-but-unresolvable
			// (Finding [2]/[3]): alert immediately (never wait for max-age, never local-expire) instead
			// of auto-completing.
			await this.handleUnresolvable(
				session,
				now,
				'PagBank paid result is ambiguous (could be CREDIT_CARD or PIX — the port carries no payment-method signal)',
				{ paidButUnresolvable: true },
			)
			return
		}

		// Finding [3]: a `paid` result is only trustworthy enough to synthesize when its payload is
		// COMPLETE for the session's own intent — `payment` needs gatewayTxId + amountCents (what the
		// synthesized event reports as the charge identity/amount), `setup` needs the vaulted
		// instrument (what settle would vault). Stripe can return a bare `{state:'paid'}` with no
		// `paid` object at all when the session's PI/SI id can't be resolved (see
		// StripePaymentProvider.getCheckoutSessionStatus), or a setup session whose payment_method
		// never expanded — either way the payload is DEGRADED. Synthesizing on a degraded payload
		// still burns the CHECKOUT_VAULT claim and marks the session COMPLETED while vault/settle
		// no-op on missing data — a later real webhook then finds the claim already taken and is
		// silently dropped (a dead webhook, an invisible loss). Treat a degraded paid exactly like
		// the PagBank ambiguity: never guess, alert immediately, stay PENDING.
		const paidIsComplete =
			session.intent === CheckoutIntent.PAYMENT
				? status.paid?.gatewayTxId !== undefined && status.paid?.amountCents !== undefined
				: status.paid?.instrument !== undefined

		if (!paidIsComplete) {
			await this.handleUnresolvable(
				session,
				now,
				`paid payload is degraded for a ${session.intent} session (missing the data required to synthesize safely)`,
				{ paidButUnresolvable: true },
			)
			return
		}

		// Unambiguous & complete (Stripe: the polled Checkout Session IS the same object the webhook fires from —
		// see StripePaymentProvider.getCheckoutSessionStatus). Synthesize the SAME fact the real webhook
		// would have produced and mark the session COMPLETED in the SAME transaction as the event save —
		// vault/settle themselves stay inside ExternalCheckoutCompletedHandler's existing idempotent flow.
		await this.withTransaction(undefined, async (tx: Transaction) => {
			await this.domainEventRepository.save(
				new ExternalCheckoutCompletedEvent({
					entityId: session.sessionRef,
					ownerId: session.ownerId.value,
					payload: {
						externalId: `reconcile:${session.platform.toLowerCase()}:${session.sessionRef}:checkout_completed`,
						ownerId: session.ownerId.value,
						sessionRef: session.sessionRef,
						intent: session.intent,
						platform: session.platform,
						instrument: status.paid?.instrument,
						engineInvoiceId: session.engineInvoiceId?.value,
						amountCents: status.paid?.amountCents,
						gatewayTxId: status.paid?.gatewayTxId,
					},
				}),
				tx,
			)
			session.complete()
			await this.checkoutSessionRepository.save(session, tx)
		})
	}

	/**
	 * The irreconcilable-by-poll branch (Decision 6): a platform with no `getCheckoutSessionStatus`
	 * capability (`paidButUnresolvable` absent/false), OR a `paid` result this reconciler refuses to
	 * guess about — PagBank PIX ambiguity or a degraded payload (`paidButUnresolvable: true`,
	 * Findings [2]/[3]).
	 *
	 * The two branches diverge on purpose:
	 *  - Capability-unresolvable: never auto-expires without gateway evidence — UNLESS the session's
	 *    own `expiresAt` (stamped at mint time) has already passed, in which case the gateway could
	 *    not possibly still complete it (a dead session), so it expires locally without waiting for
	 *    max-age. Otherwise, past `BILLING_CHECKOUT_RECONCILE_MAX_AGE_HOURS` it alerts once.
	 *  - Paid-but-unresolvable: the gateway just told us `paid` — local-expiring past `expiresAt`
	 *    would be a lie (money already moved), so that short-circuit is skipped entirely. Waiting for
	 *    max-age is ALSO skipped: a gateway-side session TTL shorter than
	 *    `BILLING_CHECKOUT_RECONCILE_MAX_AGE_HOURS` (e.g. PagBank's ~30min hosted-checkout expiry vs a
	 *    24h default max-age) would make this alert unreachable — a known-paid-but-unresolvable
	 *    session IS the operator signal, so it fires immediately instead.
	 *
	 * Both branches alert the operator exactly once (claim-guarded on `checkout:{sessionRef}` — ONE
	 * key regardless of which unresolvable reason triggered it) and leave the session PENDING — it
	 * only leaves the sweep via the real webhook completing it or an operator acting on the alert.
	 */
	private async handleUnresolvable(
		session: CheckoutSession,
		now: Date,
		reason: string,
		opts?: { paidButUnresolvable?: boolean },
	): Promise<void> {
		if (!opts?.paidButUnresolvable) {
			if (session.expiresAt && now.getTime() > session.expiresAt.getTime()) {
				session.expire()
				await this.checkoutSessionRepository.save(session)
				return
			}

			const maxAgeMs = ProductConfig.env.BILLING_CHECKOUT_RECONCILE_MAX_AGE_HOURS * 60 * 60_000
			if (now.getTime() - session.mintedAt.getTime() < maxAgeMs) return
		}

		await this.withTransaction(undefined, async (tx: Transaction) => {
			const key = `checkout:${session.sessionRef}`
			if (await this.idempotencyGuard.claim(IdempotencyScope.RECONCILE_STALE_ALERT, key, tx)) {
				const staleness = opts?.paidButUnresolvable
					? 'reported paid but cannot be safely resolved'
					: `still PENDING past ${ProductConfig.env.BILLING_CHECKOUT_RECONCILE_MAX_AGE_HOURS}h`
				this.operatorAlert.emit({
					kind: 'checkout-stale',
					key,
					runbook: opts?.paidButUnresolvable
						? 'the gateway reported this session as paid but it could not be safely resolved automatically — verify the payment on the gateway dashboard and complete or refund it manually.'
						: 'check the gateway dashboard for this checkout session — if it is genuinely abandoned no action is needed, otherwise investigate why the completion webhook was not delivered.',
					context: {
						sessionRef: session.sessionRef,
						ownerId: session.ownerId.value,
						platform: session.platform,
						staleness,
						reason,
					},
				})
			}
		})
	}

	protected async handle(): Promise<void> {
		// Unreachable — CheckoutSessionReconciler is a directly-injected service (reconcile()), never
		// dispatched via execute()/Mediator. See the class doc comment.
		throw new Error('CheckoutSessionReconciler.handle() is unreachable — call reconcile() directly')
	}
}
