import { injectable } from 'tsyringe-neo'
import { ProductConfig } from '@shared/config'
import { z } from '@template/core-typescript'
import { BillingWebhookSource } from '@billing/enums'
import { BillingWebhookMapperFactory, type ExternalBillingEvent } from '@billing/services/BillingWebhookMapper'
import {
	PagarMeChargeSchema,
	PagarMeWebhookSchema,
	type PagarMeCharge,
	type PagarMeChargeStatus,
	type PagarMeEventType,
	type PagarMeWebhook,
} from '@billing/services/BillingWebhookMapper/PagarMeWebhookMapper/PagarMeWebhookSchema'
import { GatewayEventSource, type GatewayCollectInput, type GatewayCollectResult } from './GatewayEventSource'
import { LoggingService } from '@template/core-typescript'

const BASE_URL = 'https://api.pagar.me'
const PAGE_SIZE = 50
// Defensive cap — never loop forever on a vendor that keeps paging (or a window with an
// unexpectedly large volume). Hitting it is logged, never silently dropped.
const MAX_PAGES = 20

// GET /core/v5/charges list response — reuses the SAME PagarMeChargeSchema the webhook mapper
// validates against (the v5 REST charge object and the webhook's charge payload are the same
// resource shape), wrapped in the list envelope.
const PagarMeChargeListResponseSchema = z.object({
	data: z.array(PagarMeChargeSchema),
})

// The terminal statuses this source acts on. `pending`/`processing` charges are covered by
// layer 1 (per-object poll) and produce no event here. `chargedback` is included per spec
// Decision 3 (PAGARME row) — PagarMeWebhookMapper.outcomeFor already maps 'charge.chargedback'
// to CHARGE_DISPUTED (a dashboard/bank-initiated chargeback is precisely a fase-2 target), and
// PagarMeChargeStatusSchema carries 'chargedback' as a real charge status. Any other terminal
// status (overpaid/underpaid/partial_canceled) is still out of this task's scope.
//
// `canceled` keys the refund entry — confirmed against the official docs/SDK v5: the charge
// status enum is `pending, paid, canceled, processing, failed, overpaid, underpaid,
// chargedback` and there is NO 'refunded' status. A refunded charge carries
// `status:"canceled"` + `canceled_amount > 0`. `webhookBodyFor` below discriminates a pure
// cancel (canceled WITHOUT canceled_amount) from a refund BEFORE consulting this table — a
// pure cancel intentionally emits no event here (out of scope; not treated as payment_failed).
const EVENT_BY_STATUS: Partial<Record<PagarMeChargeStatus, { type: PagarMeEventType; outcome: string }>> = {
	paid: { type: 'charge.paid', outcome: 'paid' },
	failed: { type: 'charge.payment_failed', outcome: 'payment_failed' },
	canceled: { type: 'charge.refunded', outcome: 'refunded' },
	chargedback: { type: 'charge.chargedback', outcome: 'chargedback' },
}

/**
 * Pagar.me window source — lists charges via `GET /core/v5/charges` and replays each terminal
 * charge through the REAL `PagarMeWebhookMapper` as a synthetic `charge.paid` /
 * `charge.payment_failed` / `charge.refunded` / `charge.chargedback` webhook body (precedent:
 * SandboxPaymentProvider). `openInvoices` is ignored — the window listing already covers every
 * fatura. Missing `PAGARME_API_KEY` → `{listed: 0, events: []}`, no HTTP call.
 */
@injectable()
export class PagarMeEventSource extends GatewayEventSource {
	readonly source = BillingWebhookSource.PAGARME

	constructor(
		private mapperFactory: BillingWebhookMapperFactory,
		private loggingService: LoggingService,
	) {
		super()
	}

	override async collectMissedEvents(input: GatewayCollectInput): Promise<GatewayCollectResult> {
		if (!ProductConfig.env.PAGARME_API_KEY) return { listed: 0, events: [] }

		const mapper = this.mapperFactory.get(BillingWebhookSource.PAGARME)
		if (!mapper) return { listed: 0, events: [] }

		let listed = 0
		const events: ExternalBillingEvent[] = []
		let page = 1
		let capped = false

		while (true) {
			const charges = await this.listChargesPage(input.window, page)
			if (charges.length === 0) break

			for (const charge of charges) {
				listed++
				const body = this.webhookBodyFor(charge)
				if (!body) continue
				events.push(...(await mapper.map(this.syntheticRequest(body))))
			}

			if (charges.length < PAGE_SIZE) break
			page++
			if (page > MAX_PAGES) {
				capped = true
				break
			}
		}

		if (capped) {
			this.loggingService.warn({
				content: {
					message: 'PagarMeEventSource hit the page cap listing charges — some charges may not have been listed',
					maxPages: MAX_PAGES,
					windowSince: input.window.since.toISOString(),
					windowUntil: input.window.until.toISOString(),
				},
			})
		}

		return { listed, events }
	}

