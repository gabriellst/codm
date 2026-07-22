import { injectable } from 'tsyringe-neo'
import { Handler } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { tryCatchAsync } from '@template/core-typescript'
import { CommandQueue } from '@template/core-typescript'
import { ProductConfig } from '@shared/config'
import { CheckoutSession } from '@billing/entities'

import { CheckoutSessionRepository } from '@billing/repositories'
// Direct subpath to the reconcileJob leaf, NOT the '@billing/services' barrel — avoids the module
// cycle that TDZ-crashes at runtime.
import { RECONCILE_CHECKOUT_COMMAND, checkoutReconcileJobId } from '@billing/services/CheckoutSessionReconciler/reconcileJob'
import { LoggingService } from '@template/core-typescript'
import { BillingPlatform, CheckoutIntent } from '@template/contracts-typescript/wire/enums'

// Inert schema pair — CheckoutSessionRecorder is never dispatched via execute()/Mediator (no
// use-case name, no controller). It extends Handler ONLY to reuse withTransaction() from the base
// class, mirroring the SubscriptionCharger/ChargeSettler idiom. record() below is the sole entry
// point.
const CheckoutSessionRecorderInputSchema = z.object({})

export interface RecordCheckoutSessionParams {
	/** The gateway's own session/order id (Stripe `cs_…`, PagBank `ORDE_…`) — the natural key. */
	sessionRef: string
	ownerId: string
	platform: BillingPlatform
	intent: CheckoutIntent
	/** Absent for a `setup`-intent session (vaulting a card, no charge). */
	engineInvoiceId?: string
	/** Absent when the gateway response carries no expiry. */
	expiresAt?: Date
}

/**
 * The ONE seam every `provider.createCheckoutSession` call site funnels through post-gateway
 * (Decision 2 of the design spec, molde da expectativa de refund — `RequestRefund`'s Phase 3):
 * records the minted session as a local `CheckoutSession` (own tx, AFTER the gateway call — the
 * mint itself stays outside any DB transaction, same rule as the charge path) and arms the
 * per-session reconcile alarm (molde EXATO de `SubscriptionCharger`'s per-charge alarm) so a lost
 * `checkout.session.completed` webhook still resolves in minutes instead of never.
 *
 * Finding [9]: by the time `record()` runs, the gateway checkout session ALREADY exists — the
 * customer has a live, payable URL regardless of what happens next. So the entire body is
 * best-effort: a failure here (DB down, insert throwing, …) is logged and swallowed rather than
 * propagated, so the mint use case still returns the URL to the customer instead of 500ing on a
 * checkout that is, from the gateway's point of view, perfectly usable. The cost of a lost record()
 * is a lost accelerator for THIS session (no local row, no alarm) — the real webhook path
 * (`checkout.session.completed` → `ExternalCheckoutCompletedHandler`) is entirely unaffected, since
 * it never reads the `CheckoutSession` row.
 */
@injectable()
export class CheckoutSessionRecorder extends Handler<typeof CheckoutSessionRecorderInputSchema> {
	readonly name = 'checkout_session_recorder' as const
	readonly inputSchema = CheckoutSessionRecorderInputSchema
	readonly outputSchema = z.void()

	constructor(
		private checkoutSessionRepository: CheckoutSessionRepository,
		private commandQueue: CommandQueue,
		private loggingService: LoggingService,
	) {
		super()
	}

	async record(p: RecordCheckoutSessionParams): Promise<void> {
		// Finding [9]: the gateway session already exists by the time we get here — a failure
		// recording it locally must NEVER abort the caller (the mint use case has already returned,
		// or is about to return, a live checkout URL to the customer). Best-effort: log + swallow.
		const result = await tryCatchAsync(() =>
			this.withTransaction(undefined, async (tx: Transaction) => {
				const session = CheckoutSession.create({
					sessionRef: p.sessionRef,
					ownerId: p.ownerId,
					platform: p.platform,
					intent: p.intent,
					engineInvoiceId: p.engineInvoiceId,
					expiresAt: p.expiresAt,
				})

				await this.checkoutSessionRepository.insert(session, tx)

				// Arm the per-session reconcile alarm: if the completion webhook is dropped, the
				// ReconcileCheckoutSession use case (T4) fires after the delay and polls the gateway for
				// the real status. Under the TRANSACTIONAL driver (postgres) the enqueue joins THIS tx —
				// alarm and PENDING row commit (or roll back) together, no orphan alarm, no unwatched
				// PENDING session. Under a broker driver (BullMQ) the enqueue is Redis network I/O and
				// must NEVER fail the session-recording tx — best-effort + swallowed: a lost alarm is
				// exactly what the ReconcileCheckoutSessionsJob backstop sweep (T4) exists for. The
				// completion handler (T5) CANCELS this jobId on the session's terminal transition, so in
				// the happy path it never fires — and if the cancel loses the race, the use case no-ops on
				// a non-PENDING session.
				const armOpts = {
					delay: ProductConfig.env.BILLING_CHECKOUT_RECONCILE_AFTER_MINUTES * 60_000,
					jobId: checkoutReconcileJobId(p.sessionRef),
				}
				if (this.commandQueue.transactional) {
					await this.commandQueue.enqueueCommand(RECONCILE_CHECKOUT_COMMAND, { sessionRef: p.sessionRef }, armOpts, tx)
				} else {
					const armed = await tryCatchAsync(() =>
						this.commandQueue.enqueueCommand(RECONCILE_CHECKOUT_COMMAND, { sessionRef: p.sessionRef }, armOpts),
					)
					if (!armed.success) {
						this.loggingService.warn({
							content: {
								message: 'CheckoutSessionRecorder: best-effort reconcile-alarm enqueue failed (broker driver; sweep backstop covers)',
								sessionRef: p.sessionRef,
								error: armed.error.message,
							},
						})
					}
				}
			}),
		)

		if (!result.success) {
			// [checkout-session-recorder-lost] a stable marker for alerting/grepping: this session has
			// NO local CheckoutSession row and NO reconcile alarm — the accelerator does not cover it.
			// The webhook path is unaffected (ExternalCheckoutCompletedHandler never reads this row).
			this.loggingService.error({
				content: {
					message:
						'[checkout-session-recorder-lost] CheckoutSessionRecorder: record() failed — session lost, no accelerator coverage for it; the webhook path is unaffected',
					sessionRef: p.sessionRef,
					ownerId: p.ownerId,
					platform: p.platform,
					error: String(result.error),
				},
			})
		}
	}

	protected async handle(): Promise<void> {
		// Unreachable — CheckoutSessionRecorder is a directly-injected service (record()), never
		// dispatched via execute()/Mediator. See the class doc comment.
		throw new Error('CheckoutSessionRecorder.handle() is unreachable — call record() directly')
	}
}
