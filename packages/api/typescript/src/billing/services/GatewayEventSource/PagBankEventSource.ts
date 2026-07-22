import { injectable } from 'tsyringe-neo'
import { ProductConfig } from '@shared/config'
import { BillingWebhookSource } from '@billing/enums'
import { BillingWebhookMapperFactory, type ExternalBillingEvent } from '@billing/services/BillingWebhookMapper'
import {
	PagBankWebhookSchema,
	type PagBankCharge,
	type PagBankWebhook,
} from '@billing/services/BillingWebhookMapper/PagBankWebhookMapper/PagBankWebhookSchema'
import { GatewayEventSource, type GatewayCollectInput, type GatewayCollectResult } from './GatewayEventSource'
import { LoggingService } from '@template/core-typescript'

const BASE_URL = 'https://api.pagseguro.com'

type ProbeResult = { ok: true; order: PagBankWebhook } | { ok: false; reason: 'not_found' | 'divergent' }

/**
 * PagBank DIRECTED PROBE source (PagBank has no window-listing endpoint we could find — see
 * PAGBANK-DOC-UNCERTAIN below). For each `openInvoices[i]` that carries a `gatewayTxId` (the
 * PagBank order id — the sonda's target per T7's frozen contract), `GET /orders/{orderId}` and
 * replay whatever charges are in a TERMINAL state through the REAL `PagBankWebhookMapper` as a
 * synthetic order body (precedent: SandboxPaymentProvider). A candidate with no `gatewayTxId` is
 * skipped outright — not probed, not counted in `listed`. `window` is ignored (sonda, not window).
 *
 * PAGBANK-DOC-UNCERTAIN: `GET /orders/{orderId}` returning the SAME order shape the webhook posts
 * (id + reference_id + charges[]) is the best-known consult-by-id surface — PagBankPaymentProvider
 * itself never GETs (checkout mint / Pix mint / charge cancel are all POST), so this call has no
 * existing precedent to mirror beyond the auth idiom (Bearer PAGBANK_API_TOKEN). If the real
 * response diverges from `PagBankWebhookSchema` at runtime, the probe is treated as "no answer" for
 * that candidate (never a throw) and this source warns ONCE per `collectMissedEvents` call — not
 * once per candidate — so a systemically wrong endpoint/shape doesn't spam the log once per invoice.
 *
 * PAGBANK-DOC-UNCERTAIN: PagBank's webhook has no envelope-level event id (see
 * `PagBankWebhookSchema`'s own doc comment) — `PagBankWebhookMapper` derives BOTH `externalId` and
 * `gatewayTxId` from the SAME `charge.id`. That leaves no field to carry a `reconcile:...` id
 * without also touching what becomes `gatewayTxId` — an accepted tradeoff for an envelope-id-less
 * webhook. Only the CHARGE id is rewritten; the order's own `id` (the
 * checkout `sessionRef`, used for vault dedup) is passed through untouched so a late REAL webhook
 * for the same order still collides on `sessionRef`.
 *
 * T7 PROVENANCE GAP (investigated, not invented): `GET /orders/{id}` only accepts the ORDER id
 * (`ORDE_…`). `OpenInvoiceCandidate.gatewayTxId` (InvoiceRepository.listOpenForReconciliation) is
 * populated from the invoice's newest PENDING charge on this platform — but PagBank never persists
 * a PENDING charge row: `PagBankPaymentProvider.createCheckoutSession` / `createPix` mint the
 * gateway artifact and hand back a `sessionRef`/`pixId` that neither `CardInvoicePaymentStrategy`
 * nor `PixInvoicePaymentStrategy` write to a local Charge (both are explicitly webhook-first — "no
 * local Charge row is persisted here"). The ONLY Charge rows PagBank ever writes are TERMINAL, via
 * `PagBankWebhookMapper`/`ChargeSettler`, always stamped with the CHARGE id (`CHAR_…`), never
 * PENDING. So there is currently no persisted ORDE_ source to enrich the candidate with — this
 * source validates defensively instead of trusting the shape: only an `ORDE_`-prefixed
 * `gatewayTxId` is dialed; anything else (a `CHAR_` id, or any future non-order shape) is skipped,
 * uncounted, and warned ONCE per `collectMissedEvents` call (same one-warn-per-tick posture as the
 * "divergent" branch below) so a systemically wrong id doesn't spam the log once per invoice.
 */
@injectable()
export class PagBankEventSource extends GatewayEventSource {
	readonly source = BillingWebhookSource.PAGBANK

	// Only remaining PROBE source (T7) — WindowReconcileJob only pays for
	// InvoiceRepository.listOpenForReconciliation when this is true.
	override readonly requiresOpenInvoices = true

