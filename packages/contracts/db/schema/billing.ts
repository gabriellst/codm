import { text, timestamp, integer, bigint, boolean, jsonb, pgSchema, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
// Enum column types — single-sourced from the generated wire binding (type-only import: erased at
// compile, so no package cycle and nothing for drizzle-kit to resolve at runtime). The closed sets
// live in packages/contracts wire enums; they are NEVER re-mirrored here as string-literal unions.
import type {
	BillingPlatform,
	PaymentMethodType,
	PaymentMethodStatus,
	SubscriptionStatus,
	PlanName,
	ChargeStatus,
	DeclineReason,
	CreditNoteReason,
	CreditNoteStatus,
	DisputeStatus,
	CheckoutIntent,
	CheckoutSessionStatus,
	QuotaKey,
	Language,
} from '../../generated/typescript/src/wire/enums'

/**
 * `billing` — the native billing ledger schema (medscall@f04e8a0f port, W2a of the de-template
 * reorg). Aggregates own invariants; status/access are DERIVED at read time from immutable ledger
 * facts (SUCCEEDED charges + credit notes) — no load-bearing read trusts a stored status column.
 *
 * The previous contents of this file (external-engine placeholder (decision D4): `subscriptions` +
 * `subscription_events`) were REMOVED by decision D4 (.plans/2026-07-20-detemplate-reorg.md) in
 * migration 0056; the native `billing_*` tables below replace them.
 *
 * Enum-valued columns use `text().$type<Enum>()` (never pgEnum) — the repo-wide convention. The enum
 * TYPES are single-sourced from the generated wire binding via the type-only import above (erased at
 * compile, so no package cycle and nothing for drizzle-kit to resolve). They are NEVER re-mirrored
 * here as string-literal unions — the enum-placement rail (CMPL-01) enforces this.
 */
export const billingSchema = pgSchema('billing')

// mirrors billing/objects/InvoiceLine (jsonb round-trip: dates written as Date serialize to ISO
// strings; the entity schema re-coerces on read — hence `Date | string` on the period fields).
type InvoiceLine = {
	kind: 'SUBSCRIPTION' | 'PRORATION' | 'OVERAGE' | 'ADJUSTMENT'
	description: string
	amountCents: number
	/** mirrors src/shared/enums/QuotaKey (product plug) */
	meter?: string
	quantity?: number
	periodStart?: Date | string
	periodEnd?: Date | string
}

// billing_payment_methods — single-table projection of the PaymentInstrument discriminated union.
export const paymentMethod = billingSchema.table(
	'billing_payment_methods',
	{
		// BaseEntity fields
		id: text('id').primaryKey(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		version: integer('version').default(1).notNull(),

		// Aggregate fields — cross-context IDs stored as plain text (no FK)
		ownerId: text('owner_id').notNull(),
		platform: text('platform').$type<BillingPlatform>().notNull(),

		// PaymentInstrument union (type = discriminator; per-leaf columns nullable, populated per type)
		type: text('type').$type<PaymentMethodType>().notNull(),
		pmRef: text('pm_ref').notNull(),
		supportsOffSession: boolean('supports_off_session').notNull(),
		captureOrigin: text('capture_origin'), // 'checkout-payment' | 'checkout-setup' | null (legacy)
		originGatewayTxId: text('origin_gateway_tx_id'), // checkout CIT tx — MIT chain reference
		brand: text('brand'), // CARD leaf
		last4: text('last4'), // CARD + wallet leaves
		expMonth: integer('exp_month'), // CARD leaf
		expYear: integer('exp_year'), // CARD leaf
		network: text('network'), // wallet leaves

		// Mandate VO + status
		mandateAcceptedAt: timestamp('mandate_accepted_at', { withTimezone: true }).notNull(),
		mandateIp: text('mandate_ip'), // audit/compliance, nullable
		mandateUserAgent: text('mandate_user_agent'), // audit/compliance, nullable
		mandateConsentVersion: text('mandate_consent_version'), // audit/compliance, nullable
		status: text('status').$type<PaymentMethodStatus>().notNull(),
		isDefault: boolean('is_default').notNull().default(false),
	},
	table => [
		// Exactly one DEFAULT among the owner's ACTIVE instruments (wallet model).
		uniqueIndex('billing_payment_methods_default_owner_idx')
			.on(table.ownerId)
			.where(sql`${table.isDefault} AND ${table.status} = 'ACTIVE'`),
	],
)

// billing_charges — thin record of each MIT charge attempt against an invoice.
export const charge = billingSchema.table('billing_charges', {
	// BaseEntity fields
	id: text('id').primaryKey(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
	version: integer('version').default(1).notNull(),

	// Aggregate fields — cross-context IDs stored as plain text (no FK)
	ownerId: text('owner_id').notNull(),
	invoiceId: text('invoice_id').notNull(),
	platform: text('platform').$type<BillingPlatform>().notNull(),
	method: text('method').$type<PaymentMethodType>().notNull(),
	amountCents: integer('amount_cents').notNull(),
	attemptNo: integer('attempt_no').notNull(),
	status: text('status').$type<ChargeStatus>().notNull(),
	gatewayTxId: text('gateway_tx_id'), // set once the gateway confirms the attempt
	declineCode: text('decline_code').$type<DeclineReason>(), // decline reason (FAILED only)
})

// billing_disputes — the PROCESS of a chargeback (open→won|lost); the money stays on the
// CHARGEBACK credit note. `gatewayDisputeRef` is the natural key: the gateway's real dispute id
// where it exists (Stripe `dp_…`), else a synthetic `evt:{externalId}` key derived from the
// webhook event — unique per (ref, platform).
export const dispute = billingSchema.table(
	'billing_disputes',
	{
		// BaseEntity fields
		id: text('id').primaryKey(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		version: integer('version').default(1).notNull(),

		// Aggregate fields — cross-context ids stored as plain text (no FK)
		gatewayDisputeRef: text('gateway_dispute_ref').notNull(),
		platform: text('platform').$type<BillingPlatform>().notNull(),
		ownerId: text('owner_id').notNull(),
		gatewayTxId: text('gateway_tx_id').notNull(),
		invoiceId: text('invoice_id').notNull(),
		amountCents: integer('amount_cents').notNull(),
		status: text('status').$type<DisputeStatus>().notNull(),
		openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
		// Nullable — only set once the dispute closes (won or lost).
		closedAt: timestamp('closed_at', { withTimezone: true }),
	},
	table => [
		uniqueIndex('billing_disputes_ref_platform_idx').on(table.gatewayDisputeRef, table.platform),
		index('billing_disputes_invoice_id_idx').on(table.invoiceId),
	],
)

// billing_subscriptions — OUR owned subscription record; access is DERIVED from it
// (paid-through + cancellation facts), never a stored engine copy. PK is `owner_id` — the
// natural key: one subscription per owner, forever (re-subscribing mutates the same row).
export const subscription = billingSchema.table('billing_subscriptions', {
	ownerId: text('owner_id').primaryKey(),
	engineSubscriptionId: text('engine_subscription_id').notNull(),
	planName: text('plan_name').$type<PlanName>().notNull(),
	status: text('status').$type<SubscriptionStatus>().notNull(),
	currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
	// Open-period anchor (derived access): the start of the currently-open period.
	currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
	// Trial anchor (native clock): when a TRIALING subscription is first due for renewal.
	trialEnd: timestamp('trial_end', { withTimezone: true }),
	// Cancellation facts: `canceledAt` is set when a cancellation takes effect;
	// `cancelAtPeriodEnd` flags a cancellation scheduled for the current period's end.
	canceledAt: timestamp('canceled_at', { withTimezone: true }),
	cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false).notNull(),
	// Scheduled paid→paid downgrade: the plan to switch to at the next renewal.
	// Null = no scheduled change. Applied + cleared by the billing clock at the period turn.
	scheduledPlanName: text('scheduled_plan_name').$type<PlanName>(),
	// Optimistic-concurrency counter (mirrors charge/payment_method). EVERY writer bumps it — the
	// version-guarded `save` (find→mutate→save) AND the targeted conditional updates
	// (activate/markPastDue/cancel/finalizeCancellation/changePlan/setScheduledPlan) — so a stale
	// find→save detects a concurrent write and 409s instead of clobbering the newer row wholesale.
	version: integer('version').default(1).notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
})

// billing_invoices — LEDGER — write-once; never truncate.
// OUR owned invoice record — the append-only ledger; status is DERIVED from facts
// (SUCCEEDED charges + credit notes) via InvoiceStatusDeriver, never stored.
export const invoice = billingSchema.table('billing_invoices', {
	invoiceId: text('invoice_id').primaryKey(),
	ownerId: text('owner_id').notNull(),
	number: text('number'),
	pdfUrl: text('pdf_url'),
	amountCents: integer('amount_cents').notNull(),
	currency: text('currency').notNull(),
	description: text('description'),
	dueDate: timestamp('due_date', { withTimezone: true }),
	// `ourNumber` is the authoritative, gap-free document number.
	ourNumber: text('our_number').unique().notNull(),
	planName: text('plan_name'),
	periodStart: timestamp('period_start', { withTimezone: true }),
	periodEnd: timestamp('period_end', { withTimezone: true }),
	// Set ONCE when a never-collected draft is superseded (re-subscribe with another plan) — an
	// append-once fact, not a status flip; the deriver reads it as VOID unless money ever moved.
	voidedAt: timestamp('voided_at', { withTimezone: true }),
	lineItems: jsonb('line_items').$type<InvoiceLine[]>().notNull().default(sql`'[]'::jsonb`),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
})

// billing_invoice_sequences — gap-free per-prefix number allocator for `our_number`.
export const invoiceSequence = billingSchema.table('billing_invoice_sequences', {
	prefix: text('prefix').primaryKey(),
	nextNumber: bigint('next_number', { mode: 'number' }).notNull(),
})

// billing_credit_notes — append-only credit notes issued against an invoice.
export const creditNote = billingSchema.table('billing_credit_notes', {
	id: text('id').primaryKey(),
	ownerId: text('owner_id').notNull(),
	number: text('number').notNull().unique(),
	invoiceId: text('invoice_id')
		.notNull()
		.references(() => invoice.invoiceId),
	amountCents: integer('amount_cents').notNull(), // positive, credit semantics
	currency: text('currency').notNull(),
	reason: text('reason').$type<CreditNoteReason>().notNull(),
	status: text('status').$type<CreditNoteStatus>().notNull(),
	gatewayRef: text('gateway_ref'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	finalizedAt: timestamp('finalized_at', { withTimezone: true }),
	version: integer('version').default(1).notNull(),
})

// billing_checkout_sessions — local record of a hosted-checkout session minted at a gateway
// (the accelerator's object of record). `sessionRef` is the gateway's own session/order id (Stripe
// `cs_...`) — the SAME natural key the `CHECKOUT_VAULT` idempotency claim already uses on the real
// webhook, unique here so a mint can never record the same session twice.
export const checkoutSession = billingSchema.table(
	'billing_checkout_sessions',
	{
		// BaseEntity fields
		id: text('id').primaryKey(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		version: integer('version').default(1).notNull(),

		// Aggregate fields — cross-context id stored as plain text (no FK)
		ownerId: text('owner_id').notNull(),
		sessionRef: text('session_ref').notNull(),
		platform: text('platform').$type<BillingPlatform>().notNull(),
		intent: text('intent').$type<CheckoutIntent>().notNull(),
		// Nullable — a SETUP-intent session (vaulting a card) has no invoice.
		engineInvoiceId: text('engine_invoice_id'),
		status: text('status').$type<CheckoutSessionStatus>().notNull(),
		mintedAt: timestamp('minted_at', { withTimezone: true }).notNull(),
		// Nullable — not every gateway response carries an expiry.
		expiresAt: timestamp('expires_at', { withTimezone: true }),
	},
	table => [uniqueIndex('billing_checkout_sessions_session_ref_idx').on(table.sessionRef)],
)

// billing_usage_rollups — per-owner/meter/period usage rollup. Created empty here; populated by a
// later metering task. The UNIQUE (owner_id, meter, period_start) keeps one rollup per
// owner+meter+period.
export const usageRollup = billingSchema.table(
	'billing_usage_rollups',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id').notNull(),
		meter: text('meter').$type<QuotaKey>().notNull(),
		periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
		periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
		quantity: integer('quantity').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	},
	table => [uniqueIndex('billing_usage_rollups_owner_meter_period_uq').on(table.ownerId, table.meter, table.periodStart)],
)

// billing_profiles — billing's own customer identity: the snapshots taken at onboarding
// (name/email/document from the responsible user; `name` is the generic owner display name) + the
// account's billing language (drives hosted-checkout locale, dunning emails, stored invoice
// descriptions). Deliberate copies with a policy: editable by the responsible user; issued invoices
// never change retroactively.
export const billingProfile = billingSchema.table('billing_profiles', {
	ownerId: text('owner_id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
	document: text('document').notNull(),
	language: text('language').$type<Language>().notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
	version: integer('version').default(1).notNull(),
})
