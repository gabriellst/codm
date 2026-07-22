import { injectable } from 'tsyringe-neo'
import Z from 'zod'
import { z } from '@template/core-typescript'
import { ProductConfig } from '@shared/config'
import { withResilience } from '@template/core-typescript'
import { BaseError } from '@template/core-typescript'
import type { InterfaceErrors } from '@billing/errors'
import { BillingWebhookSource } from '@billing/enums'
import { BillingWebhookMapperFactory, type BillingWebhookMapper } from '@billing/services/BillingWebhookMapper'
import { AsaasWebhookSchema } from '@billing/services/BillingWebhookMapper/AsaasWebhookMapper'
import type { AsaasEventType } from '@billing/services/BillingWebhookMapper/AsaasWebhookMapper/AsaasWebhookSchema'
import type { ExternalBillingEvent } from '@billing/services/BillingWebhookMapper'
import { GatewayEventSource, type GatewayCollectInput, type GatewayCollectResult } from './GatewayEventSource'
import { LoggingService } from '@template/core-typescript'

// GET /v3/payments list-item shape — a superset of AsaasWebhookSchema's `payment` sub-resource
// fields, so each listed row re-shapes 1:1 into the webhook-shaped `payment` object the mapper
// expects. Every optional field `.nullish()` (never bare `.optional()`), mirroring
// AsaasWebhookSchema's own null-bearing-payload posture.
const AsaasPaymentListItemSchema = z
	.object({
		id: z.string(),
		customer: z.string().nullish(),
		value: z.number().nullish(),
		billingType: z.string().nullish(),
		status: z.string().nullish(),
		dueDate: z.string().nullish(),
		externalReference: z.string().nullish(),
		checkoutSession: z.string().nullish(),
		creditCard: z
			.object({
				creditCardNumber: z.string().nullish(),
				creditCardBrand: z.string().nullish(),
				creditCardToken: z.string().nullish(),
			})
			.loose()
			.nullish(),
		refunds: z.array(z.object({ id: z.string().nullish(), value: z.number().nullish(), status: z.string().nullish() }).loose()).nullish(),
	})
	.loose()
type AsaasPaymentListItem = Z.infer<typeof AsaasPaymentListItemSchema>

const AsaasPaymentListResponseSchema = z.object({
	object: z.string().nullish(),
	hasMore: z.boolean().nullish(),
	totalCount: z.number().nullish(),
	limit: z.number().nullish(),
	offset: z.number().nullish(),
	data: z.array(AsaasPaymentListItemSchema),
})

// The payment statuses this source reconciles, mapped to the Asaas webhook event name
// AsaasWebhookMapper would have received for the SAME fact — extracted from
// AsaasWebhookMapper.outcomeFor's own dispatch table, never invented. The real mapper resolves
// PAYMENT_OVERDUE → CHARGE_FAILED → ExternalChargeFailedEvent (AsaasWebhookMapper.outcomeFor).
// Every other status (PENDING, RECEIVED_IN_CASH, …) is intentionally left unmapped: pending
// payments generate no event, and anything else is OUT of this task's fence. This single map
// backs BOTH windowed queries below (`listPaymentDateWindow` / `listDueDateOverdueWindow`) — a
// payment can only ever match ONE of its entries per query (paymentDate-windowed rows are never
// OVERDUE — see the confirmed-fact note above `listDueDateOverdueWindow` — and the dueDate/OVERDUE
// query is itself filtered to `status=OVERDUE` server-side), so there is no double-count risk
// combining both queries' results.
//
// ASAAS-DOC-UNCERTAIN: the exact `status` string enumeration on the v3 payment RESOURCE (as
// opposed to the webhook EVENT-name catalog in AsaasWebhookSchema) is inferred from Asaas'
// documented status vocabulary, not independently confirmed against a live list-endpoint sample.
const EVENT_BY_STATUS: Partial<Record<string, AsaasEventType>> = {
	CONFIRMED: 'PAYMENT_CONFIRMED',
	RECEIVED: 'PAYMENT_RECEIVED',
	REFUNDED: 'PAYMENT_REFUNDED',
	CHARGEBACK_REQUESTED: 'PAYMENT_CHARGEBACK_REQUESTED',
	OVERDUE: 'PAYMENT_OVERDUE',
}

