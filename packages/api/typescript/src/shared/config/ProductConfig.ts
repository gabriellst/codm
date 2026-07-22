import { z } from 'zod'

/**
 * Product env seam — the product-specific analog of the kernel `Config`
 * (`@template/core-typescript` → `core/src/utils/Config.ts`), mirroring medscall's decision to keep
 * the product Config in `src/shared` (medscall@f04e8a0f `packages/api/src/shared/utils/Config.ts`).
 *
 * The kernel Config holds ONLY generic, product-agnostic env (DB/Redis/OTEL/PORT, generic secrets,
 * GO_* worker topology, credential-vault key). Everything whose existence is dictated by THIS
 * product's third-party integrations — payment-provider / marketing / store-integration OAuth
 * credentials — lives here so a fresh product can drop this seam and author its own without
 * touching the kernel. Rule of thumb: would a brand-new product still need this var? Yes → kernel;
 * no → here.
 *
 * Same shape as the kernel Config: a raw field-level Zod schema parsed once against `process.env`,
 * surfaced as `ProductConfig.env.X`. Defaults/coercion reproduce exactly what these vars had while
 * they lived in the kernel Config, so `ProductConfig.env` keeps identical types for identical
 * inputs. No cross-field derived defaults and no production secrets guard exist for these today
 * (they were plain `.optional()` / `.default('')` in the kernel), so there is no `.transform()` /
 * `.superRefine()` — add one here (not in the kernel) if a product integration later needs it.
 *
 * ref: medscall@f04e8a0f (product Config in src/shared); relocated from the kernel Config by W0-3.
 */
