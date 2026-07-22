import { injectable } from 'tsyringe-neo'
import Z from 'zod'
import { z } from '@template/core-typescript'
import { ProductConfig } from '@shared/config'
import { BillingWebhookSource } from '@billing/enums'
import { MercadoPagoWebhookMapper } from '@billing/services/BillingWebhookMapper'
import { GatewayEventSource, type GatewayCollectInput, type GatewayCollectResult } from './GatewayEventSource'
import { LoggingService } from '@template/core-typescript'

// GET /v1/payments/search response — only the fields this source reads. `results[].id/status`
// decide WHICH payments get fed to the mapper (skip pending) and `paging` drives the page loop;
// the full payment shape (amounts, external_reference, …) is re-validated by the mapper's own
// `fetchPayment` (GET /v1/payments/{id}) — this source never parses money fields itself.
const MercadoPagoSearchResponseSchema = z.object({
	paging: z.object({ total: z.number(), limit: z.number(), offset: z.number() }).nullish(),
	results: z
		.array(
			z.object({
				id: z.union([z.number(), z.string()]),
				status: z.string().nullish(),
			}),
		)
		.nullish(),
})

const PAGE_LIMIT = 50
// Hard cap on pages fetched per collect call — a pathological `paging.total` must never turn a
// sweep tick into an unbounded loop; the next tick's overlapping window recovers whatever this
// cap left behind (same posture as the spec's "paginação por fonte com cap").
const MAX_PAGES = 20

/**
 * MercadoPago window source — GET /v1/payments/search?range=date_last_updated over the sweep
 * window (paginated). For each terminal (non-pending) payment listed, builds the MINIMAL
 * webhook-shaped notification MercadoPagoWebhookMapper already parses (`{type:'payment',
 * data:{id}}`) and lets the mapper re-fetch + classify it exactly like a real webhook delivery —
 * same reuse posture as the other sources reusing their platform's mapper via `syntheticRequest`.
 *
 * externalId determinism: the notification's own `id` field is deliberately left unset. MercadoPago
 * notification/delivery ids are unstable and we have none to give it (this is a synthetic
 * re-listing, not a real delivery) — `MercadoPagoWebhookMapper.map()` already falls back to a
 * deterministic `mp:{gatewayTxId}:{status}` externalId when the notification carries no `id`
 * (see the "REAL thin envelope" case it already handles), which is stable across re-collects of
 * overlapping windows without touching the mapper.
 */
@injectable()
export class MercadoPagoEventSource extends GatewayEventSource {
	readonly source = BillingWebhookSource.MERCADOPAGO

	private readonly baseUrl = 'https://api.mercadopago.com'

	constructor(
		private mapper: MercadoPagoWebhookMapper,
		private loggingService: LoggingService,
	) {
		super()
	}

