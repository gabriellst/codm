import crypto from 'node:crypto'
import { injectable } from 'tsyringe-neo'
import { LoggingService, tryCatchAsync, Config } from '@template/core-typescript'
import { ProductConfig } from '@shared/config'

import { PagarMeWebhookSchema, type PagarMeWebhook } from '@billing/services/BillingWebhookMapper/PagarMeWebhookMapper/PagarMeWebhookSchema'
import { BillingPlatform, DeclineReason, PaymentMethodType } from '@template/contracts-typescript/wire/enums'
import {
	PaymentProvider,
	type ChargeResult,
	type CheckoutSessionResult,
	type EnsureCustomerParams,
	type CreateCheckoutSessionParams,
	type ChargeOffSessionParams,
	type ChargeStoredOnSessionParams,
	type CancelChargeParams,
	type CreatePixParams,
} from '../PaymentProvider'

// The magic decline marker: any token/pmRef whose derived last4 is `0002` (kit-side: card
// 4000 0000 0000 0002) declines synchronously — every other card succeeds.
const DECLINE_LAST4 = '0002'
const DECLINE_REASON = 'sandbox: card declined (magic 0002 card)'

/**
 * Dev-only fake gateway (BILLING_SANDBOX=true): fake money, real choreography. Charges resolve
 * deterministically off the magic marker, and each outcome then POSTS the corresponding
 * Pagar.me-shaped webhook back to our own `/api/billing/webhooks/pagarme` (self-loop over HTTP,
 * Basic auth from Config, ~1s delay) — so settlement/failure runs through the REAL verifier +
 * mapper + handlers, exactly as in production. Every self-emitted payload is `.parse`d against
 * PagarMeWebhookSchema before it leaves, so the loop is self-verifying.
 *
 * The registry binds this INSTEAD of PagarMePaymentProvider in the `real` list when
 * ProductConfig.env.BILLING_SANDBOX (see billing/registry.ts); assertRequiredSecrets rejects the
 * flag in production, so this class can never bind outside dev.
 */
@injectable()
export class SandboxPaymentProvider extends PaymentProvider {
	readonly platform = BillingPlatform.PAGARME
	readonly capabilities = { hostedCardCheckout: true, cardVaulting: true }
	readonly supportedMethods = new Set([PaymentMethodType.CARD, PaymentMethodType.PIX])

	/** Delay before the self-emitted webhook fires — tests set 0 and `await flushWebhooks()`. */
	webhookDelayMs = 1_000

	// In-flight self-emissions, so tests can deterministically await delivery instead of sleeping.
	private readonly pendingWebhooks = new Set<Promise<void>>()

	constructor(private loggingService: LoggingService) {
		super()
	}

	async ensureCustomer(_p: EnsureCustomerParams): Promise<void> {
		// Sandbox holds no customer store — accept and no-op (the real gateway would upsert here).
	}

	async createCheckoutSession(p: CreateCheckoutSessionParams): Promise<CheckoutSessionResult> {
		// The sandbox "hosted page" is our own dev-only confirm endpoint (T7): navigating to it
		// completes the checkout (saves ExternalCheckoutCompletedEvent) and 302s to successUrl —
		// fake money, real choreography, same pattern as the self-emitted webhooks above.
		const sessionRef = `cs_sandbox_${crypto.randomUUID()}`
		const query = new URLSearchParams({
			sessionRef,
			ownerId: p.ownerId,
			intent: p.intent,
			successUrl: p.successUrl,
			...(p.engineInvoiceId ? { engineInvoiceId: p.engineInvoiceId } : {}),
			...(p.amountCents ? { amountCents: String(p.amountCents) } : {}),
		})
		return {
			url: `http://localhost:${Config.env.API_PORT}/api/billing/sandbox/checkout?${query.toString()}`,
			sessionRef,
			expiresAt: new Date(Date.now() + 30 * 60 * 1000),
		}
	}

	async chargeStoredOnSession(p: ChargeStoredOnSessionParams): Promise<ChargeResult> {
		return this.chargeCard(p.pmRef, p.engineInvoiceId, p.amountCents)
	}

	async chargeOffSession(p: ChargeOffSessionParams): Promise<ChargeResult> {
		// `code` carries the engine invoice id on MIT renewals (same as PagarMePaymentProvider).
		return this.chargeCard(p.pmRef, p.code ?? p.idemKey, p.amountCents)
	}

	async cancelCharge(_p: CancelChargeParams): Promise<void> {
		// Refunds always succeed in the sandbox.
	}

