import { BoundedContext } from '@template/core-typescript'
import { ProductConfig } from '@shared/config'
import * as controllers from './controllers'
import middlewares from './middlewares'
import { INSTANCE_REGISTRY } from './registry'
import * as internalHandlers from './handlers/internal'
import * as externalHandlers from './handlers/external'
import {
	BillingClockJob,
	DunningRetryJob,
	ReconcilePendingChargesJob,
	RefundReconcileJob,
	ChargebackReconcileJob,
	WindowReconcileJob,
	ReconcileCheckoutSessionsJob,
} from './jobs'

// The billing HTTP surface: the webhook ingest (public — provider-signed) plus the owner-scoped
// subscription / invoice / payment-method / billing-profile command controllers. `middlewares` is
// the context-default chain (AuthAccountMiddleware); public endpoints opt out via `skipMiddlewares`
// and owner-scoped commands add `RequireOwner` per-controller.
//
// Recurring sweep jobs (W2b), each a CommandQueue command scheduled on its own cadence — hourly for
// the write-capable recovery sweeps (dunning retry, pending-charge + checkout-session reconcile),
// daily for the DETECT-AND-ALERT drift sweeps (refund/chargeback), and its own configured cadence
// for the camada-2 window sweep. Every cadence collapses to ~1min in BILLING_SANDBOX so the
// compressed period renewals get swept promptly.
const ctx = await BoundedContext.create({
	name: 'billing',
	controllers,
	middlewares,
	internalHandlers,
	externalHandlers,
	registry: INSTANCE_REGISTRY,
	jobs: [
		// The native BillingClockJob (period-close sweep → ExternalInvoiceIssuedEvent) is production's
		// renewal driver, ALWAYS on. Hourly in real mode, every 60s in sandbox so the compressed
		// BILLING_SANDBOX_PERIOD_MS renewals get swept promptly.
		{ handler: BillingClockJob, repeat: { every: ProductConfig.env.BILLING_SANDBOX ? 60_000 : 3_600_000 } },
		{ handler: DunningRetryJob, repeat: { every: ProductConfig.env.BILLING_SANDBOX ? 60_000 : 3_600_000 } },
		{ handler: ReconcilePendingChargesJob, repeat: { every: ProductConfig.env.BILLING_SANDBOX ? 60_000 : 3_600_000 } },
		{ handler: RefundReconcileJob, repeat: { every: ProductConfig.env.BILLING_SANDBOX ? 60_000 : 24 * 3_600_000 } },
		{ handler: ChargebackReconcileJob, repeat: { every: ProductConfig.env.BILLING_SANDBOX ? 60_000 : 24 * 3_600_000 } },
		{
			handler: WindowReconcileJob,
			repeat: { every: ProductConfig.env.BILLING_SANDBOX ? 120_000 : ProductConfig.env.BILLING_WINDOW_RECONCILE_EVERY_HOURS * 3_600_000 },
		},
		{ handler: ReconcileCheckoutSessionsJob, repeat: { every: ProductConfig.env.BILLING_SANDBOX ? 60_000 : 3_600_000 } },
	],
})

export default ctx.router