	override async collectMissedEvents(input: GatewayCollectInput): Promise<GatewayCollectResult> {
		// Capability gate — no config, no throw: same posture as the port's own default.
		if (!ProductConfig.env.MERCADOPAGO_ACCESS_TOKEN) return { listed: 0, events: [] }

		const { since, until } = input.window
		let listed = 0
		const events: GatewayCollectResult['events'] = []
		let offset = 0

		for (let page = 0; page < MAX_PAGES; page++) {
			const url = new URL(`${this.baseUrl}/v1/payments/search`)
			url.searchParams.set('range', 'date_last_updated')
			url.searchParams.set('begin_date', since.toISOString())
			url.searchParams.set('end_date', until.toISOString())
			url.searchParams.set('limit', String(PAGE_LIMIT))
			url.searchParams.set('offset', String(offset))

			// Non-2xx (or a network-level fetch rejection) mid-pagination must NEVER throw — the
			// window-listing loop already collected `listed`/`events` from earlier pages this tick,
			// and a throw here would let WindowReconcileJob's per-source tryCatch discard them
			// entirely (only recovered on the next overlapping tick). Log loudly with the window +
			// what was already collected, then return the partial result — same posture as the other
			// sources' warn+partial mold (Stripe's page-cap warn, PagarMe's per-page skip). A PAGE-1
			// (first-request) failure is logged at error severity with a stable operational marker
			// (`logPageFailure`) — it zeroes out this tick's ENTIRE collect ({listed:0,events:[]}),
			// which is otherwise indistinguishable from a healthy empty window; mid-pagination
			// failures (page > 0) still salvage everything collected on earlier pages, so they stay
			// at warn severity.
			let res: Response
			try {
				res = await fetch(url, {
					headers: { authorization: `Bearer ${ProductConfig.env.MERCADOPAGO_ACCESS_TOKEN}` },
				})
			} catch (error) {
				this.logPageFailure(
					page,
					`GET /v1/payments/search failed for window ${since.toISOString()}..${until.toISOString()} ` +
						`(page ${page + 1}) — listed ${listed} so far; returning partial results. ${error instanceof Error ? error.message : String(error)}`,
				)
				break
			}
			if (!res.ok) {
				const detail = await res.text().catch(() => '')
				this.logPageFailure(
					page,
					`GET /v1/payments/search responded ${res.status} for window ` +
						`${since.toISOString()}..${until.toISOString()} (page ${page + 1}) — listed ${listed} so far; returning partial results.` +
						(detail ? ` ${detail}` : ''),
				)
				break
			}

			// The response body parse (JSON parse + schema validation) must live INSIDE the same
			// resilience posture as the fetch itself — a malformed 200 body mid-pagination is exactly
			// as recoverable as a non-2xx status: warn/error + return whatever was already collected,
			// never throw (a throw here would previously escape uncaught and discard the whole tick).
			let parsed: Z.infer<typeof MercadoPagoSearchResponseSchema>
			try {
				parsed = MercadoPagoSearchResponseSchema.parse(await res.json())
			} catch (error) {
				this.logPageFailure(
					page,
					`malformed response body from GET /v1/payments/search for window ` +
						`${since.toISOString()}..${until.toISOString()} (page ${page + 1}) — listed ${listed} so far; returning partial results. ` +
						`${error instanceof Error ? error.message : String(error)}`,
				)
				break
			}
			const results = parsed.results ?? []

			for (const payment of results) {
				listed++
				// Pending payments are still in flight — nothing to reconcile yet; a later window
				// (once it settles/rejects) picks them up.
				if (payment.status === 'pending') continue

				const notification = { type: 'payment', data: { id: payment.id } }
				const mapped = await this.mapper.map(this.syntheticRequest(notification))
				events.push(...mapped)
			}

			const total = parsed.paging?.total ?? results.length
			offset += results.length
			if (results.length === 0 || offset >= total) break

			// Cap hit WITH more remaining (offset < total) — the sweep tick is walking away from a
			// pathologically large window/vendor result set. Not silent: the next overlapping window
			// still recovers whatever this tick left behind, but an operator needs to see it happening.
			if (page === MAX_PAGES - 1) {
				this.loggingService.warn({
					content: {
						message: 'MercadoPagoEventSource pagination cap reached — remaining payments will be picked up by the next overlapping window',
						maxPages: MAX_PAGES,
						windowSince: since.toISOString(),
						windowUntil: until.toISOString(),
						listed,
						offset,
						total,
					},
				})
			}
		}

		return { listed, events }
	}

	// PAGE-1 (first-request, page===0) failures are logged at error severity with a stable
	// operational marker so WindowReconcileJob's normal info-level success line for a
	// {listed:0,events:[]} result can never be mistaken for a healthy empty window — an outage
	// (e.g. a revoked MERCADOPAGO_ACCESS_TOKEN) must be visible. Mid-pagination failures (page > 0)
	// still salvage earlier pages' results, so they stay at warn severity.
	private logPageFailure(page: number, message: string): void {
		if (page === 0) {
			this.loggingService.error({ content: { message: `WindowReconcileJob source degraded: MERCADOPAGO — ${message}` } })
		} else {
			this.loggingService.warn({ content: { message: `MercadoPagoEventSource — ${message}` } })
		}
	}
}