// Defensive page cap — mirrors StripeEventSource's "no silent caps" posture (spec Decision 5):
// stop and warn loudly (with what was dropped) instead of looping unbounded against the vendor.
const MAX_PAGES = 20
const PAGE_SIZE = 100

/**
 * Asaas window source — TWO independent windowed listings against `GET /v3/payments`, each
 * paginated `offset`/`limit`, combined into one `{listed, events}`:
 *
 * 1. `listPaymentDateWindow` — `paymentDate[ge/le]` — the moment a payment actually SETTLED.
 *    Feeds the paid/refunded/chargeback branches of `EVENT_BY_STATUS`.
 * 2. `listDueDateOverdueWindow` — `status=OVERDUE` + `dueDate[ge/le]` — the moment a payment's
 *    due date fell inside the window. Feeds the OVERDUE branch.
 *
 * CONFIRMED (Asaas official docs): `paymentDate` is set only once a payment is PAID — an OVERDUE
 * payment was never paid, has no `paymentDate`, and can therefore NEVER appear in a
 * `paymentDate`-windowed list. Query 1's OVERDUE branch is structurally dead; the OVERDUE fact can
 * only be recovered via a `dueDate`-windowed query, which is why query 2 exists.
 * `dueDate[ge]`/`dueDate[le]` is a real, documented filter (literal example in the official
 * reference). The list envelope `{object:"list", hasMore, totalCount, limit, offset, data}` is
 * confirmed; `limit` caps at 100 (`PAGE_SIZE`).
 *
 * Unlike Stripe (whose `/v1/events` listing IS the webhook envelope), Asaas' list endpoint
 * returns payment RESOURCES, not events — so each listed payment is re-shaped into the
 * webhook-shaped envelope `AsaasWebhookMapper` expects (`{event, payment}`), the `event` name
 * chosen from `payment.status` (EVENT_BY_STATUS, extracted from the mapper's own outcome table),
 * validated against the REAL `AsaasWebhookSchema` at construction (never a parallel schema)
 * before being fed to `mapper.map(syntheticRequest(body))`. `openInvoices` is ignored: this is a
 * window source, not a directed probe.
 *
 * Pagination posture (both queries, independently): a non-2xx response mid-pagination is NEVER
 * thrown — it is logged via LoggingService and the query returns whatever it already collected
 * this tick (Stripe/PagarMe mold). A page-1 failure on ONE query zeroes out only that query's contribution;
 * the OTHER query's results still return normally.
 */
@injectable()
export class AsaasEventSource extends GatewayEventSource {
	readonly source = BillingWebhookSource.ASAAS

	constructor(
		private mapperFactory: BillingWebhookMapperFactory,
		private loggingService: LoggingService,
	) {
		super()
	}

	override async collectMissedEvents(input: GatewayCollectInput): Promise<GatewayCollectResult> {
		const apiKey = ProductConfig.env.ASAAS_API_KEY
		if (!apiKey) return { listed: 0, events: [] }

		const mapper = this.mapperFactory.get(this.source)
		if (!mapper) return { listed: 0, events: [] }

		// Independently paginated + independently resilient — a mid-pagination failure on one query
		// never zeroes out the other (see class doc "Pagination posture").
		const paymentDate = await this.listWindow(offset => this.paymentDateParams(input.window, offset), apiKey, mapper, 'paymentDate window')
		const dueDateOverdue = await this.listWindow(
			offset => this.dueDateOverdueParams(input.window, offset),
			apiKey,
			mapper,
			'dueDate/OVERDUE window',
		)

		return {
			listed: paymentDate.listed + dueDateOverdue.listed,
			events: [...paymentDate.events, ...dueDateOverdue.events],
		}
	}