	private authHeader(): string {
		// Same Basic-auth idiom as PagarMePaymentProvider: secret key as username, empty password.
		return `Basic ${Buffer.from(`${ProductConfig.env.PAGARME_API_KEY}:`).toString('base64')}`
	}

	private async listChargesPage(window: GatewayCollectInput['window'], page: number): Promise<PagarMeCharge[]> {
		const params = new URLSearchParams({
			// Confirmed against the official docs/SDK v5: GET /core/v5/charges filters by
			// created_since/created_until (RFC3339) — `updated_since` does NOT exist (it was
			// silently ignored by the vendor, not applied). No update-time filter means a charge
			// CREATED before this window but REFUNDED inside it is not listed here. Layer 3
			// (docs/BILLING.md W8, RefundReconcileJob) only catches this gap for ENGINE-INITIATED
			// refunds — i.e. when RequestRefund/RefundInvoice emitted an InvoiceRefundedEvent
			// expectation for it. A refund done directly on the gateway dashboard (no engine
			// expectation) is a registered known gap with NO coverage today — see "Lacuna
			// conhecida" in docs/BILLING.md W8.
			created_since: window.since.toISOString(),
			created_until: window.until.toISOString(),
			page: String(page),
			size: String(PAGE_SIZE),
		})

		const res = await fetch(`${BASE_URL}/core/v5/charges?${params.toString()}`, {
			method: 'GET',
			headers: { authorization: this.authHeader() },
		})
		if (!res.ok) {
			this.logPageFailure(page, `GET /core/v5/charges responded ${res.status} — skipping page ${page}`)
			return []
		}

		const parsed = PagarMeChargeListResponseSchema.safeParse(await res.json())
		if (!parsed.success) {
			this.logPageFailure(page, `malformed /core/v5/charges response on page ${page} — skipping`)
			return []
		}

		return parsed.data.data
	}

	// PAGE-1 (page===1, PagarMe pages are 1-indexed) failures zero out the ENTIRE tick's collect for
	// this source ({listed:0,events:[]} — the `while` loop breaks immediately once the first page
	// returns no charges), which is otherwise indistinguishable from a healthy empty window. Logged
	// at error severity with a stable operational marker so an outage (e.g. a revoked
	// PAGARME_API_KEY) is always visible. A mid-pagination failure (page > 1) still salvages
	// everything collected on earlier pages, so it stays at warn severity.
	private logPageFailure(page: number, message: string): void {
		if (page === 1) {
			this.loggingService.error({ content: { message: `WindowReconcileJob source degraded: PAGARME — ${message}` } })
		} else {
			this.loggingService.warn({ content: { message: `PagarMeEventSource — ${message}` } })
		}
	}

	// Builds the webhook-shaped body for a terminal charge, validated against the mapper's REAL
	// PagarMeWebhookSchema at construction (never a parallel schema) — a drifted shape fails loudly
	// here instead of being silently no-op'd by the mapper's safeParse. Returns undefined for any
	// non-terminal (pending/processing) or out-of-scope status — no event, layer 1 covers it.
	private webhookBodyFor(charge: PagarMeCharge): PagarMeWebhook | undefined {
		const status = charge.status as PagarMeChargeStatus

		// A `canceled` charge is only a REFUND when `canceled_amount > 0` — a pure cancel
		// (canceled with no amount, e.g. an unpaid charge voided before capture) is out of scope
		// and intentionally emits no event here, not even payment_failed.
		if (status === 'canceled' && !((charge.canceled_amount ?? 0) > 0)) return undefined

		const outcome = EVENT_BY_STATUS[status]
		if (!outcome) return undefined

		// A refund dedups downstream via `gatewayRefundId` (ExternalChargeRefundedHandler →
		// CreditNoteService keys the credit note on it), which PagarMeWebhookMapper derives from
		// `charge.last_transaction.id` (see PagarMeWebhookMapper.ts). If the LIST response omits
		// `last_transaction.id` for this charge, this source cannot reproduce the SAME
		// gatewayRefundId a real webhook for the same refund would carry — the handler would then
		// fall back to the synthetic externalId as the dedup key, risking a SECOND, differently-keyed
		// credit note alongside the one the real webhook already booked (a clamped duplicate).
		// Money doctrine: prefer the false negative — skip the synthetic here (still counted in
		// `listed`, so the tick isn't silently empty), warn once naming the charge, and rely on
		// camada 3 (existing dedicated detection) to catch it instead.
		if (outcome.outcome === 'refunded' && !charge.last_transaction?.id) {
			this.loggingService.warn({
				content: {
					message:
						'PagarMeEventSource: charge is a refund but the /core/v5/charges LIST response omitted last_transaction.id — skipping the synthetic refund event this tick (emitting it would risk a duplicate, differently-keyed credit note); relying on other reconciliation layers',
					chargeId: charge.id,
					canceledAmount: charge.canceled_amount,
				},
			})
			return undefined
		}

		return PagarMeWebhookSchema.parse({
			id: `reconcile:pagarme:${charge.id}:${outcome.outcome}`,
			type: outcome.type,
			created_at: new Date().toISOString(),
			data: charge,
		})
	}
}
