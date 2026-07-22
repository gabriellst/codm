import { injectable } from 'tsyringe-neo'
import { Handler } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { tryCatchAsync } from '@template/core-typescript'
import { forEachWithConcurrency } from '@template/core-typescript'
import { ProductConfig } from '@shared/config'
import { BillingWebhookSource } from '@billing/enums/BillingWebhookSource'

import { InvoiceRepository } from '@billing/repositories'
import { GatewayEventSourceFactory, BillingEventIngest } from '@billing/services'
import { LoggingService } from '@template/core-typescript'
import { BillingPlatform } from '@template/contracts-typescript/wire/enums'

const WindowReconcileJobInputSchema = z.object({})

/** BillingWebhookSource and BillingPlatform are separate enums (webhook routing vs. gateway
 *  attribution) that happen to share member names today — an explicit map, not a cast, is what
 *  survives either enum diverging later. Mirrors BillingEventIngest's SCOPE_BY_SOURCE. */
const PLATFORM_BY_SOURCE: Record<BillingWebhookSource, BillingPlatform> = {
	[BillingWebhookSource.PAGARME]: BillingPlatform.PAGARME,
	[BillingWebhookSource.STRIPE]: BillingPlatform.STRIPE,
	[BillingWebhookSource.ASAAS]: BillingPlatform.ASAAS,
	[BillingWebhookSource.GETNET]: BillingPlatform.GETNET,
	[BillingWebhookSource.MERCADOPAGO]: BillingPlatform.MERCADOPAGO,
	[BillingWebhookSource.PAGBANK]: BillingPlatform.PAGBANK,
	[BillingWebhookSource.INFINITEPAY]: BillingPlatform.INFINITEPAY,
	[BillingWebhookSource.REDE]: BillingPlatform.REDE,
}

const ALL_SOURCES: BillingWebhookSource[] = Object.values(BillingWebhookSource)

/**
 * Fase-2 sweep — the camada-2 backstop for facts that originate AT the gateway with no local
 * pending object to poll (a dashboard refund/chargeback, a checkout completed during a dropped
 * webhook/outbox window). Every tick asks EACH of the 8 integrated platforms "what happened in the
 * last window" (or, for probe-only platforms, "what happened to these open invoices") via
 * `GatewayEventSourceFactory`, and re-injects whatever it recognizes through the SAME
 * `BillingEventIngest` the real webhook uses — re-delivery of an already-seen fact is a no-op by
 * construction (dedup by externalId + downstream idempotency), so replay is always safe.
 *
 * One platform down (tryCatch per source) must not starve the rest of the sweep — same isolation
 * as ReconcilePendingChargesJob/RefundReconcileJob/DunningRetryJob. `accepted > 0` for a source is
 * the operational signal "a webhook from that platform was lost and just got recovered" (AC-6).
 */
@injectable()
export class WindowReconcileJob extends Handler<typeof WindowReconcileJobInputSchema> {
	readonly name = 'billing.reconcile.window' as const
	readonly inputSchema = WindowReconcileJobInputSchema
	readonly outputSchema = z.void()

	constructor(
		private invoiceRepository: InvoiceRepository,
		private sourceFactory: GatewayEventSourceFactory,
		private ingest: BillingEventIngest,
		private loggingService: LoggingService,
	) {
		super()
	}

	/** In-flight gateway collects per tick — one platform round-trip (window sources) or up to
	 *  openInvoices.length round-trips (probe sources) each; same rationale as the sibling sweeps
	 *  (DunningRetryJob.SWEEP_CONCURRENCY) — the cost is the gateway call, never a rate-limit stampede. */
	private static readonly SWEEP_CONCURRENCY = 5

	async handle(): Promise<void> {
		const now = new Date()
		// Sliding window with overlap: 2× the tick cadence + 15min, so two consecutive ticks always
		// cover the full elapsed time even when a tick runs late (spec Decision 5).
		const everyMs = ProductConfig.env.BILLING_WINDOW_RECONCILE_EVERY_HOURS * 3_600_000
		const window = { since: new Date(now.getTime() - (2 * everyMs + 15 * 60_000)), until: now }
		// Probe candidates: old enough (1h) that a webhook had time to arrive, not so old (MAX_AGE_DAYS)
		// the sweep should keep looking.
		const probeOlderThan = new Date(now.getTime() - 60 * 60_000)
		const probeNewerThan = new Date(now.getTime() - ProductConfig.env.BILLING_WINDOW_RECONCILE_MAX_AGE_DAYS * 24 * 60 * 60_000)

		await forEachWithConcurrency(ALL_SOURCES, WindowReconcileJob.SWEEP_CONCURRENCY, async source => {
			const result = await tryCatchAsync(() => this.reconcileSource(source, window, probeOlderThan, probeNewerThan))
			if (!result.success) {
				// One source's failed collect must not starve the rest of the sweep (AC-8).
				this.loggingService.warn({
					content: { message: 'WindowReconcileJob failed to collect from source', source, error: result.error.message },
				})
			}
		})
	}

	private async reconcileSource(
		source: BillingWebhookSource,
		window: { since: Date; until: Date },
		probeOlderThan: Date,
		probeNewerThan: Date,
	): Promise<void> {
		const eventSource = this.sourceFactory.get(source)
		if (!eventSource) {
			// no capability bound for this source (e.g. decommissioned platform) — camada 1 + alerta
			// cover it; make the skip visible instead of a silent continue (AC-3).
			this.loggingService.info({
				content: { message: 'WindowReconcileJob source skipped (unregistered)', source, skipped: 'unregistered' },
			})
			return
		}

		// WINDOW sources ignore openInvoices entirely — skip the candidates query for them (#7).
		const openInvoices = eventSource.requiresOpenInvoices
			? await this.invoiceRepository.listOpenForReconciliation({
					platform: PLATFORM_BY_SOURCE[source],
					olderThan: probeOlderThan,
					newerThan: probeNewerThan,
				})
			: []

		const { listed, events } = await eventSource.collectMissedEvents({ window, openInvoices })
		const accepted = await this.ingest.ingest(source, events)

		this.loggingService.info({
			content: { message: 'WindowReconcileJob source tick', source, listed, recognized: events.length, accepted },
		})
	}
}