	// Shared pagination loop for both windowed queries — `buildParams` supplies the query-specific
	// filter params for a given `offset`, everything else (paging, resilience, warn+partial
	// posture, event mapping) is identical between the two queries.
	private async listWindow(
		buildParams: (offset: number) => URLSearchParams,
		apiKey: string,
		mapper: BillingWebhookMapper,
		label: string,
	): Promise<GatewayCollectResult> {
		let listed = 0
		const events: ExternalBillingEvent[] = []
		let offset = 0

		for (let page = 0; page < MAX_PAGES; page++) {
			let response: Z.infer<typeof AsaasPaymentListResponseSchema>
			try {
				response = await this.fetchPage(buildParams(offset), apiKey)
			} catch (error) {
				// Non-2xx (or a network-level failure) mid-pagination must NEVER throw — a throw here
				// would let WindowReconcileJob's per-source tryCatch discard everything collected THIS
				// tick, including whatever the other query already gathered. Log loudly with what was
				// already collected, then return the partial result (Stripe/PagarMe mold). A PAGE-1
				// (first-request, page===0) failure zeroes out THIS query's entire contribution — logged
				// at error severity with a stable operational marker so it's never mistaken for a healthy
				// empty window; mid-pagination failures (page > 0) still salvage earlier pages, so they
				// stay at warn severity.
				const message = `${label} — GET /payments failed on page ${page + 1} — listed ${listed} so far; returning partial results.`
				const errorDetail = error instanceof Error ? error.message : String(error)
				if (page === 0) {
					this.loggingService.error({
						content: { message: `WindowReconcileJob source degraded: ASAAS — ${message}`, page: page + 1, listed, error: errorDetail },
					})
				} else {
					this.loggingService.warn({
						content: { message: `AsaasEventSource — ${message}`, page: page + 1, listed, error: errorDetail },
					})
				}
				return { listed, events }
			}

			listed += response.data.length
			for (const payment of response.data) {
				const body = this.webhookBodyFor(payment)
				if (!body) continue
				events.push(...(await mapper.map(this.syntheticRequest(body))))
			}

			const gotFullPage = response.data.length === PAGE_SIZE
			if (!(response.hasMore ?? gotFullPage)) return { listed, events }

			offset += PAGE_SIZE
		}

		this.loggingService.warn({
			content: {
				message:
					'AsaasEventSource page cap reached — remaining payments on later pages were DROPPED this tick (will be picked up by the next overlapping sweep)',
				label,
				maxPages: MAX_PAGES,
				pageSize: PAGE_SIZE,
				listed,
			},
		})
		return { listed, events }
	}

	private async fetchPage(params: URLSearchParams, apiKey: string): Promise<Z.infer<typeof AsaasPaymentListResponseSchema>> {
		const data = await withResilience(
			async signal => {
				const res = await fetch(`${ProductConfig.env.ASAAS_BASE_URL}/payments?${params.toString()}`, {
					method: 'GET',
					headers: { 'content-type': 'application/json', access_token: apiKey },
					signal,
				})
				if (!res.ok) {
					const detail = await res.text().catch(() => '')
					throw new BaseError<InterfaceErrors>('PROVIDER_ERROR', detail || `Asaas responded ${res.status}`)
				}
				return await res.json()
			},
			// Reads are safe to retry (no Idempotency-Key needed) — mirrors AsaasPaymentProvider's
			// `retryable: method === 'GET'` posture. Shared breaker label across both queries: they
			// hit the SAME vendor endpoint family, so a run of failures on either should trip the
			// same circuit.
			{ retryable: true, label: 'asaas-window-reconcile' },
		)

		return AsaasPaymentListResponseSchema.parse(data)
	}