const ProductEnvSchema = z.object({
	// Product display name — the ONE brand string billing's server-rendered copy interpolates
	// (@billing/i18n: hosted-checkout line items + dunning email). Neutral default so a fresh
	// product renders without a brand until it sets this; the port carries NO hard-coded brand.
	PRODUCT_NAME: z.string().default('Your Product'),
	// Optional checkout branding image (hosted-checkout line item) — empty renders no image.
	BILLING_CHECKOUT_IMAGE_URL: z.string().default(''),
	// Billing dunning grace window (days past `paidThrough` during which access is retained while
	// the failed renewal is retried). Consumed by `SubscriptionAccessDeriver` (billing context).
	// Default mirrors medscall@f04e8a0f (3 days).
	BILLING_DUNNING_GRACE_DAYS: z.coerce.number().int().nonnegative().default(3),
	// ── Payment-gateway credentials (16 per-gateway keys) — the secrets each adapter/verifier
	// reads when bound in `real`. All `.default('')` (no values shipped): a product fills the ones
	// for the gateways it actually wires. Mirrors medscall@f04e8a0f (product Config in src/shared).
	// Pagar.me — API key (charges/orders) + webhook Basic-auth creds (PagarMeWebhookVerifier).
	PAGARME_API_KEY: z.string().default(''),
	PAGARME_WEBHOOK_USER: z.string().default(''),
	PAGARME_WEBHOOK_PASSWORD: z.string().default(''),
	// Stripe — secret key + publishable key + webhook signing secret (StripeWebhookVerifier).
	STRIPE_API_KEY: z.string().default(''),
	STRIPE_WEBHOOK_SECRET: z.string().default(''),
	// Asaas — API key + webhook token (AsaasWebhookVerifier). ASAAS_BASE_URL defaults to production;
	// point it at the sandbox host (https://api-sandbox.asaas.com/v3) to test with a free key.
	ASAAS_API_KEY: z.string().default(''),
	ASAAS_WEBHOOK_TOKEN: z.string().default(''),
	ASAAS_BASE_URL: z.string().default('https://api.asaas.com/v3'),
	// Mercado Pago — access token + webhook secret (MercadoPagoWebhookVerifier).
	MERCADOPAGO_ACCESS_TOKEN: z.string().default(''),
	MERCADOPAGO_WEBHOOK_SECRET: z.string().default(''),
	// PagBank — API token (also the webhook auth token; PagBankWebhookVerifier).
	PAGBANK_API_TOKEN: z.string().default(''),
	// The gateway for NEW payment relationships. Existing instruments/charges stay pinned to their
	// stored platform. 'PAGARME' | 'STRIPE' | 'ASAAS' | 'MERCADOPAGO' | 'PAGBANK'.
	BILLING_DEFAULT_GATEWAY: z.string().default('PAGARME'),
	// Route a specific method to a gateway that supports it — e.g. cards on STRIPE but Pix on a
	// gateway with Pix enabled. Empty → falls back to BILLING_DEFAULT_GATEWAY.
	BILLING_GATEWAY_PIX: z.string().default(''),
	BILLING_GATEWAY_CARD: z.string().default(''),
	// Billing sandbox mode (dev-only): binds SandboxPaymentProvider (fake money, real choreography)
	// instead of a networked gateway. `assertRequiredSecrets` rejects it in production.
	BILLING_SANDBOX: z.preprocess(v => v === 'true', z.boolean()),
	// ── Billing pipeline tunables (W2b-PIPE) — the saga / dunning / reconciliation knobs.
	// Defaults reproduce medscall@f04e8a0f (packages/api/src/shared/utils/Config.ts) exactly.
	// Absolute public URL of the brand/product image shown on the hosted checkout's line item
	// (Stripe product_data.images). Optional — absent, the checkout renders without an image.
	// Sandbox-only compressed billing period (BILLING_SANDBOX=true): a "monthly" cycle collapses to
	// this many ms from its anchor, so subscriptions become renewal-due within a minute. Ignored in
	// real mode (real month math).
	BILLING_SANDBOX_PERIOD_MS: z.coerce.number().default(60_000),
	// Dunning smart-retry: offsets (days) of the re-attempts anchored to the 1st failure; max total
	// attempts (1st + retries). See DunningRetryPolicy.
	BILLING_DUNNING_RETRY_OFFSETS_DAYS: z
		.string()
		.default('2,4,7')
		.transform(v => v.split(',').map(Number)),
	BILLING_DUNNING_MAX_ATTEMPTS: z.coerce.number().default(4),
	// Dunning WINDOW (days, anchored on the FIRST failure): once elapsed with the invoice still
	// unpaid, DunningRetryJob cancels the subscription + emits DunningFailedEvent (terminal branch).
	BILLING_DUNNING_WINDOW_DAYS: z.coerce.number().default(8),
	// User-facing refund (RequestRefund → RefundPolicy): within this many days of the payment date
	// the consumer is owed a FULL refund of what's left uncredited (BR CDC art. 49 right of
	// withdrawal). Past the window, only the unused slice of the period is refundable (pro-rata).
	BILLING_WITHDRAWAL_WINDOW_DAYS: z.coerce.number().default(7),
	// Reconciliation sweep (ReconcilePendingChargesJob): a PENDING charge older than this many
	// minutes is stale enough to ask the gateway about (its settlement webhook was likely dropped).
	BILLING_PENDING_RECONCILE_AFTER_MINUTES: z.coerce.number().default(30),
	// Reconciliation sweep (ReconcilePendingChargesJob): a charge the gateway STILL reports as
	// `pending` past this many hours is a stuck async settlement — alert operators once.
	BILLING_PENDING_RECONCILE_MAX_AGE_HOURS: z.coerce.number().default(12),
	// Reconciliation sweep (CheckoutSessionReconciler alarm + ReconcileCheckoutSessionsJob): a
	// PENDING CheckoutSession older than this many minutes is stale enough to ask the gateway about.
	BILLING_CHECKOUT_RECONCILE_AFTER_MINUTES: z.coerce.number().default(15),
	// Reconciliation sweep (ReconcileCheckoutSessionsJob): a CheckoutSession still PENDING past this
	// many hours on a platform without `getCheckoutSessionStatus` support (or whose poll keeps
	// failing) is stuck — alert operators once.
	BILLING_CHECKOUT_RECONCILE_MAX_AGE_HOURS: z.coerce.number().default(24),
	// Reconciliation sweep (RefundReconcileJob): a refund EXPECTATION the gateway still reports as
	// unconfirmed past this many hours is a likely dropped confirmation webhook — alert once.
	BILLING_REFUND_RECONCILE_MAX_AGE_HOURS: z.coerce.number().default(24),
	// Reconciliation sweep (RefundReconcileJob): the ENUMERATION band — every invoice with a
	// SUCCEEDED charge created within this many days is scanned for refund drift on every tick.
	BILLING_REFUND_DRIFT_SCAN_DAYS: z.coerce.number().default(90),
	// Reconciliation sweep (ChargebackReconcileJob): the ENUMERATION band — every invoice with a
	// SUCCEEDED charge created within this many days is scanned for chargeback drift (wider than the
	// refund band: chargebacks land months after the original charge, the card-dispute window).
	BILLING_CHARGEBACK_SCAN_DAYS: z.coerce.number().default(120),
	// Window-reconciliation sweep (WindowReconcileJob): cadence in hours between ticks. The sweep's
	// sliding window covers 2× this cadence + 15min so two consecutive ticks always overlap.
	BILLING_WINDOW_RECONCILE_EVERY_HOURS: z.coerce.number().default(6),
	// Window-reconciliation sweep (WindowReconcileJob): an open invoice older than this many days
	// stops being probed (the sweep gives up looking).
	BILLING_WINDOW_RECONCILE_MAX_AGE_DAYS: z.coerce.number().default(7),
	// HMAC-SHA1 secret over the raw webhook body (?signature= query). Comma-separate to allow
	// multiple keys (any match validates).
	// Provider-app OAuth credentials. Each is the platform's "your app" client_id /
	// client_secret pair from the provider's developer console. Empty in dev fails the
	// authorize flow at the provider; production must set them.
})

/** Structural parity export — compared against REPO.env (owners: ts-product | billing-gateway). */
export const PRODUCT_ENV_KEYS = Object.keys(ProductEnvSchema.shape)

export const ProductConfig = {
	env: ProductEnvSchema.parse(process.env),
} as const