	async createPix(p: CreatePixParams): Promise<{ pixId: string; qr: string; copyPaste: string; expiresAt: Date }> {
		const pixId = `pix_sandbox_${p.externalReference}`
		// Pix always settles in the sandbox: emit the delayed charge.paid (payment_method pix) —
		// ExternalPixPaidHandler settles it exactly like a real Pix payment.
		this.emitWebhookLater({
			id: `hook_sandbox_${crypto.randomUUID()}`,
			type: 'charge.paid',
			created_at: new Date().toISOString(),
			data: {
				object: 'charge',
				id: pixId,
				code: p.externalReference,
				amount: p.amountCents,
				paid_amount: p.amountCents,
				currency: 'BRL',
				status: 'paid',
				payment_method: 'pix',
				paid_at: new Date().toISOString(),
			},
		})
		return {
			pixId,
			qr: `sandbox-qr-${p.externalReference}`,
			copyPaste: `sandbox-pix-copy-paste-${p.externalReference}`,
			expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
		}
	}

	/** Await every scheduled self-emission (test helper — pair with `webhookDelayMs = 0`). */
	async flushWebhooks(): Promise<void> {
		await Promise.all([...this.pendingWebhooks])
	}

	// ─── internals ───────────────────────────────────────────────────────────

	private chargeCard(pmRef: string, engineInvoiceId: string, amountCents: number): ChargeResult {
		const last4 = this.last4From(pmRef)

		if (last4 === DECLINE_LAST4) {
			// Sync decline (like Pagar.me's status:'failed' order) + the corresponding
			// charge.payment_failed webhook — same double signal the real gateway produces.
			this.emitWebhookLater(this.cardChargePayload('charge.payment_failed', 'failed', engineInvoiceId, amountCents, pmRef, last4))
			return { ok: false, reason: DECLINE_REASON, declineCode: DeclineReason.CARD_DECLINED }
		}

		const gatewayTxId = `ch_sandbox_${crypto.randomUUID()}`
		this.emitWebhookLater(this.cardChargePayload('charge.paid', 'paid', engineInvoiceId, amountCents, pmRef, last4, gatewayTxId))
		return { ok: true, gatewayTxId }
	}

	private cardChargePayload(
		type: 'charge.paid' | 'charge.payment_failed',
		status: 'paid' | 'failed',
		engineInvoiceId: string,
		amountCents: number,
		pmRef: string,
		last4: string,
		gatewayTxId = `ch_sandbox_${crypto.randomUUID()}`,
	): PagarMeWebhook {
		return {
			id: `hook_sandbox_${crypto.randomUUID()}`,
			type,
			created_at: new Date().toISOString(),
			data: {
				object: 'charge',
				id: gatewayTxId,
				code: engineInvoiceId,
				amount: amountCents,
				...(status === 'paid' ? { paid_amount: amountCents, paid_at: new Date().toISOString() } : {}),
				currency: 'BRL',
				status,
				payment_method: 'credit_card',
				last_transaction: {
					status: status === 'paid' ? 'captured' : 'not_authorized',
					...(status === 'failed' ? { acquirer_message: DECLINE_REASON } : {}),
					card: { id: pmRef, brand: 'visa', last_four_digits: last4, exp_month: 12, exp_year: 2030 },
				},
			},
		}
	}

	/**
	 * Schedules the self-POST to our own Pagar.me webhook endpoint. Non-blocking (the charge call
	 * returns immediately, like the real gateway's async settlement) and never throws — a failed
	 * delivery only warns, like a dropped webhook (the manual pay path still recovers).
	 * The payload is parsed against PagarMeWebhookSchema HERE, so a drifted shape fails loudly
	 * at emission instead of being silently no-op'd by the mapper's safeParse.
	 */
	private emitWebhookLater(payload: PagarMeWebhook): void {
		const body = PagarMeWebhookSchema.parse(payload)

		const delivery = new Promise<void>(resolve => setTimeout(resolve, this.webhookDelayMs)).then(async () => {
			const result = await tryCatchAsync(async () => {
				// Loopback on the local port (not BASE_URL): the sandbox only ever talks to the
				// process that scheduled the webhook.
				const res = await fetch(`http://localhost:${Config.env.API_PORT}/api/billing/webhooks/pagarme`, {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
						authorization: `Basic ${Buffer.from(`${ProductConfig.env.PAGARME_WEBHOOK_USER}:${ProductConfig.env.PAGARME_WEBHOOK_PASSWORD}`).toString('base64')}`,
					},
					body: JSON.stringify(body),
				})
				if (!res.ok) throw new Error(`self-webhook responded ${res.status}`)
			})
			if (!result.success) {
				this.loggingService.warn({
					content: {
						message: 'SandboxPaymentProvider: self-webhook delivery failed',
						webhookType: body.type,
						code: payload.data.code,
						error: result.error.message,
					},
				})
			}
		})

		this.pendingWebhooks.add(delivery)
		void delivery.finally(() => this.pendingWebhooks.delete(delivery))
	}

	// Derive the magic digits from a token/pmRef: the trailing digits — `tok_sandbox_0002` and
	// `pm_sandbox_0002` both read as `0002`; anything without 4 digits reads as `4242`.
	private last4From(ref: string): string {
		const digits = ref.replace(/\D/g, '')
		return digits.length >= 4 ? digits.slice(-4) : '4242'
	}
}
