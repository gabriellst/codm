import Stripe from 'stripe'
import { injectable } from 'tsyringe-neo'
import { ProductConfig } from '@shared/config'
import { BillingWebhookSource } from '@billing/enums'
import { BillingWebhookMapperFactory } from '@billing/services/BillingWebhookMapper'
import { StripeEventTypeSchema } from '@billing/services/BillingWebhookMapper/StripeWebhookMapper'
import type { ExternalBillingEvent } from '@billing/services/BillingWebhookMapper'
import { GatewayEventSource, type GatewayCollectInput, type GatewayCollectResult } from './GatewayEventSource'
import { LoggingService } from '@template/core-typescript'

// The exact set of Stripe event types StripeWebhookMapper acts on — extracted FROM the mapper's
// own schema (never hand-duplicated) so the two stay in lockstep if the mapper grows a new type.
const TREATED_TYPES: string[] = [...StripeEventTypeSchema.options]

// Defensive page cap: a single window should never need more than this many 100-event pages. If
// it does, stop and warn loudly (with what was dropped) instead of looping unbounded against the
// vendor — "no silent caps" (spec Decision 5).
const MAX_PAGES = 20
const PAGE_SIZE = 100

/**
 * Stripe window source — `GET /v1/events` filtered to the mapper's own treated types, paginated
 * over `created: {gte: since, lte: until}`. Stripe delivers the SAME envelope on `/v1/events` as
 * on webhooks, so each listed event object is replayed through `StripeWebhookMapper` via
 * `syntheticRequest()` unchanged — the resulting `externalId` is the vendor's real `evt_` id
 * (first-line dedup against a webhook that eventually arrives for the same fact). `openInvoices`
 * is ignored: the window already covers every fact, so no per-invoice probe is needed.
 */
@injectable()
export class StripeEventSource extends GatewayEventSource {
	readonly source = BillingWebhookSource.STRIPE

	constructor(
		private mapperFactory: BillingWebhookMapperFactory,
		private loggingService: LoggingService,
	) {
		super()
	}

	private client: Stripe | undefined

	// Lazily construct the SDK (same idiom as StripeWebhookMapper/StripePaymentProvider) — merely
	// resolving this class via DI must never news up Stripe with an empty key. Overridable for
	// tests, which stub `events.list`.
	protected stripe(): Stripe {
		if (!this.client) this.client = new Stripe(ProductConfig.env.STRIPE_API_KEY)
		return this.client
	}

	override async collectMissedEvents(input: GatewayCollectInput): Promise<GatewayCollectResult> {
		if (!ProductConfig.env.STRIPE_API_KEY) return { listed: 0, events: [] }

		const mapper = this.mapperFactory.get(this.source)
		if (!mapper) return { listed: 0, events: [] }

		let listed = 0
		const events: ExternalBillingEvent[] = []
		let startingAfter: string | undefined

		for (let page = 0; page < MAX_PAGES; page++) {
			const response = await this.stripe().events.list({
				created: { gte: this.toUnixSeconds(input.window.since), lte: this.toUnixSeconds(input.window.until) },
				types: TREATED_TYPES,
				limit: PAGE_SIZE,
				...(startingAfter ? { starting_after: startingAfter } : {}),
			})

			for (const event of response.data) {
				listed++
				// Stripe's own event envelope IS the webhook body — reuse the real mapper unchanged so
				// the externalId (evt_…) matches exactly what a delayed webhook would have carried.
				const mapped = await mapper.map(this.syntheticRequest(event))
				events.push(...mapped)
			}

			if (!response.has_more) return { listed, events }

			const cursor = response.data.at(-1)?.id
			if (!cursor) return { listed, events }
			startingAfter = cursor
		}

		this.loggingService.warn({
			content: {
				message:
					'StripeEventSource page cap reached — remaining events on later pages were DROPPED this tick (will be picked up by the next overlapping sweep)',
				maxPages: MAX_PAGES,
				pageSize: PAGE_SIZE,
				windowSince: input.window.since.toISOString(),
				windowUntil: input.window.until.toISOString(),
				listed,
			},
		})
		return { listed, events }
	}

	private toUnixSeconds(date: Date): number {
		return Math.floor(date.getTime() / 1000)
	}
}
