/**
 * Single shared registry of every dedup scope in the system (SCREAMING_SNAKE keys + values).
 *
 * This is the PRODUCT-owned vocabulary for the kernel's `IdempotencyGuard` (`@codm/core-typescript`):
 * the core ships the mechanism (`claim`/`release` on `shared.idempotency_keys`, typed over a plain
 * `string`), and a product plugs the scopes here. Add a value when a new exactly-once effect/webhook is
 * introduced — always here, never a per-context enum (the guard's whole point is one flat registry so
 * scopes can't collide silently across contexts).
 *
 * The two members below are GENERIC PLACEHOLDERS shipped with the template to demonstrate the two
 * archetypes; a real product replaces/extends them (e.g. billing adds `INVOICE_CHARGE`,
 * `INVOICE_SETTLED`; quota adds `QUOTA_OVERRIDE`). Ported from origin-fork@f04e8a0f
 * (`packages/api/src/shared/enums/IdempotencyScope.ts`), genericized down to the two examples.
 */
export enum IdempotencyScope {
	/** Inbound-webhook ingest dedup — claim by the provider's event id so a redelivered webhook is
	 *  processed exactly once (the archetype behind the origin fork's `WEBHOOK_*` family). */
	WEBHOOK_RECEIVED = 'WEBHOOK_RECEIVED',
	/** Exactly-once side-effect in the claim-commit-effect pattern — claim before an external effect
	 *  that runs outside the DB transaction, `release` on failure so a later redelivery can retry. */
	COMMAND_EFFECT = 'COMMAND_EFFECT',

	// ── Billing scopes (origin-fork@f04e8a0f port) ──
	// Inbound-webhook ingest dedup, one member per BillingWebhookSource — claim by the vendor's
	// event id so a redelivered webhook yields exactly one outbox event. DECOMMISSIONED sources
	// (GETNET/INFINITEPAY/REDE) keep their scope so historical dedup rows stay readable.
	WEBHOOK_PAGARME = 'WEBHOOK_PAGARME',
	WEBHOOK_STRIPE = 'WEBHOOK_STRIPE',
	WEBHOOK_ASAAS = 'WEBHOOK_ASAAS',
	WEBHOOK_GETNET = 'WEBHOOK_GETNET',
	WEBHOOK_MERCADOPAGO = 'WEBHOOK_MERCADOPAGO',
	WEBHOOK_PAGBANK = 'WEBHOOK_PAGBANK',
	WEBHOOK_INFINITEPAY = 'WEBHOOK_INFINITEPAY',
	WEBHOOK_REDE = 'WEBHOOK_REDE',
	/** One subscription-creating flow per owner at a time (CreateSubscription re-entrancy fence). */
	SUBSCRIPTION_PER_OWNER = 'SUBSCRIPTION_PER_OWNER',
	/** One gateway charge per (invoiceId, attemptNo) — claim-before / call-outside-tx / persist-after. */
	INVOICE_CHARGE = 'INVOICE_CHARGE',
	/** Exactly-once settlement per invoice — dedups card × Pix × engine × checkout signals. */
	INVOICE_SETTLED = 'INVOICE_SETTLED',
	/** Exactly-once failure handling per (invoice, attempt). */
	INVOICE_FAILED = 'INVOICE_FAILED',
	/** Engine invoice-event ingest dedup (issued/paid/failed from the engine stream). */
	INVOICE_EVENT = 'INVOICE_EVENT',
	/** Dunning side-effects (emails/notifications) per invoice+phase. */
	INVOICE_DUNNING = 'INVOICE_DUNNING',
	INVOICE_DUNNING_STARTED = 'INVOICE_DUNNING_STARTED',
	INVOICE_DUNNING_ATTEMPT = 'INVOICE_DUNNING_ATTEMPT',
	INVOICE_DUNNING_SUCCEEDED = 'INVOICE_DUNNING_SUCCEEDED',
	INVOICE_DUNNING_FAILED = 'INVOICE_DUNNING_FAILED',
	/** Checkout-completed vaulting — claim by the gateway sessionRef (shared by webhook + accelerator). */
	CHECKOUT_VAULT = 'CHECKOUT_VAULT',
	/** One stale-object operator alert per reconciled object (window sweep / drift detectors). */
	RECONCILE_STALE_ALERT = 'RECONCILE_STALE_ALERT',
	/** One unpollable-PENDING-charge operator alert per charge (ReconcilePendingChargesJob). */
	CHARGE_SETTLER_ALERT = 'CHARGE_SETTLER_ALERT',
	/** Refund-expectation marker dedup (RefundReconcileJob's poll set). */
	REFUND_EXPECTATION = 'REFUND_EXPECTATION',

	// ── Quota scopes (origin-fork@f04e8a0f port; owned by the quota BC — W2c) ──
	/** One quota override per idempotency key — the L-1 claim layer for ApplyQuotaOverride (paired
	 *  with the ledger's own UNIQUE(idem_key) belt). */
	QUOTA_OVERRIDE = 'QUOTA_OVERRIDE',
}