	constructor(
		private mapperFactory: BillingWebhookMapperFactory,
		private loggingService: LoggingService,
	) {
		super()
	}

	override async collectMissedEvents(input: GatewayCollectInput): Promise<GatewayCollectResult> {
		const apiToken = ProductConfig.env.PAGBANK_API_TOKEN
		if (!apiToken) return { listed: 0, events: [] }

		const mapper = this.mapperFactory.get(BillingWebhookSource.PAGBANK)
		if (!mapper) return { listed: 0, events: [] }

		let listed = 0
		const events: ExternalBillingEvent[] = []
		let warned = false
		let warnedInvalidId = false

		for (const candidate of input.openInvoices) {
			// No order id to probe — skipped outright, never counted (T7's frozen contract).
			if (!candidate.gatewayTxId) continue

			// T7 provenance guard (see class doc): only an ORDE_ order id is a valid probe target.
			// A CHAR_ (or any other non-order-shaped) id would 404/error against GET /orders/{id} —
			// skip it outright rather than issuing a GET we already know is invalid.
			if (!candidate.gatewayTxId.startsWith('ORDE_')) {
				if (!warnedInvalidId) {
					this.loggingService.warn({
						content: {
							message:
								'PagBankEventSource: candidate gatewayTxId is not an order id (ORDE_...) — PagBank has no persisted order-id source for open invoices yet (T7 limitation), skipping probe(s) this tick',
							gatewayTxId: candidate.gatewayTxId,
						},
					})
					warnedInvalidId = true
				}
				continue
			}

			const result = await this.fetchOrder(candidate.gatewayTxId, apiToken)
			if (!result.ok) {
				if (result.reason === 'divergent' && !warned) {
					this.loggingService.warn({
						content: {
							message:
								'PagBankEventSource: unexpected response shape probing order (PAGBANK-DOC-UNCERTAIN) — treating as no answer for this tick',
							gatewayTxId: candidate.gatewayTxId,
						},
					})
					warned = true
				}
				continue // not_found (order still open / nothing new) → invoice stays open, no warn
			}

			listed += result.order.charges?.length ?? 0

			const body = this.webhookBodyFor(result.order, candidate.engineInvoiceId)
			if (!body) continue
			events.push(...(await mapper.map(this.syntheticRequest(body))))
		}

		return { listed, events }
	}

	private async fetchOrder(orderId: string, apiToken: string): Promise<ProbeResult> {
		try {
			const res = await fetch(`${BASE_URL}/orders/${orderId}`, {
				method: 'GET',
				headers: { authorization: `Bearer ${apiToken}` },
			})
			if (res.status === 404) return { ok: false, reason: 'not_found' }
			if (!res.ok) return { ok: false, reason: 'divergent' }

			const parsed = PagBankWebhookSchema.safeParse(await res.json().catch(() => undefined))
			if (!parsed.success) return { ok: false, reason: 'divergent' }
			return { ok: true, order: parsed.data }
		} catch {
			return { ok: false, reason: 'divergent' }
		}
	}

	// Builds the webhook-shaped order body for the mapper: only TERMINAL charges are carried over
	// (their `id` rewritten to the deterministic reconcile id), non-terminal ones (AUTHORIZED /
	// IN_ANALYSIS / WAITING — the mapper itself would no-op them anyway) are dropped so this source
	// never has to guess what the mapper will do with them. `reference_id` is stamped from the
	// candidate's KNOWN engineInvoiceId (never trusted off the probe response).
	private webhookBodyFor(order: PagBankWebhook, engineInvoiceId: string): PagBankWebhook | undefined {
		const charges: PagBankCharge[] = []
		for (const charge of order.charges ?? []) {
			const outcome = this.outcomeFor(charge)
			if (!outcome) continue
			charges.push({ ...charge, id: `reconcile:pagbank:${charge.id}:${outcome}` })
		}
		if (charges.length === 0) return undefined

		return PagBankWebhookSchema.parse({
			id: order.id, // real order id — sessionRef stays real for checkout vault dedup
			reference_id: engineInvoiceId,
			charges,
		})
	}

	// Mirrors PagBankWebhookMapper.eventForCharge's own branches EXACTLY (same 4 conditions) — the
	// duplication only exists to seed the deterministic `{outcome}` id component before handing the
	// body to the real mapper; the mapper remains the sole authority for the actual event built.
	private outcomeFor(charge: PagBankCharge): string | undefined {
		if (charge.status === 'PAID' && charge.payment_method?.type === 'CREDIT_CARD') return 'paid_card'
		if (charge.status === 'PAID' && charge.payment_method?.type === 'PIX') return 'paid_pix'
		if (charge.status === 'DECLINED') return 'declined'
		if (charge.status === 'CANCELED') return 'canceled'
		return undefined
	}
}