	// CONFIRMED (Asaas docs): paymentDate is the settlement date — this query only ever surfaces
	// payments EVENT_BY_STATUS resolves to the paid/refunded/chargeback branches (never OVERDUE).
	private paymentDateParams(window: { since: Date; until: Date }, offset: number): URLSearchParams {
		return new URLSearchParams({
			offset: String(offset),
			limit: String(PAGE_SIZE),
			'paymentDate[ge]': this.toISODate(window.since),
			'paymentDate[le]': this.toISODate(window.until),
		})
	}

	// CONFIRMED (Asaas docs, literal filter example): `dueDate[ge]`/`dueDate[le]` windows by due
	// date; `status=OVERDUE` keeps the query cheap (server-side filter, not a client-side one) and
	// guarantees every row this query returns maps to EVENT_BY_STATUS.OVERDUE.
	//
	// `dueDate[ge]` is DELIBERATELY WIDER than the sliding `window.since` — Asaas flips a payment's
	// status to OVERDUE strictly AFTER its due date (never at the due date itself), so by the time a
	// payment actually goes OVERDUE, its `dueDate` may already have slid outside the sweep's narrow
	// reconcile window. A payment overdue since 5 days ago would never be listed if this query used
	// `window.since` (the sliding-window start) as its lower bound. Instead, `dueDate[ge]` uses the
	// WIDER `BILLING_WINDOW_RECONCILE_MAX_AGE_DAYS` lookback (existing Config var, default 7 days) —
	// cheap because this query is already server-filtered to `status=OVERDUE`, and re-listing an
	// already-ingested payment is a no-op (deterministic externalIds dedupe it downstream).
	// `dueDate[le]` stays `window.until` — an OVERDUE payment whose due date is still in the future
	// relative to the sweep's "now" was never a candidate to begin with.
	private dueDateOverdueParams(window: { since: Date; until: Date }, offset: number): URLSearchParams {
		const lookbackMs = ProductConfig.env.BILLING_WINDOW_RECONCILE_MAX_AGE_DAYS * 24 * 60 * 60_000
		const dueDateGte = new Date(window.until.getTime() - lookbackMs)
		return new URLSearchParams({
			offset: String(offset),
			limit: String(PAGE_SIZE),
			status: 'OVERDUE',
			'dueDate[ge]': this.toISODate(dueDateGte),
			'dueDate[le]': this.toISODate(window.until),
		})
	}

	// Re-shapes a listed payment into the webhook-shaped envelope AsaasWebhookMapper expects,
	// validated against the REAL AsaasWebhookSchema (never a parallel schema) — undefined when the
	// payment's status isn't one of the outcomes this source reconciles (EVENT_BY_STATUS;
	// pending/unmapped statuses generate no event).
	private webhookBodyFor(payment: AsaasPaymentListItem): Z.infer<typeof AsaasWebhookSchema> | undefined {
		const event = payment.status ? EVENT_BY_STATUS[payment.status] : undefined
		if (!event) return undefined

		// NOTE: AsaasWebhookMapper does NOT read this envelope `id` for its dedup key — it derives
		// `externalId` internally as `${event}:${gatewayTxId}` (see AsaasWebhookMapper.map), which is
		// already deterministic and stable across re-collect. This synthetic id is set only for
		// parity/debug traceability with the other window sources (Pagar.me/Stripe DO thread their
		// envelope id through as the mapped event's externalId) — it has no effect on the mapped
		// event's payload here.
		return AsaasWebhookSchema.parse({
			id: `reconcile:asaas:${payment.id}:${event}`,
			event,
			dateCreated: null,
			payment: {
				id: payment.id,
				customer: payment.customer ?? null,
				value: payment.value ?? null,
				netValue: null,
				billingType: payment.billingType ?? null,
				status: payment.status ?? null,
				dueDate: payment.dueDate ?? null,
				externalReference: payment.externalReference ?? null,
				checkoutSession: payment.checkoutSession ?? null,
				creditCard: payment.creditCard ?? null,
				refunds: payment.refunds ?? null,
			},
			checkout: null,
		})
	}

	private toISODate(date: Date): string {
		return date.toISOString().slice(0, 10)
	}
}
