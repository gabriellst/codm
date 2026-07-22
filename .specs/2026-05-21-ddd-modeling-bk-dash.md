# BK Dash — DDD Strategic Modeling

> **Status:** Forward-looking target architecture
> **Date:** 2026-05-21
> **Scope:** Full strategic design pipeline — requirements, event storming, bounded contexts, context mapping, TypeScript API specification
> **Revision:** v2 (Go-owned canonical writes; FeesConfiguration aggregate; deterministic IDs; Productivity dropped)

---

## Conventions

- Optional fields marked with `?`
- All IDs are `string` (UUID v7 for surrogate keys; UUIDv5 derived from `(platform, externalId)` for canonical entities — see "Deterministic IDs" design decision)
- Dates in ISO 8601 (always `string`, never `Date`)
- Monetary values always in cents (`amountCents`) — no floating point
- Per-currency aggregates use `MonetaryByCurrency = Partial<Record<CurrencyCode, number>>` — cents per currency code, summed and converted to the Store reporting currency at query time
- Error codes in `SCREAMING_SNAKE_CASE` represent domain invariants and policies
- Enum values in `SCREAMING_SNAKE_CASE`
- Domain events in `PascalCase` past participle
- Field names in `camelCase`
- "Platform" is the system-wide term for an external provider (Shopify, Meta, Stripe, Kiwify); the word "provider" is reserved for generic technical roles only (e.g., FX rate provider)

---

## 1. High-Level Requirements

### 1.1 Problem Overview

BK Dash is a unified commerce data layer and business-intelligence platform for multi-channel online merchants. Merchants connect their sales channels (Shopify, Nuvem Shop, CartPanda, Yampi, Kiwify), payment gateways (Stripe), and advertising accounts (Meta, Google Ads, TikTok). A dedicated Go sync service receives every provider webhook and polls every provider API, performs idempotent UPSERTs into Postgres canonical projections, and publishes outbox events to Kafka. The TypeScript API owns OAuth flows, credential storage, downstream side effects (cost reconciliation, daily-digest delivery, notification fan-out), and all merchant-facing queries. Merchants layer their own configuration on top — typed order overrides, per-variant cost rules, manual marketing expenses, tax profiles — and the system joins canonical + merchant data at query time, in the merchant's reporting currency. The system never mutates raw provider data; every monetary number can be traced back to either a provider payload or a merchant-owned aggregate.

### 1.2 Functional Requirements

**Identity & Onboarding**
- Sign up with email + password; capture pre-signup leads (event-only, no aggregate); convert lead → user on signup
- Sign in / sign out via BetterAuth-managed sessions
- Reset forgotten password through emailed token (BetterAuth-managed token lifecycle)
- Change password while signed in
- Register and unregister Firebase Cloud Messaging tokens for push delivery
- Update profile (name, picture)
- Update personal preferences (timezone, `dailyNotificationsEnabled`, `notificationCurrency`, `notificationCurrencyMode`) — held on a separate `UserPreferences` aggregate

**Store & Membership (Tenancy)**
- Create a Store (workspace) — gated by the User's available store credits (derived from active Subscription tier)
- Edit Store profile (name, picture, email, phone)
- Edit Store preferences on a separate aggregate (`reportingCurrency`, `timezone`, `showStoreNameInNotifications`, etc.) — `forcePaidOrders` is NOT stored as Store config; it is a chart/query parameter the merchant toggles per-view
- Invite users to a Store with a Role (`OWNER`, `ADMIN`, `MEMBER`); accept invitation; remove members; change member roles
- List all Stores the signed-in user belongs to, with `lastAccess`
- Disable a Store (soft-delete) and re-enable it

**Integration (Provider Connections)**
- Connect provider integrations in-code (no provider catalog read by the frontend) — the SDK exposes Zod schemas per provider; the merchant fills the form, the TS API drives the OAuth/credential flow
- TS API owns OAuth flows (authorize URL, code exchange, refresh) and persists encrypted credentials
- TS API HTTP-calls the Go sync engine to validate fresh credentials (handshake) — surfaces validation errors to the merchant directly
- Disconnect an integration; optionally wipe ingested data for that integration
- Trigger reintegration: TS calls Go HTTP with the integration's credentials to enqueue a full backfill
- Trigger reintegration for all integrations in a Store — emits a batch event the system fans out
- Toggle an integration active/inactive without disconnecting
- Consume `integration.progress_updated` events from Go to surface sync progress in the UI

**Sales Ingestion (Go-owned writes)**
- Go sync engine receives provider webhooks (Shopify, Nuvem Shop, CartPanda, Yampi) and polls provider APIs
- Go UPSERTs Order canonical projections in Postgres, keyed by deterministic ID `UUIDv5(platform, externalId)`
- Go publishes `OrderUpdated` integration events via Kafka outbox (TS subscribes for downstream side effects: ProductCost reconciliation, notification fan-out)
- Customer is NOT a separate aggregate — customer data is embedded directly on the Order (email, name, shipping/billing snapshot)
- Abandoned Carts ingested from CHECKOUT-class integrations; linked to Orders when a matching `cartToken` arrives later
- OrderTransactions carry a typed `fees[]` array (`type`, `rate`, `fixed`, `variable`)
- Support manually-created orders (merchant entered via BK Dash UI OR via the provider's own admin) — Order carries `isDraft` and `isManual` flags

**Catalog Ingestion (Go-owned writes)**
- Go ingests Products and ProductVariants from every connected SALES_CHANNEL
- Persists canonical Product and Variant rows keyed by deterministic ID `UUIDv5(platform, externalId)`
- Records provider-side metadata: title, handle, description, picture, status, collection name, tags

**Marketing Ingestion (Go-owned writes)**
- Go ingests Campaigns, AdSets, Ads, and AdSpend (daily and hourly granularities) from every connected MARKETING_PLATFORM
- Unified `AdSpend` aggregate covers both provider-synced spend and merchant-entered manual spend, discriminated by `adSpendType: "AUTOMATIC" | "MANUAL"`
- Marketing reconciliation runs on Go's hourly schedule AND is additionally triggered when a merchant queries the dashboard (debounced per integration to prevent thundering herd)

**Tracking (Go-owned writes)**
- Go receives PixelEvents from storefronts (Shopify Pixel API) for the full funnel: `PAGE_VIEWED`, `PRODUCT_VIEWED`, `PRODUCT_ADDED_TO_CART`, `PRODUCT_REMOVED_FROM_CART`, `CART_VIEWED`, `CHECKOUT_STARTED`, `CHECKOUT_CONTACT_INFO_SUBMITTED`, `CHECKOUT_COMPLETED`
- Go persists PixelEvents (append-only) and publishes `PixelEventRecorded`
- TS API exposes the pixel script snippet that merchants embed in their storefronts

**Merchant Overrides (Sales)**
- One unified `UpdateOrderOverride` command accepts a partial payload of typed override fields: `paymentMethod`, `paymentStatus`, `revenue`, `productCost` (per line item), `shipping`, `fees`, `taxes`
- OrderOverride is pinned by `(orderId, storeIntegrationExternalId)` — survives Order re-ingest

**Cost Configuration (Catalog)**
- Configure ProductCost rules scoped to a Variant × StoreIntegration: each rule carries currency, country, date range, quantity threshold (`EQ`, `GT`, `GTE`, `LT`, `LTE`), unit cost, and shipping cost
- Support kit costs (multiple variants priced together) and tiered costs (different price at different quantities)
- Import/export ProductCost rules via CSV

**Marketing Configuration**
- Bind a Campaign to one or more Products/Variants so spend can be attributed at query time
- Record ManualMarketingExpense (via the unified AdSpend command with `adSpendType: "MANUAL"`)

**Financial Configuration (Finance)**
- `Taxes` aggregate (per Store): `revenueTaxType` (`NONE` | `PRESUMED_PROFIT` | `REAL_PROFIT`), `revenueTaxDeductionType` (`NONE` | `PRODUCT_COST` | `PRODUCT_COST_AND_MARKETING`), `revenueTaxRate`, `revenueTaxMultiplier`, `marketingTaxRatePerPlatform` (per-platform JSONB map), with `startDate` / `endDate?` for time-effective rule history
- `FeesConfiguration` aggregate (per Store): a single parent that owns typed child collections — `gatewayFees[]` (per platform × payment method), `checkoutFees[]` (per checkout platform), `shippingFee` (single, with type + value), each with `startDate` / `endDate?`
- `WarrantyReserve` aggregate: percentage of revenue reserved over a date range
- `OperationalCost` aggregate: category (typed enum — `EMPLOYEE`, `APP`, `FOOD`, `RENT`, `ACCOUNTANT`, `REFUND`, `SHIPPING`, `TAKE_PROFIT`, `OTHER`), description, amount, currency, recurrency (`ONCE`, `DAILY`, `WEEKLY`, `MONTHLY`, `BIMESTER`, `TRIMESTER`, `SEMESTER`, `YEARLY`, `NONE`), startDate, endDate?, payment-status entries

**FX Management (Finance)**
- Capture FxRates from external currency-rate APIs hourly
- Each `FxRate` carries `startDate` (effective from) — append-only; rates never overwrite
- Resolve the FX rate effective on any historical date for any currency pair
- All monetary values stored in their native currency — conversion happens at query time only

**Analytics (BI)**
- Queries served directly from canonical tables (no materialized read models in scope)
- Charts endpoint: single controller, discriminated by `chartType` query param (`REVENUE`, `REVENUE_PER_SHIFT`, `SALES_PER_WEEKDAY`, `SALES_PER_HOUR`, `SALES_PER_REGION`); discriminated-union response
- Frequency parameter: `HOURLY`, `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`
- Multistore queries: every analytics endpoint accepts `storeIds: string[]` so the merchant can view consolidated metrics across their Stores in one request
- Per-currency aggregation: intermediate values held as `MonetaryByCurrency` (e.g. `{ "BRL": 12999, "USD": -250 }`); converted to the Store reporting currency at the end using date-effective FxRate
- `forcePaidOrders` is a chart query param — when `true`, every UNPAID order is treated as PAID for the purposes of the requested view
- Goals: REVENUE or PROFIT target for a date range; duplicate previous; progress tracking against the active Goal
- Admin reporting endpoints gated by `x-admin-secret` header

**Notifications**
- Send in-app/push notifications to a Store (broadcast) or to specific users
- Generate daily digest notifications: aggregated metrics in the user's notification currency
- Gate daily digest delivery on per-user `dailyNotificationsEnabled`; admin escape hatch ignores the flag
- Deduplicate identical notifications within a 15-minute window per recipient
- Deliver via Firebase Cloud Messaging (APNs/FCM) and email

**Billing (BK Dash SaaS)**
- `PlanTier` is an enum (`BASIC`, `INTERMEDIATE`, `ADVANCED`, `UNLIMITED`); `PlanFeature` is an enum of capabilities (`STORE_AMOUNT`, ...); the quota matrix `(tier × feature) → number | "UNLIMITED"` is a code constant — there is **no** persisted Plan aggregate
- The `Subscription` aggregate holds `{ tier, externalId, expirationDate, ... }` only — lifecycle flags (`active`, `cancelled`) are derived from the latest received webhook event, not stored as aggregate state
- `SubscriptionPayment` is NOT an aggregate — payments are derived from the persisted event stream
- Billing-platform webhook receiver (Kiwify and others) lands on the **TS API** (not on Go) — sync webhooks go to Go; subscription webhooks stay with TS
- `ChangeExternalSubscription` flow: when a merchant changes plan on Kiwify, the platform sends a webhook with the new `externalSubscriptionId` (carrying the internal `subscriptionId` in the `s1` UTM payload); the TS API updates `Subscription.externalId` and resets `expirationDate`
- Enforce the StoreAmount quota at `CreateStore` time

### 1.3 Non-Functional Requirements

- **Multi-tenancy** — `storeId` is the tenant boundary. Every domain aggregate carries it; every query is scoped by it. The one exception is Identity-only aggregates (User, UserPreferences, FcmRegistrationToken) which are scoped to `userId` only.
- **Multi-currency** — every monetary value is stored in its native currency as `MonetaryAmount { amountCents, currency }`. FX conversion happens only at query time. Intermediate analytics aggregates use `MonetaryByCurrency = Partial<Record<CurrencyCode, number>>` to preserve per-currency breakdowns (which can be negative — e.g., a cost deduction). Final conversion to the Store `reportingCurrency` uses the `FxRate` projection keyed by the relevant transaction date. Raw provider data is never mutated.
- **Multistore queries** — every analytics / list endpoint accepts a `storeIds: string[]` parameter (subset of the user's StoreMemberships). Responses aggregate across the requested set.
- **Deterministic IDs** — every canonical entity ingested from a provider has its primary key derived as `UUIDv5(namespace, "${platform}:${externalId}")`. Re-ingesting the same entity from the same platform always resolves to the same row. Merchant-owned aggregates (overrides, costs, manual entries, goals, preferences) use UUIDv7 surrogate keys.
- **Idempotent ingest** — Go's UPSERTs are the only writes to canonical projections. Composite or deterministic key collisions are silently no-op'd when no field actually changed; `*Updated` events are emitted only when a real change occurred.
- **Replayability / audit** — raw provider payloads are retained at the Go side alongside the canonical projection so any ingest event can be replayed to reconstruct state or debug a mapper bug.
- **Override stability** — `OrderOverride` is pinned by `(orderId, storeIntegrationExternalId)`. Re-ingest of the same Order keeps the override attached.
- **Extensibility** — provider integrations are pluggable. Adding a new SalesPlatform means: writing a Go-side webhook mapper + polling client, adding the platform to the `SalesPlatform` enum in the TS SDK, adding a Zod credential schema. Domain code does not change.
- **Sync engine separation** — provider I/O (webhooks, polling, OAuth callbacks for VENDOR side, credential validation handshake) lives in the Go sync engine. The TypeScript API owns OAuth flow orchestration, credential storage, downstream side effects, all merchant-facing queries, and subscription-billing webhooks (Kiwify, etc.). Inter-service contracts: Kafka for outbox events (Go → TS), HTTP for command-style calls (TS → Go, e.g., reintegrate-with-credentials, validate-handshake, marketing-reconcile-on-demand).
- **Eventual consistency** — canonical projections are eventually consistent w.r.t. provider state. The Store dashboard reflects ingest progress via `integration.progress_updated` Kafka events surfaced to the UI.
- **Authentication** — BetterAuth (`@better-auth/core`) issues sessions; the spec does not model `RefreshToken` / `PasswordResetToken` aggregates because BetterAuth owns them.
- **Authorization** — every authenticated request resolves a `(userId, storeId, role)` context. Endpoint permissions are role-gated (`OWNER`, `ADMIN`, `MEMBER`).
- **Observability** — OpenTelemetry traces, structured JSON logs, Grafana dashboards (`lgtm` stack via Docker Compose locally).
- **Data residency / LGPD** — designed for Brazilian merchants; honors right to data export and erasure.
- **Persistence** — PostgreSQL only. Both Go and TS write to the same database (TS owns the migrations + Drizzle schema definitions; Go reads/writes via sqlc-generated queries). MongoDB is not part of the target architecture.
- **Internationalization** — error codes are machine-readable; translations are applied frontend-side. Notification copy is localized per the User's locale.

---

## 2. Brainstorming — Event Storming

### 2.1 Legend

| Symbol | Meaning |
|---|---|
| 🟧 | Domain Event (something that happened) |
| 🟦 | Command (something someone wants to happen) |
| 🟨 | Aggregate (cluster of objects treated as a unit) |
| 🟪 | Policy (when X happens, do Y) |
| 🟩 | Read Model (data shaped for a screen) |
| 🟥 | Hot Spot (open question, risk, conflict) |
| 👤 | Actor (human or external system) |

### 2.2 Main Flow — Domain Events Timeline

```
═══════════════════════════════════════════════════════════════════
 ONBOARDING — Identity, Tenancy, First Connection
═══════════════════════════════════════════════════════════════════

👤 Visitor
  🟦 SignUp
    🟨 User
      🟧 UserRegistered { userId, leadEmail? }
        🟪 Policy: if a Lead event was previously captured for this email, mark conversion
        🟪 Policy: NO auto-provisioning of a Store — the user must explicitly create one
                   (gated by Subscription quota, see Billing below)

[Lead capture lives only as an event — no aggregate]
👤 Visitor
  🟦 CaptureLead
    🟧 LeadCaptured { email, capturedAt, phoneNumber?, name? }
      🟪 Policy: trigger onboarding email sequence

👤 User
  🟦 SignIn (via BetterAuth)
    🟧 UserSignedIn { userId, signedInAt }
      🟪 Policy: refresh last-access on every active StoreMembership

👤 User
  🟦 UpdateUserPreferences { dailyNotificationsEnabled?, notificationCurrency?, notificationCurrencyMode? }
    🟨 UserPreferences (separate aggregate from User)
      🟧 UserPreferencesUpdated { userId, changedFields }
        🟪 Policy: Notifications BC re-caches preferences for the daily-digest scheduler

👤 User
  🟦 CreateStore { name, reportingCurrency, timezone }
    🟪 Policy (PRE): check user has store credits remaining for current Subscription tier
                     (Billing.PlanQuotas[tier].STORE_AMOUNT vs already-created Stores)
      🟥 Hot Spot: STORE_QUOTA_EXCEEDED error if not
    🟨 Store
      🟧 StoreCreated { storeId, name, reportingCurrency }
      🟧 StoreMemberAdded { storeId, userId, role: "OWNER" }
      🟧 StorePreferencesCreated { storeId } (default StorePreferences sibling aggregate)

👤 User
  🟦 UpdateStorePreferences { timezone?, showStoreNameInNotifications?, ... }
    🟨 StorePreferences (sibling of Store)
      🟧 StorePreferencesUpdated { storeId, changedFields }

👤 User
  🟦 InviteMember
    🟨 Store
      🟧 StoreMemberInvited
        🟪 Policy: Notifications BC sends the invitation email

👤 Invitee
  🟦 AcceptInvitation
    🟨 Store
      🟧 StoreMemberAdded

═══════════════════════════════════════════════════════════════════
 INTEGRATION — Connect, Handshake, Reintegrate (TS owns OAuth)
═══════════════════════════════════════════════════════════════════

👤 User
  🟦 ConnectIntegration { type, platform, oauthCode | credentialFields, displayName? }
    🟨 StoreIntegration                              [TS API]
      🟧 IntegrationConnectionInitiated { storeIntegrationId, type, platform }
        🟪 Policy: TS exchanges OAuth code → tokens (TS owns this flow)
        🟪 Policy: TS encrypts and persists credentials to IntegrationCredentialSecret
        🟪 Policy: TS HTTP-calls go-worker `/integrations/handshake { credentials }` to validate scope
          🟧 IntegrationHandshakeSucceeded { storeIntegrationId, externalId, handshakeAt }
            🟪 Policy: Set StoreIntegration { active: true, valid: true, externalId }
            🟪 Policy: Publish `shared.IntegrationActivated` → go-worker begins polling + accepts webhooks
          🟧 IntegrationHandshakeFailed { storeIntegrationId, reason }
            🟪 Policy: Set StoreIntegration { active: false, valid: false }
            🟥 Hot Spot: surface to UI immediately (don't bury in async logs)

👤 User
  🟦 DisconnectIntegration { storeIntegrationId, wipeData }
    🟨 StoreIntegration
      🟧 IntegrationDisconnected { storeIntegrationId, wipeData, disconnectedAt }
        🟪 Policy: TS publishes `shared.IntegrationDeactivated` → go-worker stops polling
        🟪 Policy (if wipeData = true): emit StoreIntegrationDataWipeRequested
                                         → cascade-delete canonical rows across Sales / Catalog / Marketing / Tracking
                                         → merchant-owned rows (overrides, costs, manual entries) preserved

👤 User / Scheduler
  🟦 TriggerReintegration { storeIntegrationId }
    🟪 Policy (PRE): rate-limit per integration (1 / 5 min)
    🟧 ReintegrationTriggered { storeIntegrationId, triggeredByUserId, triggeredAt }
      🟪 Policy: TS HTTP-calls go-worker `/sync { integrationId, credentials, pipelines[] }`
      🟪 Policy: go-worker enqueues a backfill job, emits `integration.progress_updated` events

👤 User
  🟦 TriggerReintegrationAll
    🟧 ReintegrationBatchRequested { storeId, integrationIds[] }
      🟪 Policy: handler fans out into N TriggerReintegration calls (respecting per-integration rate limit)

═══════════════════════════════════════════════════════════════════
 INGEST — Sales (Go-owned writes; TS reacts downstream)
═══════════════════════════════════════════════════════════════════

👤 Provider (Shopify / Nuvem Shop / CartPanda / Yampi)
  ─► (HTTP webhook) ─► go-worker
                          │
                          ▼
                       🟪 Policy: provider-specific mapper transforms payload → canonical
                       🟪 Policy: UPSERT Order in Postgres
                                  PK = UUIDv5("SHOPIFY:8123456789"), idempotent
                                  customer data embedded directly on Order (no Customer aggregate)
                       🟪 Policy: if line items reference unknown Product/Variant, look up by deterministic ID
                                  (Catalog side will UPSERT them via its own ingest)
                       🟪 Policy: outbox publish to Kafka topic `order.updated`
                                  📣 (Go → Kafka) OrderUpdated { orderId, storeIntegrationId, isNew, changedFields }

[TS API listens on `order.updated`]
  🟪 Policy: ProductCost reconciliation handler — recompute COGS attribution if line items changed
  🟪 Policy: Notifications handler — if Store opted in to per-order push, dispatch FCM
  🟪 Policy: Analytics query layer invalidates any per-store caches

👤 Provider (CartPanda / Yampi checkout)
  ─► (HTTP webhook: cart abandonment) ─► go-worker
                       🟪 Policy: UPSERT Cart in Postgres
                       🟪 Policy: outbox publish
                                  📣 (Go → Kafka) CartAbandoned { cartId, storeIntegrationId, cartToken }
                       🟪 Policy: scan pending carts for cartToken match when later Order arrives

👤 Provider (payment gateway: Stripe et al.)
  ─► (HTTP webhook: transaction lifecycle) ─► go-worker
                       🟪 Policy: append OrderTransaction to Order (typed fees[] inside)
                                  📣 (Go → Kafka) OrderTransactionRecorded
                                  📣 (Go → Kafka) OrderTransactionRefunded   (on REFUND kind)
                                  📣 (Go → Kafka) OrderTransactionDisputed   (on dispute status change)
                       🟥 Hot Spot: dispute revenue impact must flow into analytics within minutes

═══════════════════════════════════════════════════════════════════
 INGEST — Catalog (Go-owned writes)
═══════════════════════════════════════════════════════════════════

👤 Provider (Shopify / Nuvem Shop)
  ─► (HTTP webhook) ─► go-worker
                       🟪 Policy: UPSERT Product (PK = UUIDv5("SHOPIFY:<productId>"))
                                  preserve merchant-owned tags across updates
                                  if provider reports deletion → status = "ARCHIVED" (never hard-delete)
                                  📣 (Go → Kafka) ProductUpdated { productId, storeIntegrationId, isNew, changedFields, status }
                       🟪 Policy: UPSERT ProductVariant (PK = UUIDv5("SHOPIFY:<variantId>"))
                                  📣 (Go → Kafka) VariantUpdated { variantId, productId, storeIntegrationId, isNew, changedFields }

═══════════════════════════════════════════════════════════════════
 INGEST — Marketing (Go-owned writes; unified manual + automatic spend)
═══════════════════════════════════════════════════════════════════

👤 Provider (Meta / Google Ads / TikTok)
  ─► (polled hourly via go-worker OAuth client)
                       🟪 Policy: UPSERT Campaign, AdSet, Ad (PK = UUIDv5("META:<id>"))
                                  📣 (Go → Kafka) CampaignUpdated
                                  📣 (Go → Kafka) AdSetUpdated
                                  📣 (Go → Kafka) AdUpdated
                                  📣 (Go → Kafka) CampaignStatusChanged   (only on status transition)

                       🟪 Policy: UPSERT AdSpend (one row per (adAccountExternalId, campaignExternalId, startDate, groupBy))
                                  shape decoupled from integration entities:
                                  { adAccountExternalId, campaignExternalId, currency, startDate, endDate, groupBy, spend, platform, adSpendType: "AUTOMATIC" }
                                  📣 (Go → Kafka) AdSpendRecorded

[TS API: ManualMarketingExpense uses the same AdSpend aggregate, discriminated by type]
👤 Merchant
  🟦 CreateManualAdSpend { name, description?, startDate, endDate, currency, spend, platform?, bindings: [{productId?, variantId?}] }
    🟨 AdSpend (the unified aggregate)
      🟧 AdSpendRecorded { adSpendId, adSpendType: "MANUAL", spend }
        🟪 Policy: for manual entries, adAccountExternalId & campaignExternalId are null, groupBy = "DAILY"

⏰ Scheduler / 👤 Merchant dashboard query
  🟦 ReconcileMarketingAccounts
    🟪 Trigger A: go-worker cron, hourly per active MARKETING_PLATFORM integration
    🟪 Trigger B: dashboard query — TS HTTP-calls go-worker `/marketing/reconcile/<platform>` synchronously
                  (debounced via Redis 300s key per integration to avoid stampedes)
    🟧 MarketingReconciliationCompleted { storeIntegrationId, windowDays, completedAt }
      🟪 Policy: re-fetch the last 30 days of AdSpend → fills gaps, corrects drift

👤 Merchant
  🟦 BindCampaignToProduct { campaignId, productIds[], variantIds[] }
    🟨 CampaignProductBinding
      🟧 CampaignProductBindingCreated

  🟦 UnbindCampaignFromProduct
    🟨 CampaignProductBinding
      🟧 CampaignProductBindingRemoved

═══════════════════════════════════════════════════════════════════
 INGEST — Tracking (Pixel events; Go-owned writes)
═══════════════════════════════════════════════════════════════════

👤 Storefront visitor (browser)
  ─► (Shopify Pixel script POST) ─► go-worker
                       🟪 Policy: append PixelEvent (append-only; no UPSERT)
                                  📣 (Go → Kafka) PixelEventRecorded { pixelEventId, type, occurredAt }
                       🟪 Policy: on type = CHECKOUT_COMPLETED with cartToken, attempt Cart→Order linking

═══════════════════════════════════════════════════════════════════
 MERCHANT CONFIGURATION — Overrides, Costs, Tax & Fee Profiles
═══════════════════════════════════════════════════════════════════

👤 Merchant
  🟦 UpdateOrderOverride { orderId, paymentMethod?, paymentStatus?, revenue?, productCostByLine?, shipping?, fees?, taxes? }
    🟨 OrderOverride (pinned by orderId + storeIntegrationExternalId)
      🟧 OrderOverridden { orderId, storeIntegrationExternalId, changedFields }
        🟪 Policy: Analytics caches touching these orders' revenue / margin are invalidated

👤 Merchant
  🟦 CreateProductCost { variantId, storeIntegrationId, currency, country?, dateRange, qty rules… }
  🟦 UpdateProductCost
  🟦 DeleteProductCost
  🟦 BulkImportProductCostsFromCsv
    🟨 ProductCost
      🟧 ProductCostCreated / ProductCostUpdated / ProductCostDeleted
        🟪 Policy: Analytics recomputes margin attribution for affected orders

👤 Merchant
  🟦 AddProductTag / RemoveProductTag
    🟨 Product (tags are merchant-owned facets on canonical — explicit exception)
      🟧 ProductTagAdded / ProductTagRemoved

👤 Merchant
  🟦 UpdateTaxes { revenueTaxType?, revenueTaxDeductionType?, revenueTaxRate?, marketingTaxRatePerPlatform?, ... }
    🟨 Taxes (per Store, time-effective)
      🟧 TaxesUpdated { storeId, changedFields, effectiveStartDate }
        🟪 Policy: previous row's endDate = new row's startDate (history preserved, never overwritten)

👤 Merchant
  🟦 UpdateFeesConfiguration { gatewayFees?, checkoutFees?, shippingFee? }
    🟨 FeesConfiguration (per Store, parent over typed sub-fees; time-effective)
      🟧 FeesConfigurationUpdated { storeId, changedFeeCategories[], effectiveStartDate }

👤 Merchant
  🟦 CreateOperationalCost / UpdateOperationalCost / DeleteOperationalCost / ToggleOperationalCostStatus
    🟨 OperationalCost (category is typed enum: EMPLOYEE | APP | RENT | ...)
      🟧 OperationalCostRecorded / OperationalCostUpdated / OperationalCostDeleted / OperationalCostStatusToggled

👤 Merchant
  🟦 CreateWarrantyReserve / UpdateWarrantyReserve / DeleteWarrantyReserve
    🟨 WarrantyReserve

═══════════════════════════════════════════════════════════════════
 FX — Rate Capture (system-driven)
═══════════════════════════════════════════════════════════════════

⏰ Scheduler (every hour)
  🟦 CaptureFxRates
    🟨 FxRate (append-only, with startDate)
      🟧 FxRateCaptured { fromCurrency, toCurrency, rate, source, startDate }
        🟪 Policy: never overwrite an existing rate for the same (pair, startDate)

═══════════════════════════════════════════════════════════════════
 ANALYTICS — Goals & Charts (queries served direct; no read models)
═══════════════════════════════════════════════════════════════════

👤 Merchant
  🟦 CreateGoal / UpdateGoal / DeleteGoal / DuplicateLastGoal
    🟨 Goal
      🟧 GoalCreated / GoalUpdated / GoalDeleted

[Reads are served directly from canonical tables joined to merchant aggregates]
  🟩 ChartQuery { chartType, frequency, dateRange, storeIds[], productIds?, forcePaidOrders?, timezoneMode }
     → discriminated union response per chartType
     → multi-currency aggregation: per-currency intermediate map, converted to Store reportingCurrency at the end
  🟩 DashboardOverview { dateRange, storeIds[], productIds?, forcePaidOrders? }
  🟩 ProductPerformanceReport { dateRange, storeIds[], ... }
  🟩 ProfitMarginReport { dateRange, storeIds[] }
  🟩 GoalsList

═══════════════════════════════════════════════════════════════════
 NOTIFICATIONS — Push, Email, Daily Digest
═══════════════════════════════════════════════════════════════════

👤 Admin (or system)
  🟦 SendNotification { storeId, targetUserIds[]?, title, content, category, important?, pushEnabled?, emailEnabled? }
    🟨 Notification
      🟧 NotificationSent
        🟪 Policy: dedupe identical (recipient, content-hash) within 15-min window
        🟪 Policy (if push=true): dispatch FCM/APN
        🟪 Policy (if email-eligible): render template + send via email provider

⏰ Scheduler (hourly check, fires per-user at user.timezone 09:00)
  🟦 TriggerDailyDigest
    🟪 Policy: skip users with UserPreferences.dailyNotificationsEnabled = false
    🟪 Policy: admin escape hatch (RunForUser) ignores the flag
    🟪 Policy: aggregate previous-day metrics in UserPreferences.notificationCurrency

👤 User
  🟦 RegisterFcmToken / UnregisterFcmToken
    🟨 FcmRegistrationToken
      🟧 FcmTokenRegistered / FcmTokenUnregistered

  🟦 MarkNotificationRead { notificationDeliveryId }
    🟨 NotificationDelivery
      🟧 NotificationRead

═══════════════════════════════════════════════════════════════════
 BILLING — BK Dash SaaS Subscription (webhook-driven, TS-owned)
═══════════════════════════════════════════════════════════════════

👤 Billing platform (Kiwify / other)
  ─► (HTTP webhook) ─► TS API (NOT go-worker — subscription webhooks stay with TS)
                       🟪 Policy: platform-specific mapper extracts internal subscriptionId from UTM `s1`
                       🟪 Policy: extract PlanTier from product name keyword
                                  (e.g., "1"→BASIC, "3"→INTERMEDIATE, "5"→ADVANCED, "ilimitadas"→UNLIMITED)
                       🟪 Policy: dispatch by event type:

  🟦 HandleBillingWebhook { platform: "KIWIFY" | ..., eventType, payload }
    🟨 Subscription
      🟧 SubscriptionEventReceived { subscriptionId, externalSubscriptionId, eventType, payload, receivedAt }
        🟪 Persisted as an event row — derive Subscription.active / Subscription.cancelled from latest event
      🟧 SubscriptionPaymentReceived { subscriptionId, paymentDate, amount, status, externalPaymentId }
        🟪 Policy: extend Subscription.expirationDate per PlanPeriod
      🟧 SubscriptionActivated   (derived from first successful payment event)
      🟧 SubscriptionCancelled   (derived from cancel webhook)

  🟦 ChangeExternalSubscription { subscriptionId, newExternalSubscriptionId, platform, paymentId }
    🟨 Subscription
      🟧 SubscriptionExternalChanged { subscriptionId, oldExternalSubscriptionId, newExternalSubscriptionId }
        🟪 Policy: reset expirationDate based on plan tier
        🟪 Policy: append payment record (via SubscriptionPaymentReceived)
        🟪 Policy: store quota recomputed (PlanQuotas[newTier])
```

### 2.3 Pivotal Events

1. **`UserRegistered`** — first contact. Lead conversion happens here if a Lead event was previously captured for the same email. No Store is auto-provisioned.
2. **`SubscriptionEventReceived` (first one for a new user)** — the user gains store credits and can call `CreateStore` for the first time.
3. **`StoreCreated`** — the Store exists; the user can now connect integrations.
4. **`IntegrationHandshakeSucceeded`** — credentials validated by go-worker; the integration is now ready to receive webhooks and respond to polling. Data starts flowing.
5. **`OrderUpdated` (first one for a Store)** — real commerce data has landed. Dashboards stop showing empty state; ProductCost configuration becomes meaningful.
6. **`SubscriptionEventReceived` (cancel/expiration)** — quota constraints tighten; new integrations / Stores are blocked.
7. **`IntegrationDisconnected` (with wipeData=true)** — only event that meaningfully shrinks canonical data; cascade-cleans Sales/Catalog/Marketing/Tracking rows for that integration while preserving merchant-owned overrides and costs.

---

## 3. Screens & Commands Definition

### 3.1 Screens (Read Models)

| # | Screen | Description | Data Displayed |
|---|---|---|---|
| T01 | SignInPage | Email + password sign-in form | Empty form; error banner on invalid credentials |
| T02 | SignUpPage | New-user registration | Email, password, name, optional `leadToken` |
| T03 | PasswordResetRequestPage | Request reset email | Email field; confirmation message |
| T04 | PasswordResetCompletePage | Set new password via token | New-password field; token expiry warning |
| T05 | ProfileSettings | Edit own profile (User aggregate fields) | Name, picture |
| T06 | UserPreferencesSettings | Edit own preferences (UserPreferences aggregate) | Timezone, `dailyNotificationsEnabled`, `notificationCurrency`, `notificationCurrencyMode` |
| T07 | MyStores | Workspace switcher / list of memberships | Stores user belongs to with role + lastAccess + storeAmount quota usage |
| T08 | StoreSettings | General Store settings (Store aggregate) | Name, picture, email, phone |
| T09 | StorePreferencesSettings | Edit Store preferences (StorePreferences sibling aggregate) | `reportingCurrency`, `timezone`, `showStoreNameInNotifications` |
| T10 | StoreMembers | List + manage members | Member list with role + pending invitations |
| T11 | IntegrationsList | All integrations for current Store | Per integration: platform, type, status, `lastSyncAt`, `valid`, deterministic externalId |
| T12 | IntegrationDetail | Single integration details (no secrets) | Credential field schemas (masked), `lastSyncAt`, ad-account sub-identities, action menu |
| T13 | OrdersList | Paginated orders with filters | Order list: `externalCreatedAt`, customerName, total (in reporting currency), effective paymentStatus, isManual/isDraft badges, channel |
| T14 | OrderDetail | Single order with overrides applied | Header + customer-data block (embedded, not separate aggregate) + line items (with allocated tax/discount) + transactions (with fees[]) + override badges |
| T15 | AbandonedCartsList | Carts that never completed | Cart age, customer (if known), value, source channel, linkedOrderId? |
| T16 | ProductsList | Paginated products | Title, handle, collection, variantCount, tags, status, channel |
| T17 | ProductDetail | Single product with variants and costs | Variants (with collection), ProductCost rules per variant × StoreIntegration, tags, campaign bindings |
| T18 | ProductCostsList | All ProductCost rules with filters | Variant, channel, currency, country, dateRange, qty rule, costAmount, shipping |
| T19 | ProductTagsList | All tags used across Products | Tag with usage count |
| T20 | MarketingCampaignsList | Campaigns from all ad accounts | Campaign name, platform, adAccountExternalId, status, total spend, bound products |
| T21 | AdSpendBreakdown | Unified spend feed (AUTOMATIC + MANUAL) | Daily/hourly: spend, impressions, clicks, conversions, currency, roas, type discriminator |
| T22 | CampaignProductBindings | All bindings for a Store | Campaign × Product(s) × Variant(s) |
| T23 | PixelFunnel | Funnel from PageView → CheckoutCompleted | Counts per event type, drop-off % between stages, time window |
| T24 | PixelScriptSnippet | Copy-pasteable pixel script | Embed code per StoreIntegration |
| T25 | TaxesSettings | Configure Store tax rules (Taxes aggregate) | revenueTaxType, revenueTaxDeductionType, revenueTaxRate, revenueTaxMultiplier, marketingTaxRatePerPlatform (JSONB editor), startDate |
| T26 | FeesConfigurationSettings | Configure all fee categories (FeesConfiguration aggregate) | gatewayFees[] (per platform × payment method), checkoutFees[] (per checkout platform), shippingFee (type + value), startDate |
| T27 | OperationalCostsList | Recurring operational expenses | Category (typed enum), description, amount, currency, recurrency, statusEntries |
| T28 | WarrantyReservesList | Warranty reserves | Rate, dateRange |
| T29 | FxRatesAdmin | Admin: rate audit | Pair, rate, source, startDate |
| T30 | DashboardOverview | Main analytics dashboard | KPIs: revenue, orderCount, AOV, gross margin, ad spend, ROAS — per-currency intermediate, summed to reportingCurrency |
| T31 | Chart | Single discriminated chart endpoint | `chartType` ∈ {REVENUE, REVENUE_PER_SHIFT, SALES_PER_WEEKDAY, SALES_PER_HOUR, SALES_PER_REGION}; response shape depends on chartType |
| T32 | ProductPerformanceReport | Per-product P&L | Product, unitsSold, revenue, cost, attributedAdSpend, profit, marginPercent |
| T33 | ProfitMarginReport | Margin breakdown | Period, revenue, deductions (cost, tax, fees, marketing, operational, warranty), profit, marginPercent |
| T34 | GoalsList | Goals with progress | Active and past goals, % achieved |
| T35 | AdminUserLookup | Admin: find user by email | User + Stores + Subscriptions |
| T36 | AdminStoreSnapshot | Admin: one Store's data summary | Marketing spend, orders summary, integration health |
| T37 | NotificationsInbox | User-targeted notifications | Title, content, sentAt, readAt, category |
| T38 | MySubscription | Current subscription details (derived from event stream) | Tier, period, expirationDate, isActive (derived), quota usage |
| T39 | SubscriptionEventHistory | Past subscription events (the persisted SubscriptionEvent rows) | EventType, payload summary, receivedAt |

### 3.2 Commands

| # | Command | Actor | Aggregate | Resulting Event | Rules |
|---|---|---|---|---|---|
| C01 | CaptureLead | Visitor | (event-only — no aggregate) | LeadCaptured | Email required; idempotent on email |
| C02 | SignUp | Visitor | User (via BetterAuth) | UserRegistered | Email unique; no auto-Store provision |
| C03 | SignIn | Visitor | (BetterAuth session) | UserSignedIn | Returns BetterAuth session cookie |
| C04 | SignOut | User | (BetterAuth session) | UserSignedOut | Clears session |
| C05 | RequestPasswordReset | Visitor | (BetterAuth token) | PasswordResetRequested | Always returns 204 |
| C06 | CompletePasswordReset | Visitor | (BetterAuth) | PasswordReset | Token validated by BetterAuth |
| C07 | ChangePassword | User | (BetterAuth) | PasswordChanged | Verifies current password |
| C08 | UpdateProfile | User | User | ProfileUpdated | Name, picture |
| C09 | RegisterFcmToken | User | FcmRegistrationToken | FcmTokenRegistered | Idempotent on token value |
| C10 | UnregisterFcmToken | User | FcmRegistrationToken | FcmTokenUnregistered | No-op if absent |
| C11 | UpdateUserPreferences | User | UserPreferences | UserPreferencesUpdated | Partial update on timezone / notification fields |
| C12 | CreateStore | User | Store + StorePreferences | StoreCreated, StoreMemberAdded(OWNER), StorePreferencesCreated | **Gated by available store credits per Subscription tier** |
| C13 | UpdateStoreSettings | OWNER/ADMIN | Store | StoreSettingsUpdated | Name, picture, email, phone only |
| C14 | UpdateStorePreferences | OWNER/ADMIN | StorePreferences | StorePreferencesUpdated | Timezone, currencies, notification settings; **`reportingCurrency` locked once Orders ingested** |
| C15 | InviteMember | OWNER/ADMIN | Store | StoreMemberInvited | Email + role; emits invitation token |
| C16 | AcceptInvitation | Invitee | Store | StoreMemberAdded | Token valid; creates User if absent |
| C17 | RemoveMember | OWNER/ADMIN | Store | StoreMemberRemoved | Cannot remove last OWNER |
| C18 | ChangeMemberRole | OWNER | Store | StoreMemberRoleChanged | Cannot demote last OWNER |
| C19 | DisableStore | OWNER | Store | StoreDisabled | Soft-delete; integrations marked inactive but kept |
| C20 | EnableStore | OWNER | Store | StoreEnabled | Reverses disable |
| C21 | ConnectIntegration | OWNER/ADMIN | StoreIntegration | IntegrationConnectionInitiated, IntegrationHandshakeSucceeded \| IntegrationHandshakeFailed | TS exchanges OAuth code → tokens → encrypts → HTTP-calls go-worker handshake. Returns success or surfaced error |
| C22 | DisconnectIntegration | OWNER/ADMIN | StoreIntegration | IntegrationDisconnected, StoreIntegrationDataWipeRequested? | `wipeData: boolean` cascades cleanup |
| C23 | TriggerReintegration | OWNER/ADMIN | StoreIntegration | ReintegrationTriggered | Rate-limited per integration (1/5min); TS HTTP-calls go-worker with credentials |
| C24 | TriggerReintegrationAll | OWNER/ADMIN | Store | ReintegrationBatchRequested | Emits batch event; system fans out |
| C25 | ToggleIntegrationActive | OWNER/ADMIN | StoreIntegration | IntegrationActiveToggled | Pauses ingest without disconnecting |
| C26 | UpdateOrderOverride | OWNER/ADMIN/MEMBER | OrderOverride | OrderOverridden | Unified partial update on typed fields: `paymentMethod`, `paymentStatus`, `revenue`, `productCostByLine`, `shipping`, `fees`, `taxes` |
| C27 | CreateProductCost | OWNER/ADMIN/MEMBER | ProductCost | ProductCostCreated | Per variant × StoreIntegration × dateRange × qty rule × country × currency |
| C28 | UpdateProductCost | OWNER/ADMIN/MEMBER | ProductCost | ProductCostUpdated | Cannot change scoping keys |
| C29 | DeleteProductCost | OWNER/ADMIN/MEMBER | ProductCost | ProductCostDeleted | Soft-delete; preserves historical attribution |
| C30 | BulkImportProductCostsFromCsv | OWNER/ADMIN | ProductCost | ProductCostCreated/Updated (×N) | Per-row report; partial-success |
| C31 | AddProductTag | OWNER/ADMIN/MEMBER | Product | ProductTagAdded | Explicit exception to "canonical never mutated" — tags are merchant-owned metadata |
| C32 | RemoveProductTag | OWNER/ADMIN/MEMBER | Product | ProductTagRemoved | Idempotent |
| C33 | CreateManualAdSpend | OWNER/ADMIN/MEMBER | AdSpend (type=MANUAL) | AdSpendRecorded | adAccountExternalId / campaignExternalId null; groupBy="DAILY" |
| C34 | UpdateManualAdSpend | OWNER/ADMIN/MEMBER | AdSpend (type=MANUAL) | AdSpendUpdated | Only manual rows can be updated; automatic rows are Go-managed |
| C35 | DeleteManualAdSpend | OWNER/ADMIN/MEMBER | AdSpend (type=MANUAL) | AdSpendDeleted | Only manual rows can be deleted |
| C36 | BindCampaignToProduct | OWNER/ADMIN/MEMBER | CampaignProductBinding | CampaignProductBindingCreated | Many-to-many |
| C37 | UnbindCampaignFromProduct | OWNER/ADMIN/MEMBER | CampaignProductBinding | CampaignProductBindingRemoved | Idempotent |
| C38 | ReconcileMarketingAccounts | OWNER/ADMIN or System | StoreIntegration (marketing) | MarketingReconciliationCompleted | Trigger A: go-worker cron hourly; Trigger B: dashboard query (debounced 300s/integration) |
| C39 | UpdateTaxes | OWNER/ADMIN | Taxes | TaxesUpdated | Per-Store; time-effective (previous row's endDate set to new row's startDate) |
| C40 | UpdateFeesConfiguration | OWNER/ADMIN | FeesConfiguration | FeesConfigurationUpdated | Partial update across `gatewayFees[]`, `checkoutFees[]`, `shippingFee`; time-effective |
| C41 | CreateOperationalCost | OWNER/ADMIN | OperationalCost | OperationalCostRecorded | Category is typed enum |
| C42 | UpdateOperationalCost | OWNER/ADMIN | OperationalCost | OperationalCostUpdated | Partial update |
| C43 | DeleteOperationalCost | OWNER/ADMIN | OperationalCost | OperationalCostDeleted | Soft-delete |
| C44 | ToggleOperationalCostStatus | OWNER/ADMIN | OperationalCost | OperationalCostStatusToggled | Append OperationalCostStatusEntry |
| C45 | CreateWarrantyReserve | OWNER/ADMIN | WarrantyReserve | WarrantyReserveCreated | Rate ∈ [0,1] + dateRange |
| C46 | UpdateWarrantyReserve | OWNER/ADMIN | WarrantyReserve | WarrantyReserveUpdated | |
| C47 | DeleteWarrantyReserve | OWNER/ADMIN | WarrantyReserve | WarrantyReserveDeleted | |
| C48 | CaptureFxRates | System (hourly) | FxRate | FxRateCaptured (×N) | Append-only; never overwrites existing `(pair, startDate)` |
| C49 | CreateGoal | OWNER/ADMIN | Goal | GoalCreated | type ∈ {REVENUE, PROFIT}; targetAmount.amountCents > 0 |
| C50 | UpdateGoal | OWNER/ADMIN | Goal | GoalUpdated | |
| C51 | DeleteGoal | OWNER/ADMIN | Goal | GoalDeleted | |
| C52 | DuplicateLastGoal | OWNER/ADMIN | Goal | GoalCreated | Copies most recent Goal's params; shifts dateRange forward |
| C53 | SendNotification | Admin or System | Notification | NotificationSent | Target Store (broadcast) or specific userIds[] |
| C54 | TriggerDailyDigest | System (hourly check) | Notification | DailyDigestSent | Skip users with `dailyNotificationsEnabled = false` |
| C55 | MarkNotificationRead | User | NotificationDelivery | NotificationRead | Idempotent |
| C56 | HandleBillingWebhook | Billing platform (Kiwify, etc.) | Subscription (event-derived) | SubscriptionEventReceived, SubscriptionPaymentReceived, SubscriptionActivated, SubscriptionCancelled | Dispatches by event type; extracts internal subscriptionId from UTM s1; extracts tier from product name |
| C57 | ChangeExternalSubscription | User OR webhook | Subscription | SubscriptionExternalChanged | Update externalSubscriptionId; reset expirationDate |

---

## 4. Bounded Context Separation

BCs are drawn around the team that owns each capability, the lifecycle of the data, and the direction the events flow. Eleven contexts in total: three foundational (Identity, Tenancy, Integration); five domain (Sales, Catalog, Marketing, Tracking, Finance); one cross-cutting read-side (Analytics); and two supporting (Notifications, Billing). The previous Productivity context is removed.

### BC1: Identity

**Responsibility:** Owns the User aggregate (sessions, profile fields), a separate `UserPreferences` aggregate (timezone + notification preferences), and `FcmRegistrationToken`. Authentication primitives (`RefreshToken`, `PasswordResetToken`) are owned by BetterAuth and **not** modeled here — the spec references them as boundary primitives but does not define their shape. `Lead` is captured as an event only — no Lead aggregate persisted.
**Ubiquitous Language:** User, UserPreferences, Profile, FcmRegistrationToken, Lead (event).
**Classification:** **Support**.

**Aggregates:**
- `User` — `id`, `email` (unique), `name`, `pictureUrl?`, `createdAt`, `disabledAt?`. (Password hash, refresh tokens, password reset tokens — handled by BetterAuth.)
- `UserPreferences` — `id`, `userId` (unique), `timezone` (IANA), `dailyNotificationsEnabled: boolean`, `notificationCurrency: CurrencyCode`, `notificationCurrencyMode: NotificationCurrencyMode`, `updatedAt`. Created when the User is created.
- `FcmRegistrationToken` — `id`, `userId`, `token` (unique), `platform: FcmPlatform`, `registeredAt`, `lastSeenAt`.

**Screens:** T01, T02, T03, T04, T05, T06.
**Commands:** C01–C11.

**Published Events:**
- `UserRegistered`, `UserSignedIn`, `UserSignedOut`, `ProfileUpdated`, `PasswordChanged`, `PasswordResetRequested`, `PasswordReset`, `FcmTokenRegistered`, `FcmTokenUnregistered`, `LeadCaptured`, `UserPreferencesUpdated`.

**Command Execution Behavior:**

- **C01 — CaptureLead:** Validates email. Idempotent on email. Emits `LeadCaptured`. The event is the only record — no Lead aggregate persisted. Public, no auth.
- **C02 — SignUp:** Validates email/password via BetterAuth. Creates `User` and the default `UserPreferences` row in the same transaction. Emits `UserRegistered`. **Does NOT auto-provision a Store** — the user must explicitly call `CreateStore` (subject to Subscription quota).
- **C03 — SignIn / C04 — SignOut:** Pass-through to BetterAuth. Spec models the events for completeness.
- **C05 — RequestPasswordReset / C06 — CompletePasswordReset / C07 — ChangePassword:** Pass-through to BetterAuth.
- **C08 — UpdateProfile:** Partial update on `name` / `pictureUrl`. Emits `ProfileUpdated`.
- **C09 — RegisterFcmToken / C10 — UnregisterFcmToken:** As before.
- **C11 — UpdateUserPreferences:** Partial update on `UserPreferences`. Emits `UserPreferencesUpdated`. Notifications BC re-caches.

---

### BC2: Tenancy

**Responsibility:** Owns the Store (workspace) aggregate, a sibling `StorePreferences` aggregate for per-store editable preferences, and the `StoreMembership` join. Enforces the **store-credit gate** at Store creation: the User can only create a Store if their active Subscription tier provides remaining `STORE_AMOUNT` quota. The `onboardingCompleted` flag is NOT owned here (it's a UI-only concern). The `forcePaidOrders` flag is NOT a Store config — it's a chart-query parameter the merchant toggles per-view.
**Ubiquitous Language:** Store, StorePreferences, StoreMembership, Role, ReportingCurrency, StoreCredit.
**Classification:** **Core**.

**Aggregates:**
- `Store` — `id`, `name`, `pictureUrl?`, `email?`, `phoneNumber?`, `createdAt`, `disabledAt?`. Profile only.
- `StorePreferences` — `id`, `storeId` (unique), `reportingCurrency: CurrencyCode`, `timezone`, `showStoreNameInNotifications: boolean`, `updatedAt`, `updatedByUserId`. Created with Store; updated separately.
- `StoreMembership` — `id`, `storeId`, `userId`, `role: Role`, `lastAccess`, `invitedAt`, `acceptedAt?`, `removedAt?`.

**Screens:** T07, T08, T09, T10.
**Commands:** C12–C20.

**Published Events:**
- `StoreCreated`, `StoreSettingsUpdated`, `StorePreferencesCreated`, `StorePreferencesUpdated`, `StoreDisabled`, `StoreEnabled`, `StoreMemberInvited`, `StoreMemberAdded`, `StoreMemberRemoved`, `StoreMemberRoleChanged`.

**Command Execution Behavior:**

- **C12 — CreateStore:** Resolves user's active Subscription, looks up `PlanQuotas[subscription.tier].STORE_AMOUNT`, counts existing Stores in subscriptions with available capacity. If full → `STORE_QUOTA_EXCEEDED`. Otherwise creates `Store`, `StorePreferences` (defaults), and `StoreMembership(OWNER)` in one transaction. Emits `StoreCreated` + `StoreMemberAdded` + `StorePreferencesCreated`.
- **C13 — UpdateStoreSettings:** Partial update on `Store` profile fields (name, picture, email, phone).
- **C14 — UpdateStorePreferences:** Partial update on `StorePreferences`. **Invariant:** `reportingCurrency` cannot change once Orders have been ingested for this Store (would invalidate FX history) — `REPORTING_CURRENCY_LOCKED`.
- **C15–C18:** Member lifecycle as in §3.
- **C19 — DisableStore / C20 — EnableStore:** As before. `Integration` reacts by flipping `active` on each StoreIntegration.

---

### BC3: Integration

**Responsibility:** Owns the lifecycle of every provider connection — sales channels, checkouts, payment gateways, and marketing platforms — under one unified `StoreIntegration` aggregate. **TS API owns** OAuth flows, credential storage (encrypted), credential refresh. **Go-worker handles** webhook intake and polling, but its validation (handshake) is invoked synchronously over HTTP by the TS API on connect. The `ProviderCatalogEntry` from v1 is removed — credential field schemas come from SDK-published Zod schemas, not a runtime catalog.
**Ubiquitous Language:** StoreIntegration, Platform, IntegrationCredentials, Handshake, Reintegration, AdAccount, BusinessAccount, IntegrationProgress.
**Classification:** **Core**.

**Aggregates:**
- `StoreIntegration` — `id` (deterministic: `UUIDv5("${platform}:${externalId}")`), `storeId`, `type: StoreIntegrationType`, `platform: Platform`, `externalId` (immutable provider-side identifier — also the override-pinning key), `displayName`, `credentialSecretId`, `active: boolean`, `valid: boolean`, `lastSyncAt?`, `lastHandshakeAt?`, `connectedAt`, `disconnectedAt?`.
- `IntegrationCredentialSecret` — `id`, `storeIntegrationId`, `encryptedPayload`, `rotatedAt`, `expiresAt?`.
- `MarketingAdAccount` — `id`, `storeIntegrationId`, `externalId`, `name`, `currency: CurrencyCode`, `timezone`, `businessAccountExternalId?`, `active: boolean`, `lastSyncAt?`.
- `MarketingBusinessAccount` — `id`, `storeIntegrationId`, `externalId`, `name`, `link?`, `active: boolean`.

**Screens:** T11, T12.
**Commands:** C21–C25.

**Published Events:**
- `IntegrationConnectionInitiated`, `IntegrationHandshakeSucceeded`, `IntegrationHandshakeFailed`, `IntegrationActivated`, `IntegrationDeactivated`, `IntegrationDisconnected`, `IntegrationActiveToggled`, `ReintegrationTriggered`, `ReintegrationBatchRequested`, `StoreIntegrationDataWipeRequested`.

**Integration Events Consumed (from go-worker):**
- `integration.progress_updated` — surfaces sync progress to the UI.

**HTTP-to-Go (TS calls Go):**
- `POST /integrations/handshake { platform, credentials }` — validate credentials + return discovered `externalId` and any `MarketingAdAccount`s.
- `POST /sync { storeIntegrationId, credentials, pipelines[], windowDays? }` — enqueue backfill.
- `POST /marketing/reconcile/<platform> { credentials, adAccountId, dateRange }` — synchronous reconciliation.

**Command Execution Behavior:**

- **C21 — ConnectIntegration:** Validates form input against the platform's Zod schema. If OAuth-capable, exchanges code → tokens. Encrypts and persists credentials. HTTP-calls go-worker handshake. On success: marks `active=true, valid=true, externalId, lastHandshakeAt=now`, emits `IntegrationHandshakeSucceeded` and `IntegrationActivated`. On failure: persists `valid=false`, emits `IntegrationHandshakeFailed` with reason. Errors surfaced directly in the response.
- **C22 — DisconnectIntegration:** Sets `disconnectedAt`. Publishes `shared.IntegrationDeactivated` for go-worker to stop polling. If `wipeData = true`, additionally emits `StoreIntegrationDataWipeRequested` (cascade-delete canonical rows in Sales/Catalog/Marketing/Tracking; merchant-owned overrides preserved).
- **C23 — TriggerReintegration:** Rate-limited per `storeIntegrationId` (1/5min). Decrypts current credentials. HTTP-calls go-worker `/sync` with credentials + full pipeline set. Emits `ReintegrationTriggered`.
- **C24 — TriggerReintegrationAll:** Emits `ReintegrationBatchRequested` with the list of active integrations. A handler iterates and runs C23 per integration, respecting the per-integration rate limit.
- **C25 — ToggleIntegrationActive:** Flips `active`. Emits `IntegrationActiveToggled`. Go-worker stops/resumes polling.

---

### BC4: Sales

**Responsibility:** Owns the canonical `Order` and `Cart` projections (written by go-worker) and the merchant-owned `OrderOverride` aggregate. **No Customer aggregate** — customer data is embedded directly on each Order. Every projection here is **write-locked from user actions**; only go-worker UPSERTs it. Merchants change the order picture through `OrderOverride`, joined at query time.
**Ubiquitous Language:** Order, OrderLine, OrderTransaction, OrderTransactionFee, OrderOverride, OverrideField, Cart, PaymentStatus, PaymentMethod, ShippingAddress, ManualField (typed).
**Classification:** **Core**.

**Aggregates:**
- `Order` (canonical projection — Go-written) — `id` (deterministic), `storeId`, `storeIntegrationId`, `storeIntegrationExternalId` (override-pinning key), `externalId`, `externalCreatedAt`, `description?`, `customerEmail?`, `customerName?`, `customerPhoneNumber?`, `shippingAddress?: PostalAddress`, `subtotal: MonetaryAmount`, `discountTotal: MonetaryAmount`, `shippingTotal: MonetaryAmount`, `taxTotal: MonetaryAmount`, `total: MonetaryAmount`, `presentmentMoney?: MonetaryAmount` (provider's storefront-displayed currency snapshot), `settlementMoney?: MonetaryAmount` (provider's settlement currency snapshot), `paymentStatus: PaymentStatus`, `paymentMethod: PaymentMethod`, `paymentGateway: PaymentGateway`, `lines: OrderLine[]`, `transactions: OrderTransaction[]`, `cartToken?`, `utm?: UtmTags`, `isDraft: boolean`, `isManual: boolean`. **No `externalNumber`, `externalSequenceNumber`, top-level `currency`, `placedAt`, `customerId`, `billingAddress`, `fulfillmentStatus`, `cancelledAt`, `closedAt`, `tags`** — these were stripped per the v2 simplification.
- `OrderLine` (nested in Order) — `id`, `productExternalId`, `variantExternalId`, `productId?`, `variantId?`, `title`, `variantTitle?`, `quantity`, `unitPrice: MonetaryAmount`, `discount: MonetaryAmount` (per-line discount allocated to this row), `tax: MonetaryAmount` (per-line tax allocated to this row), `allocatedTax: MonetaryAmount` (proportional tax allocation for split scenarios), `totalPrice: MonetaryAmount`. `Order.discountTotal` and `Order.taxTotal` = sum of line `discount`/`tax` + any order-level adjustments.
- `OrderTransaction` (nested in Order) — `id`, `externalId`, `kind: TransactionKind`, `status: TransactionStatus`, `amount: MonetaryAmount`, `processedAt`, `disputeStatus?: DisputeStatus`, `fees: OrderTransactionFee[]`.
- `OrderTransactionFee` (nested in OrderTransaction) — `externalId`, `type: OrderTransactionFeeType` (`PROCESSING` | `EXCHANGE` | `UNKNOWN`), `rate: number`, `fixed: MonetaryAmount`, `variable: MonetaryAmount`.
- `Cart` (canonical projection — Go-written) — `id` (deterministic), `storeId`, `storeIntegrationId`, `externalId`, `cartToken`, `cartUrl?`, `currency: CurrencyCode`, `total: MonetaryAmount`, `lines: CartLine[]`, `customerEmail?`, `customerName?`, `contactInfo?: Record<string, string>`, `abandonedAt`, `linkedOrderId?`.
- `OrderOverride` (merchant aggregate, unified typed) — `id`, `storeId`, `orderId`, `storeIntegrationExternalId`, `fields: OrderOverrideFields`, `updatedAt`, `updatedByUserId`.
- `OrderOverrideFields` (typed value object — nested in OrderOverride) — `paymentMethod?: PaymentMethod`, `paymentStatus?: PaymentStatus`, `revenue?: MonetaryAmount`, `productCostByLine?: { lineId: string; cost: MonetaryAmount }[]`, `shipping?: MonetaryAmount`, `fees?: MonetaryAmount`, `taxes?: MonetaryAmount`.

**Screens:** T13, T14, T15.
**Commands:** C26.

**Published Events:**
- Canonical (Go-written, TS subscribes): `OrderUpdated`, `OrderTransactionRecorded`, `OrderTransactionRefunded`, `OrderTransactionDisputed`, `CartAbandoned`, `CartLinkedToOrder`. **Note:** the v1 split of `OrderIngested` / `OrderCancelled` / `OrderRefunded` is collapsed into the single `OrderUpdated` event carrying `isNew` and `changedFields` — downstream consumers branch on the change set rather than on event name.
- Merchant: `OrderOverridden`.

**Integration Events Consumed:**
- From go-worker outbox: `OrderUpdated`, `CartAbandoned`, `OrderTransactionRecorded`/`Refunded`/`Disputed`. TS handlers do downstream work (ProductCost reconciliation, notification fan-out, analytics cache invalidation).
- From Integration BC: `StoreIntegrationDataWipeRequested` → cascade-delete this integration's Orders and Carts. OrderOverrides preserved (they're merchant-owned).

**Command Execution Behavior:**

- **C26 — UpdateOrderOverride:** Accepts a partial `OrderOverrideFields` payload. UPSERTs the `OrderOverride` row pinned by `(orderId, storeIntegrationExternalId)`. Validates: `productCostByLine` line IDs must exist in the Order; `paymentStatus` must be a valid `PaymentStatus`. Emits `OrderOverridden` with `changedFields`. A handler in Analytics invalidates caches for the affected orders.

---

### BC5: Catalog

**Responsibility:** Owns the canonical `Product` and `ProductVariant` projections (Go-written) plus the merchant-owned `ProductCost` aggregate. Products and variants are write-locked except for merchant-owned `tags` on Products — tags are explicitly merchant facets and have no provider-side equivalent.
**Ubiquitous Language:** Product, ProductVariant, ProductCost, Tag, Collection, Sku, Handle, QuantityModifier, KitCost, TieredCost.
**Classification:** **Core**.

**Aggregates:**
- `Product` (canonical projection — Go-written) — `id` (deterministic), `storeId`, `storeIntegrationId`, `externalId`, `title`, `handle`, `description?`, `pictureUrl?`, `status: ProductStatus`, `collection?: string` (provider's collection / category name), `tags: string[]` (merchant-owned), `externalCreatedAt`. **No `lastSyncedAt`** — sync timestamp lives on the StoreIntegration, not on each row.
- `ProductVariant` (canonical projection — Go-written) — `id` (deterministic), `productId`, `storeIntegrationId`, `externalId`, `title`, `sku?`, `barcode?`, `unitPrice: MonetaryAmount`, `pictureUrl?`, `collection?: string`, `externalCreatedAt`. **No `weightGrams`, no `position`** — dropped from the canonical shape.
- `ProductCost` (merchant aggregate) — `id`, `storeId`, `storeIntegrationId`, `productId?` (null when scoped to a kit), `costType: ProductCostType`, `displayName?`, `options: ProductCostOption[]`.
- `ProductCostOption` (nested in ProductCost) — `id`, `currency: CurrencyCode`, `country?: string`, `startDate`, `endDate?`, `shipping: MonetaryAmount`, `items: ProductCostOptionItem[]`.
- `ProductCostOptionItem` (nested in ProductCostOption) — `id`, `variantIds: string[]`, `quantity`, `quantityModifier: QuantityModifier`, `unitCost: MonetaryAmount`, `shipping: MonetaryAmount`, `variantsHash`.

**Screens:** T16, T17, T18, T19.
**Commands:** C27–C32.

**Published Events:**
- Canonical (Go-written): `ProductUpdated` (carries `isNew`, `status`, `changedFields`), `VariantUpdated` (carries `isNew`, `changedFields`). Archive transitions surfaced via `changedFields.status`.
- Merchant: `ProductCostCreated`, `ProductCostUpdated`, `ProductCostDeleted`, `ProductTagAdded`, `ProductTagRemoved`.

**Integration Events Consumed:**
- From go-worker outbox: `ProductUpdated`, `VariantUpdated` (TS handlers update analytics caches).
- From Integration BC: `StoreIntegrationDataWipeRequested` → cascade-delete this integration's Products/Variants. ProductCosts are NOT cascade-deleted (merchant-owned).

**Command Execution Behavior:**

- **C27 — CreateProductCost / C28 — UpdateProductCost / C29 — DeleteProductCost:** As in §3, validating variantIds belong to the Store, computing `variantsHash`, time-effective options. Emits the corresponding `ProductCost*` events.
- **C30 — BulkImportProductCostsFromCsv:** Parses CSV, applies in single transaction, returns per-row report.
- **C31 — AddProductTag / C32 — RemoveProductTag:** Explicit exception to "canonical never mutated" — tags are merchant-owned metadata. Idempotent.

---

### BC6: Marketing

**Responsibility:** Owns the canonical `Campaign`, `AdSet`, `Ad` projections (Go-written) and the **unified `AdSpend` aggregate** that covers both provider-synced spend (`type: "AUTOMATIC"`) and merchant-entered manual spend (`type: "MANUAL"`). Owns `CampaignProductBinding` (merchant). **Does NOT own `MarketingTax`** — that lives on the Finance BC's `Taxes` aggregate (`marketingTaxRatePerPlatform` JSONB field).
**Ubiquitous Language:** Campaign, AdSet, Ad, AdSpend, AdSpendType, CampaignProductBinding, AdAccountExternalId, BusinessAccountExternalId, Roas, Attribution.
**Classification:** **Core**.

**Aggregates:**
- `Campaign` (canonical projection — Go-written) — `id` (deterministic), `adAccountExternalId`, `businessAccountExternalId?`, `externalId`, `name`, `platform: MarketingPlatform`, `status: CampaignStatus`, `externalCreatedAt`. **No `storeId`, no `storeIntegrationId`, no `lastSyncedAt`** — Campaign keys back to the integration via `adAccountExternalId` lookup. **`externalStatus` collapsed into `status`** — Go's mapper does the translation.
- `AdSet` (canonical projection — Go-written) — `id` (deterministic), `campaignExternalId`, `adAccountExternalId`, `externalId`, `name`, `platform: MarketingPlatform`, `status: CampaignStatus`, `externalCreatedAt`.
- `Ad` (canonical projection — Go-written) — `id` (deterministic), `adSetExternalId`, `campaignExternalId`, `adAccountExternalId`, `externalId`, `name`, `platform: MarketingPlatform`, `status: CampaignStatus`, `externalCreatedAt`.
- `AdSpend` (**unified** canonical + merchant — both Go-written for AUTOMATIC and TS-written for MANUAL) — `id`, `adAccountExternalId?` (null when MANUAL), `campaignExternalId?` (null when MANUAL), `platform: MarketingPlatform | "MANUAL"`, `currency: CurrencyCode`, `startDate`, `endDate`, `groupBy: AdSpendGroupBy` (`HOURLY` | `DAILY` for AUTOMATIC; always `DAILY` for MANUAL), `spend: MonetaryAmount`, `impressions?: number`, `clicks?: number`, `conversions?: number`, `adSpendType: AdSpendType` (`AUTOMATIC` | `MANUAL`), `name?: string` (manual only — e.g., "Q2 offline OOH"), `description?: string` (manual only), `bindings?: ManualMarketingExpenseBinding[]` (manual only — productId / variantId), `createdAt`, `disabledAt?`.
- `CampaignProductBinding` (merchant aggregate) — `id`, `storeId`, `campaignId`, `productIds: string[]`, `variantIds: string[]`, `boundAt`.

**Screens:** T20, T21, T22.
**Commands:** C33–C38.

**Published Events:**
- Canonical (Go-written): `CampaignUpdated`, `CampaignStatusChanged`, `AdSetUpdated`, `AdUpdated`, `AdSpendRecorded` (carries `adSpendType: "AUTOMATIC"`), `MarketingReconciliationCompleted`.
- Merchant: `AdSpendRecorded` (carries `adSpendType: "MANUAL"`), `AdSpendUpdated`, `AdSpendDeleted`, `CampaignProductBindingCreated`, `CampaignProductBindingRemoved`.

**Integration Events Consumed:**
- From go-worker outbox: `CampaignUpdated`, `AdSetUpdated`, `AdUpdated`, `AdSpendRecorded` (AUTOMATIC), `MarketingReconciliationCompleted` (Analytics consumes for ROAS).
- From Integration BC: `StoreIntegrationDataWipeRequested` → cascade-delete this integration's Campaigns/AdSets/Ads/AdSpend (AUTOMATIC). MANUAL AdSpend, ManualMarketingExpense, CampaignProductBindings NOT cascade-deleted.

**Command Execution Behavior:**

- **C33 — CreateManualAdSpend:** Creates an `AdSpend` row with `adSpendType: "MANUAL"`, null `adAccountExternalId` and `campaignExternalId`, `groupBy: "DAILY"`. Persists in entered currency. Emits `AdSpendRecorded`.
- **C34 — UpdateManualAdSpend / C35 — DeleteManualAdSpend:** Only operate on rows where `adSpendType: "MANUAL"`. AUTOMATIC rows are Go-managed and rejected with `CANNOT_MUTATE_AUTOMATIC_AD_SPEND`.
- **C36 — BindCampaignToProduct / C37 — UnbindCampaignFromProduct:** As before.
- **C38 — ReconcileMarketingAccounts:** Dual trigger — Go cron (autonomous) OR dashboard-query-triggered (TS calls Go via HTTP, debounced 300s/integration via Redis). Go side fetches the last `windowDays` of spend and UPSERTs. Emits `MarketingReconciliationCompleted` per integration.

---

### BC7: Tracking

**Responsibility:** Owns the canonical `PixelEvent` projection — append-only, **Go-written** from Shopify Pixel intake. TS API exposes the merchant-embeddable pixel script and powers funnel/attribution queries.
**Ubiquitous Language:** PixelEvent, EventType, Funnel, AttributionWindow, CartToken, Storefront, PixelScript.
**Classification:** **Support**.

**Aggregates:**
- `PixelEvent` (canonical projection — Go-written; append-only) — `id`, `storeId`, `storeIntegrationId`, `platform: SalesPlatform`, `type: PixelEventType`, `cartToken?`, `productExternalIds: string[]`, `variantExternalIds: string[]`, `customerEmail?`, `device?: string`, `referrerUrl?`, `payload: Record<string, unknown>`, `retroactive: boolean`, `occurredAt`.

**Screens:** T23, T24.
**Commands:** *(none — Go owns the writes)*.

**Published Events:**
- `PixelEventRecorded` (Go-written).

**Integration Events Consumed:**
- From go-worker outbox: `PixelEventRecorded` — a Sales handler scans for `CHECKOUT_COMPLETED` with a matching `cartToken` to link Carts → Orders.

---

### BC8: Finance

**Responsibility:** Owns merchant-configurable financial parameters: the `Taxes` aggregate (revenue tax + per-platform marketing tax), the `FeesConfiguration` aggregate (a single parent owning typed `gatewayFees[]`, `checkoutFees[]`, and a singleton `shippingFee`), `OperationalCost`, `WarrantyReserve`, and the `FxRate` projection. The Finance context is the **single source of monetary truth** for non-revenue figures.
**Ubiquitous Language:** Taxes, FeesConfiguration, GatewayFee, CheckoutFee, ShippingFee, TaxType, TaxDeductionType, ServiceFee, ProfitMultiplier, MarketingTaxRatePerPlatform, WarrantyReserve, OperationalCost, OperationalCostCategory, OperationalCostRecurrency, FxRate, ReportingCurrency, EffectiveStartDate.
**Classification:** **Core**.

**Aggregates:**
- `Taxes` (one active per Store; history retained via startDate/endDate) — `id`, `storeId`, `revenueTaxType: TaxType` (`NONE` | `PRESUMED_PROFIT` | `REAL_PROFIT`), `revenueTaxDeductionType: TaxDeductionType` (`NONE` | `PRODUCT_COST` | `PRODUCT_COST_AND_MARKETING`), `revenueTaxRate: number`, `revenueTaxMultiplier: number`, `marketingTaxRatePerPlatform: Partial<Record<MarketingPlatform, number>>`, `startDate`, `endDate?`, `createdAt`, `updatedByUserId`.
- `FeesConfiguration` (one active per Store; parent + typed children) — `id`, `storeId`, `gatewayFees: GatewayFee[]`, `checkoutFees: CheckoutFee[]`, `shippingFee: ShippingFee`, `startDate`, `endDate?`, `createdAt`, `updatedByUserId`.
- `GatewayFee` (nested in FeesConfiguration) — `platform: PaymentGateway`, `paymentMethod: PaymentMethod`, `percentage: number`, `fixed: MonetaryAmount[]` (per-currency fixed component).
- `CheckoutFee` (nested in FeesConfiguration) — `platform: CheckoutPlatform`, `rate: number`.
- `ShippingFee` (nested in FeesConfiguration; singleton) — `type: ShippingCostType` (`NONE` | `PAID_BY_CUSTOMER` | `AVERAGE_PER_ORDER` | `AVERAGE_PER_ITEM`), `value: ShippingCostValue` (discriminated union per `type`).
- `OperationalCost` (merchant aggregate) — `id`, `storeId`, `category: OperationalCostCategory` (`EMPLOYEE` | `APP` | `FOOD` | `RENT` | `ACCOUNTANT` | `REFUND` | `SHIPPING` | `TAKE_PROFIT` | `OTHER`), `description?`, `amount: MonetaryAmount`, `paymentMethod?: PaymentMethod`, `startDate`, `endDate?`, `recurrency: OperationalCostRecurrency`, `active: boolean`, `statusEntries: OperationalCostStatusEntry[]`, `createdAt`, `deletedAt?`.
- `WarrantyReserve` (merchant aggregate) — `id`, `storeId`, `rate: number` (0..1), `startDate`, `endDate?`, `createdAt`, `deletedAt?`.
- `FxRate` (canonical projection, system-maintained, append-only) — `id`, `fromCurrency: CurrencyCode`, `toCurrency: CurrencyCode`, `rate: number`, `source: FxRateSource`, `startDate`. **Replaces the v1 `capturedAt` — the rate is effective from `startDate` until the next-newer rate's `startDate`.**

**Screens:** T25, T26, T27, T28, T29.
**Commands:** C39–C48.

**Published Events:**
- `TaxesUpdated`, `FeesConfigurationUpdated`, `OperationalCostRecorded`, `OperationalCostUpdated`, `OperationalCostDeleted`, `OperationalCostStatusToggled`, `WarrantyReserveCreated`, `WarrantyReserveUpdated`, `WarrantyReserveDeleted`, `FxRateCaptured`.

**Command Execution Behavior:**

- **C39 — UpdateTaxes:** Time-effective. If a current row exists, sets its `endDate` to the new row's `startDate` and inserts the new row. Emits `TaxesUpdated`. Analytics invalidates caches.
- **C40 — UpdateFeesConfiguration:** Same time-effective pattern as C39. Partial update across `gatewayFees[]`, `checkoutFees[]`, `shippingFee`. Emits `FeesConfigurationUpdated`.
- **C41 — CreateOperationalCost / C42 — UpdateOperationalCost / C43 — DeleteOperationalCost / C44 — ToggleOperationalCostStatus:** As in §3.
- **C45 — CreateWarrantyReserve / C46 — UpdateWarrantyReserve / C47 — DeleteWarrantyReserve:** As in §3.
- **C48 — CaptureFxRates:** System cron, hourly. Inserts new `FxRate` rows. **Never overwrites** an existing row for the same `(fromCurrency, toCurrency, startDate)`. Emits `FxRateCaptured` per inserted row.

---

### BC9: Analytics

**Responsibility:** Owns the read-side of the entire system. **No materialized read models are in scope for this iteration** — every query is served directly against canonical tables joined with merchant aggregates. Owns the `Goal` aggregate. Implements: multistore queries (every read accepts `storeIds: string[]`), per-currency aggregation pattern (intermediate `MonetaryByCurrency` map → Store reporting currency at the end via date-effective FxRate), and the **single discriminated `Chart` read** that replaces the multiple chart endpoints in v1.
**Ubiquitous Language:** ChartType, Chart, DashboardOverview, ProfitMargin, Goal, GoalProgress, ReportingCurrency, EffectiveFxRate, MonetaryByCurrency, ForcePaidOrders, TimezoneMode.
**Classification:** **Core**.

**Aggregates:**
- `Goal` (merchant aggregate) — `id`, `storeId`, `storeIntegrationId?` (optional scope), `type: GoalType` (`REVENUE` | `PROFIT`), `targetAmount: MonetaryAmount`, `startDate`, `endDate`, `createdAt`, `disabledAt?`.

**Reads (served directly — no projections):**
- `Chart` (single discriminated endpoint): `chartType` ∈ {`REVENUE`, `REVENUE_PER_SHIFT`, `SALES_PER_WEEKDAY`, `SALES_PER_HOUR`, `SALES_PER_REGION`}; response shape is a discriminated union per `chartType`.
- `DashboardOverview`, `ProductPerformanceReport`, `ProfitMarginReport`, `GoalsList`, `AdminUserLookup`, `AdminStoreSnapshot`.

**Screens:** T30, T31, T32, T33, T34, T35, T36.
**Commands:** C49–C52.

**Published Events:**
- `GoalCreated`, `GoalUpdated`, `GoalDeleted`. (No event from reads.)

**Integration Events Consumed (event-driven cache invalidation only; no projection writes):**
- From Sales: `OrderUpdated`, `OrderOverridden`.
- From Catalog: `ProductCostCreated`/`Updated`/`Deleted`.
- From Marketing: `AdSpendRecorded`, `CampaignProductBindingCreated`/`Removed`.
- From Finance: `TaxesUpdated`, `FeesConfigurationUpdated`, `OperationalCostRecorded`/`Updated`/`Deleted`/`StatusToggled`, `WarrantyReserveCreated`/`Updated`/`Deleted`, `FxRateCaptured`.
- From Tracking: `PixelEventRecorded` (funnel view).
- From Integration: `StoreIntegrationDataWipeRequested` (cascade-clean cached aggregates).

**Command Execution Behavior:**

- **C49 — CreateGoal:** Validates `targetAmount.amountCents > 0` and `endDate > startDate`. Emits `GoalCreated`.
- **C50 — UpdateGoal:** Partial update on `targetAmount`, `endDate`. Cannot change `type` or `startDate` of a Goal that has already begun.
- **C51 — DeleteGoal:** Soft-delete. Emits `GoalDeleted`.
- **C52 — DuplicateLastGoal:** Finds the most recent Goal; copies `type` and `targetAmount`; shifts `startDate` to follow previous `endDate + 1 day`. Emits `GoalCreated`.

---

### BC10: Notifications

**Responsibility:** Owns the `Notification` aggregate and the delivery pipeline (push via FCM/APN, email). Reads `UserPreferences.dailyNotificationsEnabled` to gate the daily digest cron. Deduplicates identical content within a sliding window.
**Ubiquitous Language:** Notification, NotificationDelivery, NotificationCategory, NotificationOrigin, DailyDigest, ContentHash, DedupeWindow.
**Classification:** **Support**.

**Aggregates:**
- `Notification` — `id`, `storeId?`, `title`, `content`, `category: NotificationCategory`, `origin: NotificationOrigin`, `important: boolean`, `pushEnabled: boolean`, `emailEnabled: boolean`, `contentType: string`, `payload?: Record<string, unknown>`, `scheduledAt?`, `createdAt`, `createdByUserId?`.
- `NotificationDelivery` — `id`, `notificationId`, `userId`, `channel: NotificationChannel`, `deliveredAt?`, `failedAt?`, `failureReason?`, `readAt?`.

**Screens:** T37.
**Commands:** C53–C55.

**Published Events:**
- `NotificationSent`, `NotificationDelivered`, `NotificationDeliveryFailed`, `NotificationRead`, `DailyDigestSent`.

**Integration Events Consumed:**
- From Identity: `FcmTokenRegistered`, `FcmTokenUnregistered`, `UserPreferencesUpdated`.
- From Sales (go-worker outbox): `OrderUpdated` (optional per-Store per-order push notification).
- From Integration: `IntegrationHandshakeFailed` (sync-error notification).
- From Tenancy: `StoreMemberInvited` (invitation email).

**Command Execution Behavior:**

- **C53 — SendNotification:** Dedupe on `(userId, sha256(title+content+payload))` within 15 minutes. Dispatch per channel.
- **C54 — TriggerDailyDigest:** Hourly cron. For each User where current UTC hour = 09:00 in `UserPreferences.timezone` AND `UserPreferences.dailyNotificationsEnabled = true`: fetch primary Store's previous-day metrics from canonical tables (converted to `UserPreferences.notificationCurrency` via FxRate), render template, dispatch. Skips users with the flag off. Admin escape hatch (`runForUserId`) bypasses the flag.
- **C55 — MarkNotificationRead:** Sets `readAt`. Idempotent. Emits `NotificationRead` only on first read.

---

### BC11: Billing

**Responsibility:** Owns BK Dash's own SaaS subscription model — what the merchant pays BK Dash to use the platform. **Plans are not persisted** — `PlanTier` is an enum, `PlanFeature` is an enum, and the quota matrix `PlanQuotas[tier][feature] → number | "UNLIMITED"` is a code constant. The `Subscription` aggregate is intentionally thin — most lifecycle state (`active`, `cancelled`, `expirationDate`) is **derived from the persisted event stream**, not stored as aggregate columns. `SubscriptionPayment` is **not** an aggregate; payments are persisted as `SubscriptionEvent` rows. Billing-platform webhooks (Kiwify, etc.) land directly on the TS API.
**Ubiquitous Language:** PlanTier, PlanFeature, PlanQuotas (const), Subscription, SubscriptionEvent, BillingPlatform, ExternalSubscriptionId, StoreCredit.
**Classification:** **Support**.

**Aggregates:**
- `Subscription` — `id`, `userId`, `externalSubscriptionId` (the billing-platform-side ID — mutable via `ChangeExternalSubscription`), `platform: BillingPlatform` (`KIWIFY` | `OTHER`), `tier: PlanTier`, `period: PlanPeriod`, `expirationDate`, `createdAt`. **No `planId`** (Plans are code-consts). **No `active`, `renew`, `activatedAt`, `cancelledAt`, `disabledAt`** — all derived from the event stream.
- `SubscriptionEvent` — `id`, `subscriptionId`, `eventType: SubscriptionEventType` (`SUBSCRIPTION_CREATED` | `PAYMENT_SUCCEEDED` | `PAYMENT_FAILED` | `PAYMENT_REFUNDED` | `SUBSCRIPTION_CANCELLED` | `SUBSCRIPTION_REACTIVATED` | `EXTERNAL_SUBSCRIPTION_CHANGED`), `externalEventId` (unique per platform), `payload: Record<string, unknown>`, `receivedAt`. Append-only.

**Code constants (not aggregates):**
- `PLAN_QUOTAS: Record<PlanTier, Record<PlanFeature, number | "UNLIMITED">>` — confirmed from backend-old:
  - `BASIC.STORE_AMOUNT = 1`, `INTERMEDIATE = 3`, `ADVANCED = 5`, `UNLIMITED = "UNLIMITED"`
  - Other PlanFeatures TBD (carried over from backend-old as needed)

**Screens:** T38, T39.
**Commands:** C56, C57.

**Published Events:**
- `SubscriptionEventReceived` (every webhook produces one), `SubscriptionPaymentReceived`, `SubscriptionActivated` (derived — first successful payment), `SubscriptionCancelled` (derived — cancel webhook), `SubscriptionExternalChanged`.

**Integration Events Consumed:**
- (none — Billing is the upstream for Tenancy quota; nothing flows into it from other BCs)

**Integration Events Published (to Tenancy):**
- `shared.SubscriptionQuotaUpdated { userId, tier }` — Tenancy listens to enforce limits at `CreateStore`. The actual quota value is looked up in `PLAN_QUOTAS[tier]` on read.

**Command Execution Behavior:**

- **C56 — HandleBillingWebhook:** Receives a webhook from Kiwify (or another billing platform). The platform-specific mapper:
  - Extracts internal `subscriptionId` from the UTM `s1` payload (Kiwify convention).
  - Maps the product name keyword to `PlanTier` (`"1"` → `BASIC`, `"3"` → `INTERMEDIATE`, `"5"` → `ADVANCED`, `"ilimitadas"` → `UNLIMITED`).
  - Appends a `SubscriptionEvent` row with the canonical `eventType`.
  - Updates `Subscription.expirationDate` based on event type + plan period.
  - Emits canonical events (`SubscriptionEventReceived`, plus derived `SubscriptionActivated`/`Cancelled`/`PaymentReceived` as appropriate).
  - Publishes `shared.SubscriptionQuotaUpdated`.
- **C57 — ChangeExternalSubscription:** Updates `Subscription.externalSubscriptionId` to the new ID. Resets `expirationDate` based on the new tier. Appends a `SubscriptionEvent { eventType: "EXTERNAL_SUBSCRIPTION_CHANGED" }`. Emits `SubscriptionExternalChanged`. Publishes `shared.SubscriptionQuotaUpdated`.

---

## 5. Context Mapping

### 5.1 Context Map

```
                  ┌────────────────────────────────────────────────────────┐
                  │                  EXTERNAL SYSTEMS                      │
                  │                                                        │
                  │  Sales platforms:  Shopify  Nuvem Shop  CartPanda      │
                  │                    Yampi    Kiwify                     │
                  │  Payment:          Stripe                              │
                  │  Marketing:        Meta  Google Ads  TikTok            │
                  │  Billing:          Kiwify (subscription)               │
                  │  FX:               Currency API                        │
                  │  Notifications:    Firebase  Email provider            │
                  │                                                        │
                  └─┬──────────────────┬──────────────────────┬────────────┘
                    │                  │                      │
        sync webhooks│                  │ OAuth callback URL   │ subscription
        + polling    │                  │ (TS hosts redirect)  │ webhooks
                    │                  │                      │
                    ▼                  ▼                      ▼
   ┌────────────────────────────┐  ┌────────────────────────────────────┐
   │  go-worker (Go, sqlc)      │  │  TS API (Bun + Elysia)             │
   │                            │  │                                    │
   │  • Webhook intake (sync)   │  │  • OAuth flows                     │
   │  • Provider polling        │  │  • Credential vault                │
   │  • Provider mappers        │  │  • Subscription webhook intake     │
   │  • Idempotent UPSERT       │  │  • Domain aggregates (override,    │
   │  • Outbox publish          │  │    cost, manual entry, tax/fees,   │
   │  • Marketing pollers       │  │    notification, billing)          │
   │  • Pixel event intake      │  │  • Query layer (canonical + over.) │
   │                            │  │  • Notification fan-out (FCM/email)│
   │  Writes Postgres directly  │◄─┼──── HTTP (handshake, sync,         │
   │  Emits Kafka outbox events │  │     reconcile, reintegrate)        │
   │                            │  │                                    │
   └─┬──────────────────────────┘  └─┬──────────────────────────────────┘
     │ Kafka topics                  │
     │ *.updated, *.recorded,        │
     │ integration.progress_updated, │ same Postgres database
     │ *.sync                        │ TS owns migrations + schema
     ▼                                ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │                       PostgreSQL (single DB)                         │
   │                                                                      │
   │  Canonical tables (Go-written via sqlc; TS reads):                   │
   │    orders, order_lines, order_transactions, carts, products,         │
   │    product_variants, campaigns, ad_sets, ads, ad_spend, pixel_events│
   │                                                                      │
   │  Merchant aggregates (TS-written via Drizzle; Go does not touch):    │
   │    users, user_preferences, fcm_registration_tokens,                 │
   │    stores, store_preferences, store_memberships,                     │
   │    store_integrations, integration_credential_secrets,               │
   │    marketing_ad_accounts, marketing_business_accounts,               │
   │    order_overrides, product_costs (+ options + items),               │
   │    campaign_product_bindings, manual ad_spend rows (in same table),  │
   │    taxes, fees_configurations, operational_costs, warranty_reserves, │
   │    fx_rates,                                                         │
   │    goals, notifications, notification_deliveries,                    │
   │    subscriptions, subscription_events                                │
   │                                                                      │
   └──────────────────────────────────────────────────────────────────────┘
```

### 5.2 Context Relationships

| Upstream (U) | Downstream (D) | Relationship | Description |
|---|---|---|---|
| Identity | Tenancy | **Customer / Supplier** | Tenancy reacts to `UserRegistered` (no auto-provision; just enables future `CreateStore`). |
| Identity | Notifications | **Customer / Supplier** | Notifications consumes `FcmTokenRegistered`, `UserPreferencesUpdated` to maintain delivery routing. |
| Billing | Tenancy | **Customer / Supplier (Published Language: `shared.SubscriptionQuotaUpdated`)** | Tenancy enforces `STORE_AMOUNT` quota at `CreateStore` using `PLAN_QUOTAS[subscription.tier]`. |
| Tenancy | Integration | **Customer / Supplier** | Integration scopes all `StoreIntegration` rows by `storeId`. Reacts to `StoreDisabled`/`StoreEnabled` to flip integration `active`. |
| Tenancy | Sales, Catalog, Marketing, Tracking, Finance, Analytics | **Customer / Supplier** | Every domain context scopes by `storeId`. Reacts to `StoreDisabled` to halt ingest/queries. |
| Integration | go-worker | **Customer / Supplier (HTTP)** | TS HTTP-calls go-worker `/integrations/handshake`, `/sync`, `/marketing/reconcile/<platform>` with credentials. |
| go-worker | Sales, Catalog, Marketing, Tracking | **Open-Host Service / Published Language (Kafka outbox)** | go-worker publishes `OrderUpdated`, `ProductUpdated`, `VariantUpdated`, `CampaignUpdated`, `AdSpendRecorded`, `PixelEventRecorded`, `CartAbandoned`, `OrderTransactionRecorded`/`Refunded`/`Disputed`. TS contexts consume to invalidate caches and trigger downstream side effects. |
| go-worker | All TS contexts | **Customer / Supplier (Kafka topic)** | go-worker publishes `integration.progress_updated`. TS forwards to the frontend (SSE/WebSocket TBD). |
| Sales | Analytics | **Customer / Supplier** | Analytics consumes `OrderUpdated`, `OrderOverridden` to invalidate query caches. |
| Catalog | Analytics | **Customer / Supplier** | Analytics consumes `ProductCostCreated`/`Updated`/`Deleted`. |
| Marketing | Analytics | **Customer / Supplier** | Analytics consumes `AdSpendRecorded`, `CampaignProductBindingCreated`/`Removed`, `MarketingReconciliationCompleted`. |
| Finance | Analytics | **Customer / Supplier** | Analytics consumes Taxes/Fees/OperationalCost/WarrantyReserve/FxRate events to recompute profit margin. |
| Tracking | Sales | **Customer / Supplier** | Sales handler links `Cart` → `Order` on `PixelEventRecorded` (CHECKOUT_COMPLETED with matching cartToken). |
| Sales, Catalog, Marketing, Tracking | Finance | **Conformist** | These contexts use `FxRate` and `MonetaryAmount` from Finance's published language. |
| Sales, Integration, Tenancy | Notifications | **Customer / Supplier** | Notifications consumes `OrderUpdated`, `IntegrationHandshakeFailed`, `StoreMemberInvited`. |

### 5.3 Data Flow Between Contexts (Summary)

```
  ╔═══════════════════════════════════════════════════════════════════════╗
  ║                          INBOUND DATA                                 ║
  ╚═══════════════════════════════════════════════════════════════════════╝

  Provider sync webhooks ──► go-worker
    (Shopify, Nuvem Shop, CartPanda, Yampi, Meta, Google, TikTok, Stripe)
                              │
                              │ 1. Map payload → canonical
                              │ 2. UPSERT Postgres (PK = UUIDv5(platform:externalId))
                              │ 3. Outbox publish to Kafka
                              ▼
                       Kafka topics:
                         order.updated, product.updated, variant.updated,
                         campaign.updated, ad.updated, ad_spend.recorded,
                         pixel_event.recorded, cart.abandoned,
                         order_transaction.recorded, integration.progress_updated
                              │
                              ▼
                       TS API contexts subscribe:
                         Sales       → ProductCost reconciliation,
                                       Notification fan-out, cache invalidation
                         Catalog     → cache invalidation
                         Marketing   → cache invalidation
                         Tracking    → Cart↔Order linking
                         Analytics   → cache invalidation
                         Notifications → push/email dispatch

  Billing platform webhooks (Kiwify, etc.) ──► TS API directly
                              │
                              │ → Billing.HandleBillingWebhook
                              │   → SubscriptionEvent persisted
                              │   → shared.SubscriptionQuotaUpdated
                              │
                              ▼
                            Tenancy
                              (refresh quota cache)

  ╔═══════════════════════════════════════════════════════════════════════╗
  ║                         OUTBOUND COMMANDS                             ║
  ╚═══════════════════════════════════════════════════════════════════════╝

  TS API → go-worker (HTTP, synchronous):
    POST /integrations/handshake { platform, credentials }       (ConnectIntegration)
    POST /sync { storeIntegrationId, credentials, pipelines[] }   (TriggerReintegration)
    POST /marketing/reconcile/<platform> { credentials, ... }     (dashboard-triggered)

  TS API → external systems:
    Email provider (notifications, password reset, invitations)
    Firebase FCM/APN (push notifications)
    BetterAuth (sessions)

  ╔═══════════════════════════════════════════════════════════════════════╗
  ║                       MERCHANT WRITE FLOWS                            ║
  ╚═══════════════════════════════════════════════════════════════════════╝

  Merchant UI → TS API:
    OrderOverride → OrderOverridden → Analytics cache invalidation
    ProductCost → ProductCost* → Analytics
    Manual AdSpend → AdSpendRecorded(MANUAL) → Analytics
    Taxes / FeesConfiguration → *Updated → Analytics
    Goal → Goal* → (no consumer; rendered directly in GoalsList)

  ╔═══════════════════════════════════════════════════════════════════════╗
  ║                         SCHEDULED FLOWS                               ║
  ╚═══════════════════════════════════════════════════════════════════════╝

  Hourly:  CaptureFxRates (TS) → FxRateCaptured
           ReconcileMarketingAccounts (go-worker cron) → MarketingReconciliationCompleted
           TriggerDailyDigest (TS) → DailyDigestSent (per User at 09:00 local)
```

---

## Design Decisions — Canonical Projection + Override

### Principle: "Provider data is sacred. Merchant data is separate. Go writes the canonical; TS owns the rest."

The single most important architectural decision in BK Dash v2 is that **canonical entities synced from providers are written exclusively by the Go sync worker**, never by the TS API. Go receives webhooks, polls providers, performs idempotent UPSERTs into Postgres, and publishes outbox events to Kafka. The TS API consumes those events for downstream side effects (cost reconciliation, notification fan-out, query cache invalidation), but the canonical write is Go's alone. Merchant configuration — overrides, costs, manual entries, tax profiles, fee configurations — lives in **TS-owned aggregates** that are joined with the canonical data at query time.

### Why this matters

1. **Single writer per table.** Concurrency reasoning is trivial when only one service writes each canonical table.
2. **Replayability.** Go retains raw provider payloads; if a mapper has a bug, replaying the payload converges to the correct canonical state.
3. **Audit.** "Why does this Order show as PAID when the provider reports UNPAID?" → look at the `OrderOverride` row. The provenance is structurally clear.
4. **Provider semantics stay pure.** Reasoning about a Shopify Order means looking at one table written by one service from one provider.
5. **Reconnect & resume.** `OrderOverride` rows are pinned by `(orderId, storeIntegrationExternalId)` — disconnect + reconnect preserves all merchant configuration.

### Pattern Shapes

```
SHAPE A — Canonical (Go-written) + typed Override (TS-written) — applies to: Order
─────────────────────────────────────────────────────────────────────────────────
  Order                              (Go-written, UPSERT by deterministic ID)
    └─ events: OrderUpdated, OrderTransactionRecorded/Refunded/Disputed,
              CartAbandoned

  OrderOverride                      (TS-written, merchant aggregate)
    └─ pinned by (orderId, storeIntegrationExternalId)
    └─ fields: OrderOverrideFields = typed { paymentMethod?, paymentStatus?,
              revenue?, productCostByLine?, shipping?, fees?, taxes? }
    └─ event: OrderOverridden { orderId, changedFields }

  Query: OrderProjection = Order ⊕ OrderOverride (joined at query time)

SHAPE B — Canonical (Go-written) + Auxiliary entity (TS-written) — Product+ProductCost
─────────────────────────────────────────────────────────────────────────────────
  Product / ProductVariant           (Go-written canonical)
    └─ tags array is the ONE exception: merchant-owned facet on canonical

  ProductCost                        (TS-written merchant aggregate)
    └─ independent lifecycle from Product
    └─ scoped to (variantIds[], storeIntegrationId, dateRange, qty, country, currency)
    └─ joined at query time to compute COGS per order line

SHAPE C — Pure canonical (Go-written) — applies to: Cart, Campaign, AdSet, Ad,
                                                    PixelEvent, Customer-data-on-Order
─────────────────────────────────────────────────────────────────────────────────
  No override or auxiliary entity exists.
  Customer information is embedded directly on Order (no Customer aggregate at all).

SHAPE D — Unified canonical + manual via type discriminator — applies to: AdSpend
─────────────────────────────────────────────────────────────────────────────────
  AdSpend                            (single aggregate, both Go and TS write)
    └─ adSpendType: "AUTOMATIC"     (Go-written from provider polling)
    └─ adSpendType: "MANUAL"        (TS-written from merchant entry)
    └─ Manual rows have null adAccountExternalId / campaignExternalId, groupBy=DAILY
    └─ Same downstream attribution path; analytics treats both uniformly
```

### Key Rules

1. **Go is the only writer of canonical tables.** TS must never `UPDATE` an `Order`, `Product`, `Variant`, `Campaign`, `AdSet`, `Ad`, automatic `AdSpend`, `Cart`, or `PixelEvent` row.
2. **`Product.tags`** is the single explicit exception — merchant-owned and surfaced via dedicated commands.
3. **Overrides are pinned by `storeIntegrationExternalId`,** not by surrogate key. Re-ingest of the same Order under the same StoreIntegration always re-attaches.
4. **No Customer aggregate.** Customer information (email, name, phone, shipping address) is embedded on Order. If we later need a Customer view, we materialize it via Analytics — not as a write-side aggregate.
5. **Reads merge at query time.** Every read that surfaces a merchant-facing view joins canonical + override + auxiliary tables. No materialized "combined" table for write-side use.

---

## Design Decisions — Deterministic IDs

### Principle: "If two systems see the same provider entity, they compute the same ID."

### Format

```typescript
// Every canonical row's primary key:
const id = uuidV5(BK_DASH_NAMESPACE, `${platform}:${externalId}`);

// Examples (illustrative — actual values are 128-bit UUIDs):
//   UUIDv5("SHOPIFY:8123456789")              → 01HF3KQR8M2J9V3PNXBYC1WAD4
//   UUIDv5("NUVEM_SHOP:42")                   → 01HF3LV4XK7T8R3W2QYBZC1NHM
//   UUIDv5("META:120243771350920047")         → 01HF3MX9P2C4N7K8H5JBYZQAR3
//   UUIDv5("KIWIFY:acme.myshopify.com")       → 01HF3NW3R6T8V2K9L7HMBCDXYZ

const BK_DASH_NAMESPACE = "<fixed UUIDv4, declared once in code>";
```

### Where this applies

- `Order.id`, `OrderLine.id`, `Cart.id`, `OrderTransaction.id` — deterministic from `(platform, externalId)`.
- `Product.id`, `ProductVariant.id` — deterministic.
- `Campaign.id`, `AdSet.id`, `Ad.id` — deterministic.
- `AdSpend.id` (AUTOMATIC) — deterministic from `(platform, adAccountExternalId, campaignExternalId, startDate, groupBy)`. `AdSpend.id` (MANUAL) — UUIDv7 (no provider source).
- `PixelEvent.id` — UUIDv7 (append-only, no natural key).
- `StoreIntegration.id` — deterministic from `(platform, externalId)`. Same Shopify shop reconnected = same row.
- All TS-owned merchant aggregates use UUIDv7 surrogate keys.

### Why

1. **No duplicate rows.** Re-ingesting the same Order twice always resolves to the same primary key — UPSERT is correct by construction.
2. **Cross-system join keys.** TS and Go derive the same `Order.id` independently from the provider's `externalId` — no need to query the database to "look up the internal ID".
3. **Re-connect resilience.** If a merchant disconnects a Shopify integration and reconnects the same shop, the new `StoreIntegration` row has the same `id` as the prior one — orphan Orders / Products are re-attached automatically.

---

## Design Decisions — Multi-Currency & Per-Currency Aggregation

### Principle: "Store native. Aggregate per-currency. Convert once at the end."

### Currency flow through the system

```
  Provider reports:  Order { total: 12999 BRL, externalCreatedAt: "2026-05-21" }
                              │
                              ▼
  go-worker stores:  Order { total: { amountCents: 12999, currency: "BRL" } }
                              │
                              ▼
  Merchant queries:  "Show me revenue across stores X, Y, Z (multistore) in USD for May"
                              │
                              ▼
  Analytics query layer:
    1. Sum orders per currency → intermediate { "BRL": 1249900, "USD": -50000, "EUR": 80000 }
       (negative = manual override or refund deduction)
    2. For each currency in the intermediate, look up FxRate effective at the
       relevant transaction date.
    3. Convert each currency total → Store reportingCurrency, sum.
    4. Return: { total: { amountCents: 250200, currency: "USD" } }
```

### Published Language

`CurrencyCode`, `MonetaryAmount`, `MonetaryByCurrency`, `FxRate`, and `FxRateSource` are defined in §7.0 as the single source of truth and referenced from every BC. Key shapes:

- `MonetaryAmount { amountCents: number; currency: CurrencyCode }` — always cents, never floats; currency is part of the value, not a sibling field.
- `MonetaryByCurrency = Partial<Record<CurrencyCode, number>>` — intermediate aggregation shape held by Analytics handlers, NOT persisted. Values may be negative.
- `FxRate { fromCurrency, toCurrency, rate, source, startDate }` — append-only; rows never overwritten; effective from `startDate` until the next-newer row.

### Key Rules

1. **Storage is native.** Brazilian Order → `{ 12999, "BRL" }`. Never converted on ingest.
2. **Intermediate aggregates use `MonetaryByCurrency`.** Aggregation across many rows of different currencies preserves the per-currency breakdown until the final conversion step. Values can be **negative** (override deductions, refunds).
3. **FxRate is date-effective.** For any row, the rate is the newest `FxRate` whose `startDate <= row.relevantDate` for the relevant pair. If no rate found (cold start), return the amount in its native currency and flag.
4. **FxRate is append-only.** New rates inserted hourly; existing `(pair, startDate)` rows are never overwritten.
5. **`StorePreferences.reportingCurrency` is immutable once Orders are ingested.** Switching invalidates historical reports.
6. **`UserPreferences.notificationCurrency` is per-user.** Two users in the same Store can receive daily digests in different currencies, all converted from the same canonical data.

---

## Design Decisions — Idempotent Ingest

### Principle: "Replaying any provider event converges to the same state."

### Idempotency keys (Go-owned UPSERTs)

| Aggregate | Idempotency Key (PK is derived) |
|---|---|
| Order | `UUIDv5(platform, externalId)` |
| OrderTransaction | `(orderId, externalId)` (nested within Order) |
| Cart | `UUIDv5(platform, externalId)` |
| Product | `UUIDv5(platform, externalId)` |
| ProductVariant | `UUIDv5(platform, externalId)` |
| Campaign | `UUIDv5(platform, externalId)` |
| AdSet | `UUIDv5(platform, externalId)` |
| Ad | `UUIDv5(platform, externalId)` |
| AdSpend (AUTOMATIC) | `UUIDv5(platform, adAccountExternalId + campaignExternalId + startDate + groupBy)` |
| PixelEvent | UUIDv7 (append-only — duplicates from same browser session are valuable signal) |
| FxRate | `(fromCurrency, toCurrency, startDate)` — never overwrite |

### Key Rules

1. **No-op detection.** Go's UPSERT compares incoming fields to current row state; if nothing changed, the row is touched but no `*Updated` event is emitted. Replaying noop webhooks doesn't flood downstream consumers.
2. **`isNew` flag on events.** Every `*Updated` event carries `isNew: boolean` so subscribers can distinguish first sight from refresh without computing the diff themselves.
3. **Order events are unified.** v1's split (`OrderIngested` / `OrderUpdated` / `OrderCancelled` / `OrderRefunded`) collapses into a single `OrderUpdated` carrying `changedFields` — consumers branch on the change set, not the event name.
4. **`storeIntegrationId` is implicit.** Because IDs are deterministic from `(platform, externalId)`, two different StoreIntegrations connecting the same shop resolve to the **same row**. This is intentional: it lets re-connect attach old data. To distinguish "which integration last sync'd this row", the row carries `storeIntegrationId` as a mutable column updated on every UPSERT.

---

## Design Decisions — Sync Engine Separation

### Principle: "Network for sync = Go. Domain + auth + queries + subscription = TS."

```
┌─────────────────────────────────┐         ┌─────────────────────────────────┐
│   go-worker (Go + sqlc)         │         │   TS API (Bun + Elysia)         │
│                                 │         │                                 │
│  • Sync webhook intake          │ HTTP    │  • OAuth flows + credential     │
│  • Provider polling             │ ◄────►  │    vault                        │
│  • OAuth client (vendor side    │         │  • Subscription webhook intake  │
│    only — no token persistence) │         │    (Kiwify, etc.)               │
│  • Mappers (provider→canonical) │         │  • Domain aggregates (override, │
│  • Idempotent UPSERT            │ Kafka   │    cost, tax, fees, etc.)       │
│  • Transactional outbox publish │ ────►   │  • Query layer                  │
│  • Marketing pollers (cron)     │         │  • Notification fan-out         │
│  • Pixel event intake           │         │  • Better Auth sessions         │
│                                 │         │                                 │
└─────────────────────────────────┘         └─────────────────────────────────┘
            │                                            │
            └────────────┬───────────────────────────────┘
                         ▼
                ┌─────────────────┐
                │  PostgreSQL     │
                │                 │
                │  Go writes:     │  canonical tables (orders, products, …)
                │  TS writes:     │  merchant aggregates + auth + billing
                │  Both read:     │  full database
                └─────────────────┘
```

### Key Rules

1. **Sync webhooks (Shopify, Nuvem Shop, CartPanda, Yampi, etc.) land on go-worker.** TS does not host these endpoints.
2. **Subscription webhooks (Kiwify, etc.) land on TS.** Go does not host these endpoints — billing concerns stay with the domain that owns Subscription.
3. **TS owns OAuth flow.** Go has no OAuth callback URL, no token refresh logic, no credential persistence. Go receives validated credentials per request.
4. **TS↔Go is HTTP for commands, Kafka for events.** Commands (sync, handshake, reconcile) are TS→Go HTTP, synchronous. Events (UPSERT outcomes, progress) are Go→Kafka, async.
5. **Same Postgres database.** TS owns migrations + Drizzle schema definitions. Go uses sqlc against the same schema. No schema duplication; sqlc introspects from the TS-owned DDL.
6. **One writer per table.** Go writes canonical only; TS writes merchant aggregates only. Cross-cutting columns (e.g., `storeIntegrationId` on canonical) are updated by Go; merchant aggregates that reference canonical use FKs without writing through them.

---

## Design Decisions — Multi-Tenancy & Multistore Queries

### Principle: "Every aggregate is scoped to a Store. Queries accept many Stores at once."

### Key Rules

1. **`storeId` is the tenant boundary** on every domain aggregate (Identity-only aggregates excepted: User, UserPreferences, FcmRegistrationToken are scoped to `userId`).
2. **Multistore queries** — every analytics / list endpoint accepts a `storeIds: string[]` parameter. Server resolves which of those the user has membership for (intersect with `StoreMembership`) and queries only those. Response aggregates across the resolved set.
3. **Productivity is gone in v2** — no per-user-scoped domain aggregates remain; everything is store-scoped.
4. **`(userId, storeId, role)` context is resolved per request** by middleware. Use cases never accept `storeId` from request bodies; only from the resolved membership context.

---

## Design Decisions — Authorization

| Role | Capabilities |
|---|---|
| `OWNER` | Everything in the Store: profile/preferences, integrations, taxes & fees, members, financial settings; Store enable/disable. Always at least one OWNER per Store. |
| `ADMIN` | Same as OWNER except cannot delete the Store, cannot change other OWNERs' roles. |
| `MEMBER` | Read all Store data; create/edit OrderOverride, ProductCost, ManualAdSpend; cannot manage integrations, financial settings, members. |

Role gates are declared per command in §3 and enforced in middleware. No row-level ACLs beyond `storeId`. Admin endpoints (`x-admin-secret`) bypass roles but require the secret.

---

## Design Decisions — Provider Extensibility

### Principle: "Adding a new platform is mapper + schema + enum value — no domain change."

### Adding a new SalesPlatform (illustrative)

```
1. Add value to SalesPlatform enum in the TS SDK (e.g., "PERFECT_PAY")
2. Publish a Zod credential schema for the new platform via the SDK
3. go-worker: implement webhook mapper + polling client + handshake stub
4. go-worker: register the new platform in its sync-job module
   (no TS API code change required — the frontend now offers the new platform
    in its connect-integration form via the published Zod schema)
```

### Key Rules

1. **`Platform` is a sub-discriminated union** by integration type (`SalesPlatform | CheckoutPlatform | PaymentGatewayPlatform | MarketingPlatform`). Adding a new sales platform doesn't touch marketing code.
2. **Domain BCs do not import platform names.** A Sales handler consuming `OrderUpdated` never branches on `platform` — the payload shape is canonical. Provider quirks live only in go-worker's mappers.
3. **Credential field schemas live in the SDK as Zod.** The frontend imports the schema for the chosen platform and renders the form. No runtime `ProviderCatalogEntry` table.

---

## Design Decisions — Plans as Code Constants

### Principle: "Plans are deployable code, not data."

```typescript
// All defined in code; no DB persistence.
type PlanTier = "BASIC" | "INTERMEDIATE" | "ADVANCED" | "UNLIMITED";
type PlanPeriod = "MONTHLY" | "QUARTERLY" | "ANNUAL";
type PlanFeature = "STORE_AMOUNT" | "INTEGRATION_AMOUNT" | "DAILY_DIGEST" | /* ... */;

const PLAN_QUOTAS: Record<PlanTier, Record<PlanFeature, number | "UNLIMITED">> = {
  BASIC:        { STORE_AMOUNT: 1, INTEGRATION_AMOUNT: 2,  DAILY_DIGEST: 1, /* ... */ },
  INTERMEDIATE: { STORE_AMOUNT: 3, INTEGRATION_AMOUNT: 5,  DAILY_DIGEST: 1, /* ... */ },
  ADVANCED:     { STORE_AMOUNT: 5, INTEGRATION_AMOUNT: 10, DAILY_DIGEST: 1, /* ... */ },
  UNLIMITED:    { STORE_AMOUNT: "UNLIMITED", INTEGRATION_AMOUNT: "UNLIMITED", /* ... */ },
};
```

### Key Rules

1. **No Plan aggregate.** Plans are not entities; they're code constants. Changing a plan = deploy.
2. **`Subscription.tier` references the enum value.** No FK to a Plans table.
3. **Subscription lifecycle is event-derived.** `active`, `cancelled`, `expirationDate` come from the `SubscriptionEvent` stream — only `expirationDate` is denormalized onto `Subscription` for query convenience.
4. **`SubscriptionPayment` is not an aggregate.** Payments are `SubscriptionEvent` rows with `eventType: "PAYMENT_SUCCEEDED" | "PAYMENT_FAILED" | "PAYMENT_REFUNDED"`.

---

## Design Decisions — Charts Discriminated Union

### Principle: "One endpoint; many shapes; one schema."

### Shape

```typescript
// Single read controller. Query selects the chart; response varies by it.
type ChartType =
  | "REVENUE"
  | "REVENUE_PER_SHIFT"
  | "SALES_PER_WEEKDAY"
  | "SALES_PER_HOUR"
  | "SALES_PER_REGION";

type ChartInput = {
  chartType: ChartType;
  dateRange: DateRange;
  frequency: AnalyticsFrequency;
  storeIds: string[];
  productIds?: string[];
  forcePaidOrders?: boolean;        // chart-query param, NOT Store config
  timezoneMode: TimezoneMode;       // PER_STORE | UNIFIED
};

type ChartOutput =
  | { chartType: "REVENUE";           buckets: RevenueBucket[] }
  | { chartType: "REVENUE_PER_SHIFT"; buckets: ShiftBucket[] }
  | { chartType: "SALES_PER_WEEKDAY"; buckets: WeekdayBucket[] }
  | { chartType: "SALES_PER_HOUR";    buckets: HourBucket[] }
  | { chartType: "SALES_PER_REGION";  regions: RegionBucket[] };
```

### Key Rules

1. **One endpoint serves all chart types.** Reduces controller surface; matches the frontend's existing `/dashboard/graphs/income` pattern with `frequency` discriminator, generalized.
2. **`forcePaidOrders` is a query param.** Treating every UNPAID order as PAID is a *view choice* the merchant toggles per-chart — it does NOT belong on Store config.
3. **`timezoneMode`** lets the merchant choose per-store-local vs single unified-UTC bucketing for multistore reports.
4. **Money in chart buckets is `MonetaryByCurrency`** in the intermediate form (preserves per-currency breakdown); a sibling `totalInReportingCurrency: MonetaryAmount` carries the final converted figure.

---

## Bounded Contexts Summary

| Bounded Context | Screens | Commands | Core / Support |
|---|---|---|---|
| BC1: Identity | T01–T06 | C01–C11 | **Support** |
| BC2: Tenancy | T07–T10 | C12–C20 | **Core** |
| BC3: Integration | T11, T12 | C21–C25 | **Core** |
| BC4: Sales | T13, T14, T15 | C26 | **Core** |
| BC5: Catalog | T16–T19 | C27–C32 | **Core** |
| BC6: Marketing | T20–T22 | C33–C38 | **Core** |
| BC7: Tracking | T23, T24 | — (Go-owned) | **Support** |
| BC8: Finance | T25–T29 | C39–C48 | **Core** |
| BC9: Analytics | T30–T36 | C49–C52 | **Core** |
| BC10: Notifications | T37 | C53–C55 | **Support** |
| BC11: Billing | T38, T39 | C56, C57 | **Support** |

---

## 7. Technical Specification — Reads & Commands

> **Conventions:**
> - Optional fields marked with `?`
> - All IDs are `string` (deterministic `UUIDv5(platform, externalId)` for canonical entities; `UUIDv7` for merchant aggregates)
> - Dates in ISO 8601 (always `string`, never `Date`)
> - Monetary values always in cents (`amountCents: number`) — no floating point
> - Per-currency aggregates use `MonetaryByCurrency = Partial<Record<CurrencyCode, number>>`
> - Error codes in `SCREAMING_SNAKE_CASE`; enum values likewise
> - Discriminated unions preferred over optional field bags when shape varies by variant
> - Every type defined in 7.0 is referenced by name elsewhere — no anonymous duplicates

### 7.0 Global Enums & Shared Types

```typescript
// ─────────── Currency & Money ───────────

type CurrencyCode =
  | "ARS" | "AUD" | "BRL" | "CAD" | "CHF" | "CLP" | "COP" | "CZK" | "DKK"
  | "EUR" | "GBP" | "GTQ" | "HKD" | "HUF" | "JPY" | "MXN" | "NOK" | "NZD"
  | "PLN" | "RON" | "RUB" | "SEK" | "SGD" | "USD" | "ZAR";

type MonetaryAmount = {
  amountCents: number;
  currency: CurrencyCode;
};

type MonetaryByCurrency = Partial<Record<CurrencyCode, number>>; // amountCents per currency; values may be negative

type FxRate = {
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: number;
  source: FxRateSource;
  startDate: string; // effective from
};

type FxRateSource = "CURRENCY_API" | "MANUAL" | "PROVIDER_REPORTED";

// ─────────── Identity ───────────

type Role = "OWNER" | "ADMIN" | "MEMBER";

type NotificationCurrencyMode =
  | "SALE_CURRENCY"
  | "STORE_CURRENCY"
  | "CUSTOM_CURRENCY";

type FcmPlatform = "IOS" | "ANDROID" | "WEB";

// ─────────── Integration & Platform ───────────

type StoreIntegrationType =
  | "SALES_CHANNEL"
  | "CHECKOUT"
  | "PAYMENT_GATEWAY"
  | "MARKETING_PLATFORM";

type SalesPlatform = "SHOPIFY" | "NUVEM_SHOP" | "CART_PANDA" | "YAMPI" | "KIWIFY";
type CheckoutPlatform = "CART_PANDA" | "YAMPI";
type PaymentGatewayPlatform = "STRIPE";
type MarketingPlatform = "META" | "GOOGLE_ADS" | "TIKTOK";

type Platform =
  | { type: "SALES_CHANNEL";      platform: SalesPlatform }
  | { type: "CHECKOUT";           platform: CheckoutPlatform }
  | { type: "PAYMENT_GATEWAY";    platform: PaymentGatewayPlatform }
  | { type: "MARKETING_PLATFORM"; platform: MarketingPlatform };

type IntegrationCredentialField = {
  key: string;
  label: string;
  type: "TEXT" | "PASSWORD" | "OAUTH_TOKEN";
  required: boolean;
};

// ─────────── Sales ───────────

type PaymentStatus =
  | "PENDING"
  | "AUTHORIZED"
  | "PAID"
  | "PARTIALLY_PAID"
  | "UNPAID"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "VOIDED";

type PaymentMethod =
  | "CREDIT_CARD"
  | "DEBIT_CARD"
  | "PIX"
  | "BANK_SLIP"
  | "CASH"
  | "BANK_TRANSFER"
  | "DIGITAL_WALLET"
  | "OTHER";

type PaymentGateway =
  | "APPMAX"
  | "STRIPE"
  | "PAYPAL"
  | "SHOPIFY_PAYMENTS"
  | "MERCADOPAGO"
  | "PAGAR_ME"
  | "YEVER"
  | "UNKNOWN"
  | "DEFAULT";

type TransactionKind =
  | "AUTHORIZATION"
  | "CAPTURE"
  | "SALE"
  | "REFUND"
  | "VOID"
  | "CHARGEBACK";

type TransactionStatus = "PENDING" | "SUCCESS" | "FAILURE" | "ERROR";

type DisputeStatus =
  | "NONE"
  | "OPEN"
  | "UNDER_REVIEW"
  | "WON"
  | "LOST"
  | "ACCEPTED";

type OrderTransactionFeeType = "PROCESSING" | "EXCHANGE" | "UNKNOWN";

type OrderTransactionFee = {
  externalId: string;
  type: OrderTransactionFeeType;
  rate: number;
  fixed: MonetaryAmount;
  variable: MonetaryAmount;
};

type PostalAddress = {
  line1?: string;
  line2?: string;
  city?: string;
  province?: string;
  provinceCode?: string;
  zipCode?: string;
  country?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
  phoneNumber?: string;
};

type UtmTags = {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
};

type OrderLine = {
  id: string;
  productExternalId: string;
  variantExternalId: string;
  productId?: string;
  variantId?: string;
  title: string;
  variantTitle?: string;
  quantity: number;
  unitPrice: MonetaryAmount;
  discount: MonetaryAmount;           // per-line discount (sum across lines = Order.discountTotal)
  tax: MonetaryAmount;                // per-line tax (sum across lines = Order.taxTotal)
  allocatedTax: MonetaryAmount;       // proportional tax allocation for split scenarios
  totalPrice: MonetaryAmount;
};

type OrderTransaction = {
  id: string;
  externalId: string;
  kind: TransactionKind;
  status: TransactionStatus;
  amount: MonetaryAmount;
  processedAt: string;
  disputeStatus?: DisputeStatus;
  fees: OrderTransactionFee[];
};

type CartLine = {
  productExternalId: string;
  variantExternalId: string;
  productId?: string;
  variantId?: string;
  quantity: number;
  unitPrice: MonetaryAmount;
};

type OrderOverrideFields = {
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  revenue?: MonetaryAmount;
  productCostByLine?: { lineId: string; cost: MonetaryAmount }[];
  shipping?: MonetaryAmount;
  fees?: MonetaryAmount;
  taxes?: MonetaryAmount;
};

// ─────────── Catalog ───────────

type ProductStatus = "ACTIVE" | "ARCHIVED" | "DRAFT";
type ProductCostType = "SINGLE" | "MULTIPLE";
type QuantityModifier = "EQ" | "GT" | "GTE" | "LT" | "LTE";

type ProductCostOptionItemInput = {
  variantIds: string[];
  quantity: number;
  quantityModifier: QuantityModifier;
  unitCost: MonetaryAmount;
  shipping: MonetaryAmount;
};

type ProductCostOptionInput = {
  currency: CurrencyCode;
  country?: string;
  startDate: string;
  endDate?: string;
  shipping: MonetaryAmount;
  items: ProductCostOptionItemInput[];
};

type ProductCostOptionItem = ProductCostOptionItemInput & {
  id: string;
  variantsHash: string;
};

type ProductCostOption = {
  id: string;
  currency: CurrencyCode;
  country?: string;
  startDate: string;
  endDate?: string;
  shipping: MonetaryAmount;
  items: ProductCostOptionItem[];
};

// ─────────── Marketing ───────────

type CampaignStatus = "ACTIVE" | "PAUSED" | "ARCHIVED";

type AdSpendType = "AUTOMATIC" | "MANUAL";
type AdSpendGroupBy = "HOURLY" | "DAILY";

type ManualMarketingExpenseBinding = {
  productId?: string;
  variantId?: string;
};

// ─────────── Tracking ───────────

type PixelEventType =
  | "PAGE_VIEWED"
  | "PRODUCT_VIEWED"
  | "PRODUCT_ADDED_TO_CART"
  | "PRODUCT_REMOVED_FROM_CART"
  | "CART_VIEWED"
  | "CHECKOUT_STARTED"
  | "CHECKOUT_CONTACT_INFO_SUBMITTED"
  | "CHECKOUT_COMPLETED";

// ─────────── Finance ───────────

type TaxType = "NONE" | "PRESUMED_PROFIT" | "REAL_PROFIT";

type TaxDeductionType =
  | "NONE"
  | "PRODUCT_COST"
  | "PRODUCT_COST_AND_MARKETING";

type OperationalCostCategory =
  | "EMPLOYEE"
  | "APP"
  | "FOOD"
  | "RENT"
  | "ACCOUNTANT"
  | "REFUND"
  | "SHIPPING"
  | "TAKE_PROFIT"
  | "OTHER";

type OperationalCostRecurrency =
  | "ONCE"
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY"
  | "BIMESTER"
  | "TRIMESTER"
  | "SEMESTER"
  | "YEARLY"
  | "NONE";

type OperationalCostPaymentStatus =
  | "PAID"
  | "UNPAID"
  | "OVERDUE"
  | "CANCELLED";

type OperationalCostStatusEntry = {
  date: string;
  status: OperationalCostPaymentStatus;
};

type ShippingCostType =
  | "NONE"
  | "PAID_BY_CUSTOMER"
  | "AVERAGE_PER_ORDER"
  | "AVERAGE_PER_ITEM";

type ShippingCostValue =
  | { type: "NONE" }
  | { type: "PAID_BY_CUSTOMER" }
  | { type: "AVERAGE_PER_ORDER"; perOrder: MonetaryAmount }
  | { type: "AVERAGE_PER_ITEM";  perItem:  MonetaryAmount };

type GatewayFee = {
  platform: PaymentGateway;
  paymentMethod: PaymentMethod;
  percentage: number;
  fixed: MonetaryAmount[];
};

type CheckoutFee = {
  platform: CheckoutPlatform;
  rate: number;
};

type ShippingFee = {
  type: ShippingCostType;
  value: ShippingCostValue;
};

// ─────────── Analytics ───────────

type GoalType = "REVENUE" | "PROFIT";

type AnalyticsFrequency = "HOURLY" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

type ChartType =
  | "REVENUE"
  | "REVENUE_PER_SHIFT"
  | "SALES_PER_WEEKDAY"
  | "SALES_PER_HOUR"
  | "SALES_PER_REGION";

type TimezoneMode = "PER_STORE" | "UNIFIED";

type ChartSeriesPoint = {
  bucketStart: string;
  bucketEnd: string;
  total: MonetaryByCurrency;
  profit: MonetaryByCurrency;
  productCost: MonetaryByCurrency;
  marketingCost: MonetaryByCurrency;
  fees: MonetaryByCurrency;
  orderCount: number;
};

type RegionBucket = {
  countryCode: string;
  stateCode?: string;
  countryName: string;
  stateName?: string;
  orderCount: number;
  revenue: MonetaryByCurrency;
  revenueInReportingCurrency: MonetaryAmount;
};

// ─────────── Notifications ───────────

type NotificationCategory =
  | "ORDER_RECEIVED"
  | "PAYMENT_PROCESSED"
  | "SYNC_ERROR"
  | "FEATURE_ANNOUNCEMENT"
  | "DAILY_DIGEST"
  | "INTEGRATION_DISCONNECTED"
  | "INVITATION"
  | "OTHER";

type NotificationOrigin = "SYSTEM" | "ADMIN" | "SCHEDULER";

type NotificationChannel = "PUSH" | "EMAIL" | "IN_APP";

// ─────────── Billing ───────────

type PlanTier = "BASIC" | "INTERMEDIATE" | "ADVANCED" | "UNLIMITED";
type PlanPeriod = "MONTHLY" | "QUARTERLY" | "ANNUAL";
type BillingPlatform = "KIWIFY" | "OTHER";

type PlanFeature =
  | "STORE_AMOUNT"
  | "INTEGRATION_AMOUNT"
  | "DAILY_DIGEST"
  | "MULTI_USER"
  | "CSV_IMPORT"
  | "ADMIN_API";

type PlanQuota = number | "UNLIMITED";

type SubscriptionEventType =
  | "SUBSCRIPTION_CREATED"
  | "PAYMENT_SUCCEEDED"
  | "PAYMENT_FAILED"
  | "PAYMENT_REFUNDED"
  | "SUBSCRIPTION_CANCELLED"
  | "SUBSCRIPTION_REACTIVATED"
  | "EXTERNAL_SUBSCRIPTION_CHANGED";

// PLAN_QUOTAS is a code constant (not part of the API surface but referenced by the spec):
//   const PLAN_QUOTAS: Record<PlanTier, Record<PlanFeature, PlanQuota>>;
//   confirmed from backend-old MAX_INTEGRATION_SETS_PER_TIER:
//     BASIC.STORE_AMOUNT = 1, INTERMEDIATE = 3, ADVANCED = 5, UNLIMITED = "UNLIMITED"

// ─────────── Generic ───────────

type PaginationInput = {
  page: number;
  limit: number;
};

type SortOrder = "ASC" | "DESC";

type DateRange = {
  startDate: string;
  endDate: string;
};

type CsvImportRowResult = {
  rowNumber: number;
  status: "CREATED" | "UPDATED" | "SKIPPED" | "ERROR";
  errorMessage?: string;
};
```

---

### 7.1 Identity

#### Read — SignInPage (T01)

```typescript
type Input = void;
type Output = void; // stateless form
type Errors = never;
```

#### Read — SignUpPage (T02)

```typescript
type Input = {
  leadToken?: string;
};

type Output = {
  prefill?: {
    email: string;
    name?: string;
    phoneNumber?: string;
  };
};

type Errors =
  | "INVALID_LEAD_TOKEN";
```

#### Read — PasswordResetRequestPage (T03)

```typescript
type Input = void;
type Output = void;
type Errors = never;
```

#### Read — PasswordResetCompletePage (T04)

```typescript
type Input = {
  token: string;
};

type Output = {
  tokenValid: boolean;
  expiresAt?: string;
};

type Errors =
  | "INVALID_RESET_TOKEN"
  | "RESET_TOKEN_EXPIRED"
  | "RESET_TOKEN_ALREADY_USED";
```

#### Read — ProfileSettings (T05)

```typescript
type Input = void;

type Output = {
  id: string;
  email: string;
  name: string;
  pictureUrl?: string;
  fcmTokens: {
    id: string;
    platform: FcmPlatform;
    registeredAt: string;
    lastSeenAt: string;
  }[];
};

type Errors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED";
```

#### Read — UserPreferencesSettings (T06)

```typescript
type Input = void;

type Output = {
  userId: string;
  timezone: string;
  dailyNotificationsEnabled: boolean;
  notificationCurrency: CurrencyCode;
  notificationCurrencyMode: NotificationCurrencyMode;
};

type Errors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED";
```

#### Command — CaptureLead (C01)

```typescript
type Input = {
  email: string;
  name?: string;
  phoneNumber?: string;
};

type Output = void; // 204 No Content

type Errors =
  | "INVALID_EMAIL"
  | "VALIDATION_ERROR";

// Domain Events:
//   LeadCaptured { email, capturedAt, name?, phoneNumber? }    (event-only — no aggregate)
```

#### Command — SignUp (C02)

```typescript
type Input = {
  email: string;
  password: string;
  name: string;
  leadToken?: string;
};

type Output = {
  userId: string;
  sessionToken: string;
}; // 201 Created

type Errors =
  | "EMAIL_ALREADY_REGISTERED"
  | "PASSWORD_TOO_WEAK"
  | "INVALID_EMAIL"
  | "INVALID_LEAD_TOKEN"
  | "VALIDATION_ERROR";

// Domain Events:
//   UserRegistered { userId, email }
//   UserPreferencesCreated { userId }          (default preferences row)
//   (NO StoreCreated — user must explicitly call CreateStore subject to quota)
```

#### Command — SignIn (C03)

```typescript
type Input = {
  email: string;
  password: string;
};

type Output = {
  userId: string;
  sessionToken: string;
}; // 200 OK

type Errors =
  | "INVALID_CREDENTIALS"
  | "USER_DISABLED"
  | "VALIDATION_ERROR";

// Domain Events:
//   UserSignedIn { userId, signedInAt }
```

#### Command — SignOut (C04)

```typescript
type Input = void;
type Output = void; // 204 No Content

type Errors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED";

// Domain Events:
//   UserSignedOut { userId, signedOutAt }
```

#### Command — RequestPasswordReset (C05)

```typescript
type Input = {
  email: string;
};

type Output = void; // 204 No Content — always

type Errors =
  | "VALIDATION_ERROR";

// Domain Events:
//   PasswordResetRequested { userId, requestedAt }   (only if user exists)
```

#### Command — CompletePasswordReset (C06)

```typescript
type Input = {
  token: string;
  newPassword: string;
};

type Output = void; // 204 No Content

type Errors =
  | "INVALID_RESET_TOKEN"
  | "RESET_TOKEN_EXPIRED"
  | "RESET_TOKEN_ALREADY_USED"
  | "PASSWORD_TOO_WEAK"
  | "VALIDATION_ERROR";

// Domain Events:
//   PasswordReset { userId, resetAt }
```

#### Command — ChangePassword (C07)

```typescript
type Input = {
  currentPassword: string;
  newPassword: string;
};

type Output = void; // 204 No Content

type Errors =
  | "INVALID_CREDENTIALS"
  | "PASSWORD_TOO_WEAK"
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   PasswordChanged { userId, changedAt }
```

#### Command — UpdateProfile (C08)

```typescript
type Input = {
  name?: string;
  pictureUrl?: string;
};

type Output = void; // 204 No Content

type Errors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   ProfileUpdated { userId, changedFields }
```

#### Command — RegisterFcmToken (C09)

```typescript
type Input = {
  token: string;
  platform: FcmPlatform;
};

type Output = void; // 201 Created or 200 OK

type Errors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   FcmTokenRegistered { userId, tokenId, platform }
```

#### Command — UnregisterFcmToken (C10)

```typescript
type Input = {
  token: string;
};

type Output = void; // 204 No Content

type Errors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED";

// Domain Events:
//   FcmTokenUnregistered { userId, tokenId }
```

#### Command — UpdateUserPreferences (C11)

```typescript
type Input = {
  timezone?: string;
  dailyNotificationsEnabled?: boolean;
  notificationCurrency?: CurrencyCode;
  notificationCurrencyMode?: NotificationCurrencyMode;
};

type Output = void; // 204 No Content

type Errors =
  | "INVALID_TIMEZONE"
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   UserPreferencesUpdated { userId, changedFields }
```

---

### 7.2 Tenancy

#### Read — MyStores (T07)

```typescript
type Input = void;

type Output = {
  items: {
    storeId: string;
    name: string;
    pictureUrl?: string;
    reportingCurrency: CurrencyCode;
    role: Role;
    lastAccess: string;
    disabledAt?: string;
  }[];
  storeCredits: {
    tier: PlanTier;
    usedStores: number;
    maxStores: PlanQuota;
  };
};

type Errors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED";
```

#### Read — StoreSettings (T08)

```typescript
type Input = void;

type Output = {
  id: string;
  name: string;
  pictureUrl?: string;
  email?: string;
  phoneNumber?: string;
  createdAt: string;
  disabledAt?: string;
};

type Errors =
  | "STORE_NOT_FOUND"
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED";
```

#### Read — StorePreferencesSettings (T09)

```typescript
type Input = void;

type Output = {
  storeId: string;
  reportingCurrency: CurrencyCode;
  timezone: string;
  showStoreNameInNotifications: boolean;
  updatedAt: string;
};

type Errors =
  | "STORE_NOT_FOUND"
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED";
```

#### Read — StoreMembers (T10)

```typescript
type Input = void;

type Output = {
  members: {
    storeMembershipId: string;
    userId: string;
    email: string;
    name: string;
    pictureUrl?: string;
    role: Role;
    lastAccess: string;
    acceptedAt: string;
  }[];
  pendingInvitations: {
    storeMembershipId: string;
    email: string;
    role: Role;
    invitedAt: string;
  }[];
};

type Errors =
  | "STORE_NOT_FOUND"
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED";
```

#### Command — CreateStore (C12)

```typescript
type Input = {
  name: string;
  reportingCurrency: CurrencyCode;
  timezone: string;
  pictureUrl?: string;
};

type Output = {
  storeId: string;
}; // 201 Created

type Errors =
  | "STORE_QUOTA_EXCEEDED"
  | "NO_ACTIVE_SUBSCRIPTION"
  | "INVALID_TIMEZONE"
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   StoreCreated { storeId, name }
//   StoreMemberAdded { storeId, userId, role: "OWNER" }
//   StorePreferencesCreated { storeId, reportingCurrency, timezone }
```

#### Command — UpdateStoreSettings (C13)

```typescript
type Input = {
  name?: string;
  pictureUrl?: string;
  email?: string;
  phoneNumber?: string;
};

type Output = void; // 204 No Content

type Errors =
  | "STORE_NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   StoreSettingsUpdated { storeId, changedFields }
```

#### Command — UpdateStorePreferences (C14)

```typescript
type Input = {
  reportingCurrency?: CurrencyCode;
  timezone?: string;
  showStoreNameInNotifications?: boolean;
};

type Output = void; // 204 No Content

type Errors =
  | "STORE_NOT_FOUND"
  | "REPORTING_CURRENCY_LOCKED"
  | "INVALID_TIMEZONE"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   StorePreferencesUpdated { storeId, changedFields }
```

#### Command — InviteMember (C15)

```typescript
type Input = {
  email: string;
  role: Role;
};

type Output = {
  storeMembershipId: string;
}; // 201 Created

type Errors =
  | "ALREADY_A_MEMBER"
  | "INVITATION_ALREADY_PENDING"
  | "INVALID_EMAIL"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   StoreMemberInvited { storeId, storeMembershipId, email, role, invitationToken }
```

#### Command — AcceptInvitation (C16)

```typescript
type Input = {
  invitationToken: string;
};

type Output = {
  storeId: string;
  role: Role;
}; // 200 OK

type Errors =
  | "INVALID_INVITATION_TOKEN"
  | "INVITATION_EXPIRED"
  | "INVITATION_ALREADY_USED"
  | "VALIDATION_ERROR";

// Domain Events:
//   StoreMemberAdded { storeId, userId, role }
```

#### Command — RemoveMember (C17)

```typescript
type Input = {
  storeMembershipId: string;
};

type Output = void; // 204 No Content

type Errors =
  | "STORE_MEMBERSHIP_NOT_FOUND"
  | "CANNOT_REMOVE_LAST_OWNER"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED";

// Domain Events:
//   StoreMemberRemoved { storeId, storeMembershipId, userId }
```

#### Command — ChangeMemberRole (C18)

```typescript
type Input = {
  storeMembershipId: string;
  newRole: Role;
};

type Output = void; // 204 No Content

type Errors =
  | "STORE_MEMBERSHIP_NOT_FOUND"
  | "CANNOT_DEMOTE_LAST_OWNER"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   StoreMemberRoleChanged { storeId, storeMembershipId, userId, oldRole, newRole }
```

#### Command — DisableStore (C19)

```typescript
type Input = void;
type Output = void; // 204 No Content

type Errors =
  | "STORE_NOT_FOUND"
  | "STORE_ALREADY_DISABLED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED";

// Domain Events:
//   StoreDisabled { storeId, disabledAt }
```

#### Command — EnableStore (C20)

```typescript
type Input = void;
type Output = void; // 204 No Content

type Errors =
  | "STORE_NOT_FOUND"
  | "STORE_NOT_DISABLED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED";

// Domain Events:
//   StoreEnabled { storeId, enabledAt }
```

---

### 7.3 Integration

#### Read — IntegrationsList (T11)

```typescript
type Input = {
  type?: StoreIntegrationType;
};

type Output = {
  items: {
    storeIntegrationId: string;
    type: StoreIntegrationType;
    platform: string;
    displayName: string;
    externalId: string;
    active: boolean;
    valid: boolean;
    lastSyncAt?: string;
    lastHandshakeAt?: string;
    connectedAt: string;
  }[];
};

type Errors =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED";
```

#### Read — IntegrationDetail (T12)

```typescript
type Input = {
  storeIntegrationId: string;
};

type Output = {
  storeIntegrationId: string;
  type: StoreIntegrationType;
  platform: string;
  displayName: string;
  externalId: string;
  active: boolean;
  valid: boolean;
  lastSyncAt?: string;
  lastHandshakeAt?: string;
  connectedAt: string;
  credentialFieldsMasked: Record<string, string>;
  marketingAdAccounts?: {
    marketingAdAccountId: string;
    externalId: string;
    name: string;
    currency: CurrencyCode;
    timezone: string;
    businessAccountExternalId?: string;
    active: boolean;
    lastSyncAt?: string;
  }[];
  marketingBusinessAccounts?: {
    marketingBusinessAccountId: string;
    externalId: string;
    name: string;
    link?: string;
    active: boolean;
  }[];
};

type Errors =
  | "STORE_INTEGRATION_NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED";
```

#### Command — ConnectIntegration (C21)

```typescript
type Input =
  | {
      mode: "OAUTH";
      type: StoreIntegrationType;
      platform: string;
      displayName?: string;
      oauthCode: string;
      oauthRedirectUri: string;
    }
  | {
      mode: "DIRECT_CREDENTIALS";
      type: StoreIntegrationType;
      platform: string;
      displayName?: string;
      credentialFields: Record<string, string>;
    };

type Output = {
  storeIntegrationId: string;
  externalId: string;
  marketingAdAccountsDiscovered?: number;
}; // 201 Created

type Errors =
  | "PLATFORM_NOT_SUPPORTED"
  | "INVALID_CREDENTIAL_FIELDS"
  | "OAUTH_CODE_INVALID"
  | "INTEGRATION_HANDSHAKE_FAILED"
  | "INTEGRATION_QUOTA_EXCEEDED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   IntegrationConnectionInitiated { storeIntegrationId, type, platform, mode }
//   IntegrationHandshakeSucceeded  { storeIntegrationId, externalId, handshakeAt }
//   IntegrationActivated           { storeIntegrationId }
//   (on failure: IntegrationHandshakeFailed { storeIntegrationId, reason })
```

#### Command — DisconnectIntegration (C22)

```typescript
type Input = {
  storeIntegrationId: string;
  wipeData: boolean;
};

type Output = void; // 204 No Content

type Errors =
  | "STORE_INTEGRATION_NOT_FOUND"
  | "STORE_INTEGRATION_ALREADY_DISCONNECTED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED";

// Domain Events:
//   IntegrationDisconnected { storeIntegrationId, disconnectedAt, wipeData }
//   IntegrationDeactivated  { storeIntegrationId }
//   StoreIntegrationDataWipeRequested { storeIntegrationId }   (only if wipeData = true)
```

#### Command — TriggerReintegration (C23)

```typescript
type Input = {
  storeIntegrationId: string;
};

type Output = void; // 202 Accepted

type Errors =
  | "STORE_INTEGRATION_NOT_FOUND"
  | "STORE_INTEGRATION_INACTIVE"
  | "REINTEGRATION_RATE_LIMITED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED";

// Domain Events:
//   ReintegrationTriggered { storeIntegrationId, triggeredAt, triggeredByUserId }
```

#### Command — TriggerReintegrationAll (C24)

```typescript
type Input = void;

type Output = {
  triggered: number;
  skipped: { storeIntegrationId: string; reason: string }[];
}; // 202 Accepted

type Errors =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED";

// Domain Events:
//   ReintegrationBatchRequested { storeId, integrationIds[] }
//   ReintegrationTriggered { storeIntegrationId, ... }   (per integration that passes rate limit)
```

#### Command — ToggleIntegrationActive (C25)

```typescript
type Input = {
  storeIntegrationId: string;
  active: boolean;
};

type Output = void; // 204 No Content

type Errors =
  | "STORE_INTEGRATION_NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   IntegrationActiveToggled { storeIntegrationId, active }
```

---

### 7.4 Sales

#### Read — OrdersList (T13)

```typescript
type Input = {
  dateRange: DateRange;
  storeIds: string[];                       // multistore
  storeIntegrationIds?: string[];
  productIds?: string[];
  paymentStatuses?: PaymentStatus[];
  paymentMethods?: PaymentMethod[];
  isManual?: boolean;
  isDraft?: boolean;
  search?: string;
  sortBy?: "externalCreatedAt" | "total" | "customerName";
  sortOrder?: SortOrder;
  page: number;
  limit: number;
};

type Output = {
  total: number;
  reportingCurrency: CurrencyCode;
  items: {
    orderId: string;
    storeId: string;
    storeIntegrationId: string;
    platform: SalesPlatform | CheckoutPlatform;
    externalId: string;
    externalCreatedAt: string;
    customerName?: string;
    customerEmail?: string;
    total: MonetaryAmount;
    totalInReportingCurrency: MonetaryAmount;
    paymentStatusFromProvider: PaymentStatus;
    paymentStatusOverride?: PaymentStatus;
    effectivePaymentStatus: PaymentStatus;
    paymentMethod: PaymentMethod;
    isManual: boolean;
    isDraft: boolean;
    hasOverride: boolean;
  }[];
};

type Errors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";
```

#### Read — OrderDetail (T14)

```typescript
type Input = {
  orderId: string;
};

type Output = {
  orderId: string;
  storeId: string;
  storeIntegrationId: string;
  storeIntegrationExternalId: string;
  platform: SalesPlatform | CheckoutPlatform;
  externalId: string;
  externalCreatedAt: string;
  description?: string;
  customer: {
    email?: string;
    name?: string;
    phoneNumber?: string;
    shippingAddress?: PostalAddress;
  };
  money: {
    subtotal: MonetaryAmount;
    discountTotal: MonetaryAmount;
    shippingTotal: MonetaryAmount;
    taxTotal: MonetaryAmount;
    total: MonetaryAmount;
    presentmentMoney?: MonetaryAmount;
    settlementMoney?: MonetaryAmount;
    totalInReportingCurrency: MonetaryAmount;
  };
  paymentStatusFromProvider: PaymentStatus;
  paymentMethod: PaymentMethod;
  paymentGateway: PaymentGateway;
  lines: (OrderLine & {
    overriddenCost?: MonetaryAmount;
    effectiveUnitCost?: MonetaryAmount;
  })[];
  transactions: OrderTransaction[];
  cartToken?: string;
  utm?: UtmTags;
  isDraft: boolean;
  isManual: boolean;
  override?: {
    storeIntegrationExternalId: string;
    fields: OrderOverrideFields;
    updatedAt: string;
    updatedByUserId: string;
  };
};

type Errors =
  | "ORDER_NOT_FOUND"
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED";
```

#### Read — AbandonedCartsList (T15)

```typescript
type Input = {
  dateRange: DateRange;
  storeIds: string[];                       // multistore
  storeIntegrationIds?: string[];
  linked?: boolean;
  page: number;
  limit: number;
};

type Output = {
  total: number;
  reportingCurrency: CurrencyCode;
  items: {
    cartId: string;
    storeId: string;
    storeIntegrationId: string;
    platform: SalesPlatform | CheckoutPlatform;
    cartToken: string;
    cartUrl?: string;
    currency: CurrencyCode;
    total: MonetaryAmount;
    totalInReportingCurrency: MonetaryAmount;
    customerEmail?: string;
    customerName?: string;
    abandonedAt: string;
    linkedOrderId?: string;
  }[];
};

type Errors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED";
```

#### Command — UpdateOrderOverride (C26)

```typescript
type Input = {
  orderId: string;
  fields: OrderOverrideFields;              // partial — any subset of typed fields
};

type Output = void; // 204 No Content

type Errors =
  | "ORDER_NOT_FOUND"
  | "INVALID_LINE_ID"
  | "INVALID_OVERRIDE_FIELDS"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   OrderOverridden { orderId, storeIntegrationExternalId, changedFields }
```

---

### 7.5 Catalog

#### Read — ProductsList (T16)

```typescript
type Input = {
  storeIds: string[];                       // multistore
  storeIntegrationIds?: string[];
  search?: string;
  tags?: string[];
  collection?: string;
  status?: ProductStatus;
  page: number;
  limit: number;
};

type Output = {
  total: number;
  items: {
    productId: string;
    storeId: string;
    storeIntegrationId: string;
    platform: SalesPlatform;
    externalId: string;
    title: string;
    handle: string;
    pictureUrl?: string;
    status: ProductStatus;
    collection?: string;
    tags: string[];
    variantCount: number;
    externalCreatedAt: string;
  }[];
};

type Errors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED";
```

#### Read — ProductDetail (T17)

```typescript
type Input = {
  productId: string;
};

type Output = {
  productId: string;
  storeId: string;
  storeIntegrationId: string;
  platform: SalesPlatform;
  externalId: string;
  title: string;
  handle: string;
  description?: string;
  pictureUrl?: string;
  status: ProductStatus;
  collection?: string;
  tags: string[];
  externalCreatedAt: string;
  variants: {
    variantId: string;
    externalId: string;
    title: string;
    sku?: string;
    barcode?: string;
    unitPrice: MonetaryAmount;
    pictureUrl?: string;
    collection?: string;
    externalCreatedAt: string;
  }[];
  productCosts: {
    productCostId: string;
    costType: ProductCostType;
    displayName?: string;
    options: ProductCostOption[];
  }[];
  campaignBindings: {
    bindingId: string;
    campaignId: string;
    campaignName: string;
    platform: MarketingPlatform;
    variantIds: string[];
  }[];
};

type Errors =
  | "PRODUCT_NOT_FOUND"
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED";
```

#### Read — ProductCostsList (T18)

```typescript
type Input = {
  storeIds: string[];                       // multistore
  storeIntegrationIds?: string[];
  productIds?: string[];
  variantIds?: string[];
  costType?: ProductCostType;
  currency?: CurrencyCode;
  country?: string;
  effectiveOnDate?: string;
  page: number;
  limit: number;
};

type Output = {
  total: number;
  items: {
    productCostId: string;
    storeId: string;
    storeIntegrationId: string;
    productId?: string;
    productTitle?: string;
    costType: ProductCostType;
    displayName?: string;
    options: ProductCostOption[];
  }[];
};

type Errors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED";
```

#### Read — ProductTagsList (T19)

```typescript
type Input = {
  storeIds: string[];
};

type Output = {
  items: {
    tag: string;
    usageCount: number;
  }[];
};

type Errors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED";
```

#### Command — CreateProductCost (C27)

```typescript
type Input = {
  storeIntegrationId: string;
  productId?: string;
  costType: ProductCostType;
  displayName?: string;
  options: ProductCostOptionInput[];
};

type Output = {
  productCostId: string;
}; // 201 Created

type Errors =
  | "STORE_INTEGRATION_NOT_FOUND"
  | "PRODUCT_NOT_FOUND"
  | "VARIANT_NOT_FOUND"
  | "DUPLICATE_PRODUCT_COST_SCOPE"
  | "INVALID_DATE_RANGE"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   ProductCostCreated { productCostId, storeIntegrationId, productId, costType }
```

#### Command — UpdateProductCost (C28)

```typescript
type Input = {
  productCostId: string;
  displayName?: string;
  options?: ProductCostOptionInput[];
};

type Output = void; // 204 No Content

type Errors =
  | "PRODUCT_COST_NOT_FOUND"
  | "PRODUCT_COST_SCOPE_LOCKED"
  | "INVALID_DATE_RANGE"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   ProductCostUpdated { productCostId, changedFields }
```

#### Command — DeleteProductCost (C29)

```typescript
type Input = {
  productCostId: string;
};

type Output = void; // 204 No Content

type Errors =
  | "PRODUCT_COST_NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED";

// Domain Events:
//   ProductCostDeleted { productCostId }
```

#### Command — BulkImportProductCostsFromCsv (C30)

```typescript
type Input = {
  storeIntegrationId: string;
  csvContent: string;
  dryRun: boolean;
};

type Output = {
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  rows: CsvImportRowResult[];
}; // 200 OK

type Errors =
  | "STORE_INTEGRATION_NOT_FOUND"
  | "CSV_PARSE_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   ProductCostCreated { ... }   (per CREATED row)
//   ProductCostUpdated { ... }   (per UPDATED row)
```

#### Command — AddProductTag (C31)

```typescript
type Input = {
  productId: string;
  tag: string;
};

type Output = void; // 204 No Content

type Errors =
  | "PRODUCT_NOT_FOUND"
  | "TAG_TOO_LONG"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   ProductTagAdded { productId, tag }   (only on actual change)
```

#### Command — RemoveProductTag (C32)

```typescript
type Input = {
  productId: string;
  tag: string;
};

type Output = void; // 204 No Content

type Errors =
  | "PRODUCT_NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED";

// Domain Events:
//   ProductTagRemoved { productId, tag }   (only on actual change)
```

---

### 7.6 Marketing

#### Read — MarketingCampaignsList (T20)

```typescript
type Input = {
  storeIds: string[];                       // multistore
  storeIntegrationIds?: string[];
  platforms?: MarketingPlatform[];
  statuses?: CampaignStatus[];
  search?: string;
  page: number;
  limit: number;
};

type Output = {
  total: number;
  items: {
    campaignId: string;
    adAccountExternalId: string;
    businessAccountExternalId?: string;
    externalId: string;
    name: string;
    platform: MarketingPlatform;
    status: CampaignStatus;
    totalSpend: MonetaryAmount;
    totalSpendInReportingCurrency: MonetaryAmount;
    boundProductCount: number;
    externalCreatedAt: string;
  }[];
};

type Errors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED";
```

#### Read — AdSpendBreakdown (T21)

```typescript
type Input = {
  dateRange: DateRange;
  storeIds: string[];
  platforms?: MarketingPlatform[];
  campaignExternalIds?: string[];
  adAccountExternalIds?: string[];
  adSpendType?: AdSpendType;                // filter AUTOMATIC vs MANUAL
  groupBy: "DAY" | "HOUR" | "CAMPAIGN" | "AD_ACCOUNT" | "PLATFORM";
};

type Output = {
  reportingCurrency: CurrencyCode;
  items: {
    bucketKey: string;
    bucketLabel: string;
    date?: string;
    adSpendType: AdSpendType;
    spend: MonetaryByCurrency;
    spendInReportingCurrency: MonetaryAmount;
    impressions?: number;
    clicks?: number;
    conversions?: number;
    roas?: number;
  }[];
};

type Errors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";
```

#### Read — CampaignProductBindings (T22)

```typescript
type Input = {
  storeIds: string[];
  campaignId?: string;
  productId?: string;
  page: number;
  limit: number;
};

type Output = {
  total: number;
  items: {
    bindingId: string;
    storeId: string;
    campaignId: string;
    campaignName: string;
    platform: MarketingPlatform;
    productIds: string[];
    productTitles: string[];
    variantIds: string[];
    boundAt: string;
  }[];
};

type Errors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED";
```

#### Command — CreateManualAdSpend (C33)

```typescript
type Input = {
  platform?: MarketingPlatform;
  name: string;
  description?: string;
  currency: CurrencyCode;
  startDate: string;
  endDate: string;
  spend: MonetaryAmount;
  bindings?: ManualMarketingExpenseBinding[];
};

type Output = {
  adSpendId: string;
}; // 201 Created

type Errors =
  | "INVALID_DATE_RANGE"
  | "PRODUCT_NOT_FOUND"
  | "VARIANT_NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   AdSpendRecorded { adSpendId, adSpendType: "MANUAL", platform, spend }
```

#### Command — UpdateManualAdSpend (C34)

```typescript
type Input = {
  adSpendId: string;
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  spend?: MonetaryAmount;
  bindings?: ManualMarketingExpenseBinding[];
};

type Output = void; // 204 No Content

type Errors =
  | "AD_SPEND_NOT_FOUND"
  | "CANNOT_MUTATE_AUTOMATIC_AD_SPEND"
  | "INVALID_DATE_RANGE"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   AdSpendUpdated { adSpendId, adSpendType: "MANUAL", changedFields }
```

#### Command — DeleteManualAdSpend (C35)

```typescript
type Input = {
  adSpendId: string;
};

type Output = void; // 204 No Content

type Errors =
  | "AD_SPEND_NOT_FOUND"
  | "CANNOT_MUTATE_AUTOMATIC_AD_SPEND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED";

// Domain Events:
//   AdSpendDeleted { adSpendId, adSpendType: "MANUAL" }
```

#### Command — BindCampaignToProduct (C36)

```typescript
type Input = {
  campaignId: string;
  productIds: string[];
  variantIds: string[];
};

type Output = {
  bindingId: string;
}; // 201 Created

type Errors =
  | "CAMPAIGN_NOT_FOUND"
  | "PRODUCT_NOT_FOUND"
  | "VARIANT_NOT_FOUND"
  | "BINDING_ALREADY_EXISTS"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   CampaignProductBindingCreated { bindingId, campaignId, productIds, variantIds }
```

#### Command — UnbindCampaignFromProduct (C37)

```typescript
type Input = {
  bindingId: string;
};

type Output = void; // 204 No Content

type Errors =
  | "BINDING_NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED";

// Domain Events:
//   CampaignProductBindingRemoved { bindingId, campaignId }
```

#### Command — ReconcileMarketingAccounts (C38)

```typescript
type Input = {
  storeIntegrationId?: string;
  windowDays: number;
};

type Output = {
  triggered: number;
}; // 202 Accepted

type Errors =
  | "STORE_INTEGRATION_NOT_FOUND"
  | "VALIDATION_ERROR";

// Domain Events:
//   MarketingReconciliationCompleted { storeIntegrationId, windowDays, completedAt }   (per integration)
//
// Note: implemented as TS-to-go-worker HTTP call (POST /marketing/reconcile/<platform>).
// Debounced per integration via Redis 300s key to avoid stampede when many users open dashboard.
```

---

### 7.7 Tracking

#### Read — PixelFunnel (T23)

```typescript
type Input = {
  dateRange: DateRange;
  storeIds: string[];
  storeIntegrationIds?: string[];
};

type Output = {
  stages: {
    type: PixelEventType;
    count: number;
    uniqueSessions: number;
    dropOffFromPreviousPercent?: number;
  }[];
  conversionRate: number;
};

type Errors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";
```

#### Read — PixelScriptSnippet (T24)

```typescript
type Input = {
  storeIntegrationId: string;
};

type Output = {
  storeIntegrationId: string;
  platform: SalesPlatform;
  scriptUrl: string;
  inlineScript: string;
  installationInstructions: string;
};

type Errors =
  | "STORE_INTEGRATION_NOT_FOUND"
  | "PIXEL_NOT_SUPPORTED_FOR_PLATFORM"
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED";
```

> **No commands in §7.7.** PixelEvents are written exclusively by go-worker from inbound Shopify Pixel posts; no TS command exists for ingest.

---

### 7.8 Finance

#### Read — TaxesSettings (T25)

```typescript
type Input = {
  effectiveOnDate?: string;
};

type Output = {
  storeId: string;
  revenueTaxType: TaxType;
  revenueTaxDeductionType: TaxDeductionType;
  revenueTaxRate: number;
  revenueTaxMultiplier: number;
  marketingTaxRatePerPlatform: Partial<Record<MarketingPlatform, number>>;
  startDate: string;
  endDate?: string;
  updatedAt: string;
};

type Errors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED";
```

#### Read — FeesConfigurationSettings (T26)

```typescript
type Input = {
  effectiveOnDate?: string;
};

type Output = {
  storeId: string;
  gatewayFees: GatewayFee[];
  checkoutFees: CheckoutFee[];
  shippingFee: ShippingFee;
  startDate: string;
  endDate?: string;
  updatedAt: string;
};

type Errors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED";
```

#### Read — OperationalCostsList (T27)

```typescript
type Input = {
  dateRange?: DateRange;
  categories?: OperationalCostCategory[];
  active?: boolean;
  page: number;
  limit: number;
};

type Output = {
  total: number;
  items: {
    operationalCostId: string;
    category: OperationalCostCategory;
    description?: string;
    amount: MonetaryAmount;
    amountInReportingCurrency: MonetaryAmount;
    paymentMethod?: PaymentMethod;
    startDate: string;
    endDate?: string;
    recurrency: OperationalCostRecurrency;
    active: boolean;
    statusEntries: OperationalCostStatusEntry[];
    createdAt: string;
  }[];
};

type Errors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED";
```

#### Read — WarrantyReservesList (T28)

```typescript
type Input = void;

type Output = {
  items: {
    warrantyReserveId: string;
    rate: number;
    startDate: string;
    endDate?: string;
    createdAt: string;
  }[];
};

type Errors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED";
```

#### Read — FxRatesAdmin (T29)

```typescript
type Input = {
  fromCurrency?: CurrencyCode;
  toCurrency?: CurrencyCode;
  dateRange?: DateRange;
  page: number;
  limit: number;
};

type Output = {
  total: number;
  items: FxRate[];
};

type Errors =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED";
```

#### Command — UpdateTaxes (C39)

```typescript
type Input = {
  revenueTaxType?: TaxType;
  revenueTaxDeductionType?: TaxDeductionType;
  revenueTaxRate?: number;
  revenueTaxMultiplier?: number;
  marketingTaxRatePerPlatform?: Partial<Record<MarketingPlatform, number>>;
  startDate: string;
};

type Output = void; // 204 No Content

type Errors =
  | "INVALID_RATE"
  | "INVALID_START_DATE"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   TaxesUpdated { storeId, changedFields, effectiveStartDate }
```

#### Command — UpdateFeesConfiguration (C40)

```typescript
type Input = {
  gatewayFees?: GatewayFee[];
  checkoutFees?: CheckoutFee[];
  shippingFee?: ShippingFee;
  startDate: string;
};

type Output = void; // 204 No Content

type Errors =
  | "INVALID_RATE"
  | "INVALID_START_DATE"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   FeesConfigurationUpdated { storeId, changedFeeCategories, effectiveStartDate }
```

#### Command — CreateOperationalCost (C41)

```typescript
type Input = {
  category: OperationalCostCategory;
  description?: string;
  amount: MonetaryAmount;
  paymentMethod?: PaymentMethod;
  startDate: string;
  endDate?: string;
  recurrency: OperationalCostRecurrency;
};

type Output = {
  operationalCostId: string;
}; // 201 Created

type Errors =
  | "INVALID_DATE_RANGE"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   OperationalCostRecorded { operationalCostId, category, amount }
```

#### Command — UpdateOperationalCost (C42)

```typescript
type Input = {
  operationalCostId: string;
  category?: OperationalCostCategory;
  description?: string;
  amount?: MonetaryAmount;
  paymentMethod?: PaymentMethod;
  startDate?: string;
  endDate?: string;
  recurrency?: OperationalCostRecurrency;
};

type Output = void; // 204 No Content

type Errors =
  | "OPERATIONAL_COST_NOT_FOUND"
  | "INVALID_DATE_RANGE"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   OperationalCostUpdated { operationalCostId, changedFields }
```

#### Command — DeleteOperationalCost (C43)

```typescript
type Input = {
  operationalCostId: string;
};

type Output = void; // 204 No Content

type Errors =
  | "OPERATIONAL_COST_NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED";

// Domain Events:
//   OperationalCostDeleted { operationalCostId }
```

#### Command — ToggleOperationalCostStatus (C44)

```typescript
type Input = {
  operationalCostId: string;
  status: OperationalCostPaymentStatus;
  date: string;
};

type Output = void; // 204 No Content

type Errors =
  | "OPERATIONAL_COST_NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   OperationalCostStatusToggled { operationalCostId, status, date }
```

#### Command — CreateWarrantyReserve (C45)

```typescript
type Input = {
  rate: number;
  startDate: string;
  endDate?: string;
};

type Output = {
  warrantyReserveId: string;
}; // 201 Created

type Errors =
  | "INVALID_RATE"
  | "INVALID_DATE_RANGE"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   WarrantyReserveCreated { warrantyReserveId, rate }
```

#### Command — UpdateWarrantyReserve (C46)

```typescript
type Input = {
  warrantyReserveId: string;
  rate?: number;
  startDate?: string;
  endDate?: string;
};

type Output = void; // 204 No Content

type Errors =
  | "WARRANTY_RESERVE_NOT_FOUND"
  | "INVALID_RATE"
  | "INVALID_DATE_RANGE"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   WarrantyReserveUpdated { warrantyReserveId, changedFields }
```

#### Command — DeleteWarrantyReserve (C47)

```typescript
type Input = {
  warrantyReserveId: string;
};

type Output = void; // 204 No Content

type Errors =
  | "WARRANTY_RESERVE_NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED";

// Domain Events:
//   WarrantyReserveDeleted { warrantyReserveId }
```

#### Command — CaptureFxRates (C48)

```typescript
type Input = {
  pairs?: { fromCurrency: CurrencyCode; toCurrency: CurrencyCode }[];
};

type Output = {
  captured: number;
  skipped: number;
}; // 200 OK

type Errors =
  | "FX_PROVIDER_UNAVAILABLE"
  | "VALIDATION_ERROR";

// Domain Events:
//   FxRateCaptured { fromCurrency, toCurrency, rate, source, startDate }   (per inserted row)
```

---

### 7.9 Analytics

#### Read — DashboardOverview (T30)

```typescript
type Input = {
  dateRange: DateRange;
  storeIds: string[];
  storeIntegrationIds?: string[];
  productIds?: string[];
  forcePaidOrders?: boolean;                // chart-level switch, NOT Store config
};

type Output = {
  reportingCurrency: CurrencyCode;
  revenue: MonetaryByCurrency;
  revenueInReportingCurrency: MonetaryAmount;
  orderCount: number;
  averageOrderValueInReportingCurrency: MonetaryAmount;
  grossMargin: MonetaryByCurrency;
  grossMarginInReportingCurrency: MonetaryAmount;
  grossMarginPercent: number;
  marketingSpend: MonetaryByCurrency;
  marketingSpendInReportingCurrency: MonetaryAmount;
  roas: number;
  refundedRevenueInReportingCurrency: MonetaryAmount;
  comparisonToPreviousPeriod: {
    revenueChangePercent: number;
    orderCountChangePercent: number;
    marketingSpendChangePercent: number;
    roasChangePercent: number;
  };
};

type Errors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";
```

#### Read — Chart (T31)

```typescript
type Input = {
  chartType: ChartType;
  dateRange: DateRange;
  frequency: AnalyticsFrequency;
  storeIds: string[];
  storeIntegrationIds?: string[];
  productIds?: string[];
  forcePaidOrders?: boolean;
  timezoneMode: TimezoneMode;
};

type Output =
  | {
      chartType: "REVENUE";
      reportingCurrency: CurrencyCode;
      buckets: ChartSeriesPoint[];
    }
  | {
      chartType: "REVENUE_PER_SHIFT";
      reportingCurrency: CurrencyCode;
      buckets: (ChartSeriesPoint & { shiftLabel: string })[];
    }
  | {
      chartType: "SALES_PER_WEEKDAY";
      reportingCurrency: CurrencyCode;
      buckets: { dayOfWeek: DayOfWeek; total: MonetaryByCurrency; totalInReportingCurrency: MonetaryAmount; orderCount: number }[];
    }
  | {
      chartType: "SALES_PER_HOUR";
      reportingCurrency: CurrencyCode;
      buckets: { hourOfDay: number; total: MonetaryByCurrency; totalInReportingCurrency: MonetaryAmount; orderCount: number }[];
    }
  | {
      chartType: "SALES_PER_REGION";
      reportingCurrency: CurrencyCode;
      regions: RegionBucket[];
    };

type Errors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";
```

#### Read — ProductPerformanceReport (T32)

```typescript
type Input = {
  dateRange: DateRange;
  storeIds: string[];
  storeIntegrationIds?: string[];
  productIds?: string[];
  forcePaidOrders?: boolean;
  sortBy?: "revenue" | "profit" | "unitsSold" | "margin";
  sortOrder?: SortOrder;
  page: number;
  limit: number;
};

type Output = {
  total: number;
  reportingCurrency: CurrencyCode;
  items: {
    productId: string;
    productTitle: string;
    unitsSold: number;
    revenue: MonetaryByCurrency;
    revenueInReportingCurrency: MonetaryAmount;
    cogs: MonetaryByCurrency;
    cogsInReportingCurrency: MonetaryAmount;
    attributedAdSpend: MonetaryByCurrency;
    attributedAdSpendInReportingCurrency: MonetaryAmount;
    profit: MonetaryByCurrency;
    profitInReportingCurrency: MonetaryAmount;
    marginPercent: number;
  }[];
};

type Errors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";
```

#### Read — ProfitMarginReport (T33)

```typescript
type Input = {
  dateRange: DateRange;
  storeIds: string[];
  forcePaidOrders?: boolean;
};

type Output = {
  reportingCurrency: CurrencyCode;
  revenue: MonetaryByCurrency;
  revenueInReportingCurrency: MonetaryAmount;
  deductions: {
    productCost: MonetaryByCurrency;
    shippingCost: MonetaryByCurrency;
    paymentFees: MonetaryByCurrency;
    taxes: MonetaryByCurrency;
    marketingSpend: MonetaryByCurrency;
    operationalCosts: MonetaryByCurrency;
    warrantyReserve: MonetaryByCurrency;
  };
  deductionsInReportingCurrency: {
    productCost: MonetaryAmount;
    shippingCost: MonetaryAmount;
    paymentFees: MonetaryAmount;
    taxes: MonetaryAmount;
    marketingSpend: MonetaryAmount;
    operationalCosts: MonetaryAmount;
    warrantyReserve: MonetaryAmount;
  };
  profitInReportingCurrency: MonetaryAmount;
  marginPercent: number;
};

type Errors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";
```

#### Read — GoalsList (T34)

```typescript
type Input = {
  active?: boolean;
  storeIds: string[];
};

type Output = {
  items: {
    goalId: string;
    storeId: string;
    storeIntegrationId?: string;
    type: GoalType;
    targetAmount: MonetaryAmount;
    targetAmountInReportingCurrency: MonetaryAmount;
    startDate: string;
    endDate: string;
    progressInReportingCurrency: MonetaryAmount;
    progressPercent: number;
    achieved: boolean;
    createdAt: string;
    disabledAt?: string;
  }[];
};

type Errors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED";
```

#### Read — AdminUserLookup (T35)

```typescript
type Input = {
  email: string;
};

type Output = {
  userId: string;
  email: string;
  name: string;
  createdAt: string;
  stores: {
    storeId: string;
    name: string;
    role: Role;
    lastAccess: string;
    disabledAt?: string;
  }[];
  subscriptions: {
    subscriptionId: string;
    externalSubscriptionId: string;
    tier: PlanTier;
    period: PlanPeriod;
    expirationDate: string;
    isActive: boolean;                       // derived from event stream
  }[];
};

type Errors =
  | "USER_NOT_FOUND"
  | "UNAUTHORIZED"
  | "ADMIN_SECRET_INVALID";
```

#### Read — AdminStoreSnapshot (T36)

```typescript
type Input = {
  storeId: string;
};

type Output = {
  storeId: string;
  name: string;
  reportingCurrency: CurrencyCode;
  integrations: {
    storeIntegrationId: string;
    type: StoreIntegrationType;
    platform: string;
    active: boolean;
    valid: boolean;
    lastSyncAt?: string;
  }[];
  marketingSpendLast30DaysInReportingCurrency: MonetaryAmount;
  ordersSummaryLast30Days: {
    orderCount: number;
    revenueInReportingCurrency: MonetaryAmount;
    averageOrderValueInReportingCurrency: MonetaryAmount;
  };
  productsWithOrdersCount: number;
};

type Errors =
  | "STORE_NOT_FOUND"
  | "UNAUTHORIZED"
  | "ADMIN_SECRET_INVALID";
```

#### Command — CreateGoal (C49)

```typescript
type Input = {
  storeIntegrationId?: string;
  type: GoalType;
  targetAmount: MonetaryAmount;
  startDate: string;
  endDate: string;
};

type Output = {
  goalId: string;
}; // 201 Created

type Errors =
  | "STORE_INTEGRATION_NOT_FOUND"
  | "INVALID_DATE_RANGE"
  | "INVALID_TARGET_AMOUNT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   GoalCreated { goalId, storeId, type, targetAmount }
```

#### Command — UpdateGoal (C50)

```typescript
type Input = {
  goalId: string;
  targetAmount?: MonetaryAmount;
  endDate?: string;
};

type Output = void; // 204 No Content

type Errors =
  | "GOAL_NOT_FOUND"
  | "GOAL_LOCKED"
  | "INVALID_DATE_RANGE"
  | "INVALID_TARGET_AMOUNT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   GoalUpdated { goalId, changedFields }
```

#### Command — DeleteGoal (C51)

```typescript
type Input = {
  goalId: string;
};

type Output = void; // 204 No Content

type Errors =
  | "GOAL_NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED";

// Domain Events:
//   GoalDeleted { goalId }
```

#### Command — DuplicateLastGoal (C52)

```typescript
type Input = {
  storeIntegrationId?: string;
};

type Output = {
  goalId: string;
}; // 201 Created

type Errors =
  | "NO_PREVIOUS_GOAL_FOUND"
  | "STORE_INTEGRATION_NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED";

// Domain Events:
//   GoalCreated { goalId, storeId, type, targetAmount }
```

---

### 7.10 Notifications

#### Read — NotificationsInbox (T37)

```typescript
type Input = {
  unreadOnly?: boolean;
  categories?: NotificationCategory[];
  page: number;
  limit: number;
};

type Output = {
  total: number;
  unreadCount: number;
  items: {
    notificationDeliveryId: string;
    notificationId: string;
    title: string;
    content: string;
    category: NotificationCategory;
    origin: NotificationOrigin;
    important: boolean;
    channel: NotificationChannel;
    payload?: Record<string, unknown>;
    deliveredAt: string;
    readAt?: string;
  }[];
};

type Errors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED";
```

#### Command — SendNotification (C53)

```typescript
type Input = {
  storeId?: string;
  targetUserIds?: string[];
  title: string;
  content: string;
  category: NotificationCategory;
  important: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  contentType: string;
  payload?: Record<string, unknown>;
  scheduledAt?: string;
};

type Output = {
  notificationId: string;
  deliveriesCreated: number;
  deliveriesSkippedDuplicate: number;
}; // 201 Created

type Errors =
  | "STORE_NOT_FOUND"
  | "TARGET_USERS_OR_STORE_REQUIRED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   NotificationSent { notificationId, category, recipientCount }
//   NotificationDelivered { notificationDeliveryId, channel }
//   NotificationDeliveryFailed { notificationDeliveryId, channel, reason }
```

#### Command — TriggerDailyDigest (C54)

```typescript
type Input = {
  runForUserId?: string;
};

type Output = {
  triggered: number;
  skippedDisabled: number;
  skippedTimezoneMismatch: number;
}; // 202 Accepted

type Errors =
  | "USER_NOT_FOUND"
  | "VALIDATION_ERROR";

// Domain Events:
//   DailyDigestSent { userId, storeId, sentAt, notificationCurrency }
```

#### Command — MarkNotificationRead (C55)

```typescript
type Input = {
  notificationDeliveryId: string;
};

type Output = void; // 204 No Content

type Errors =
  | "NOTIFICATION_DELIVERY_NOT_FOUND"
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED";

// Domain Events:
//   NotificationRead { notificationDeliveryId, userId, readAt }
```

---

### 7.11 Billing

#### Read — MySubscription (T38)

```typescript
type Input = void;

type Output = {
  subscriptionId?: string;
  externalSubscriptionId?: string;
  platform?: BillingPlatform;
  tier?: PlanTier;
  period?: PlanPeriod;
  expirationDate?: string;
  isActive: boolean;
  isCancelled: boolean;
  quotaUsage: {
    storeAmount:       { used: number; max: PlanQuota };
    integrationAmount: { used: number; max: PlanQuota };
  };
};

type Errors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED";
```

#### Read — SubscriptionEventHistory (T39)

```typescript
type Input = {
  subscriptionId?: string;
  eventTypes?: SubscriptionEventType[];
  page: number;
  limit: number;
};

type Output = {
  total: number;
  items: {
    subscriptionEventId: string;
    subscriptionId: string;
    eventType: SubscriptionEventType;
    externalEventId: string;
    payloadSummary: {
      amount?: MonetaryAmount;
      paymentMethod?: string;
      reason?: string;
    };
    receivedAt: string;
  }[];
};

type Errors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED";
```

#### Command — HandleBillingWebhook (C56)

```typescript
type Input = {
  platform: BillingPlatform;
  rawPayload: Record<string, unknown>;
  signature?: string;
};

type Output = void; // 200 OK (idempotent on externalEventId)

type Errors =
  | "BILLING_WEBHOOK_SIGNATURE_INVALID"
  | "BILLING_WEBHOOK_PAYLOAD_INVALID"
  | "BILLING_WEBHOOK_UNKNOWN_PLATFORM"
  | "SUBSCRIPTION_LOOKUP_FAILED"
  | "VALIDATION_ERROR";

// Domain Events:
//   SubscriptionEventReceived { subscriptionEventId, subscriptionId, eventType, receivedAt }
//   SubscriptionPaymentReceived { subscriptionEventId, subscriptionId, amount, status }
//   SubscriptionActivated { subscriptionId, tier, period, expirationDate }
//   SubscriptionCancelled { subscriptionId, cancelledAt }
//
// Also publishes to Tenancy:
//   shared.SubscriptionQuotaUpdated { userId, tier }
```

#### Command — ChangeExternalSubscription (C57)

```typescript
type Input = {
  subscriptionId: string;
  newExternalSubscriptionId: string;
  platform: BillingPlatform;
  paymentId: string;
};

type Output = void; // 204 No Content

type Errors =
  | "SUBSCRIPTION_NOT_FOUND"
  | "EXTERNAL_SUBSCRIPTION_NOT_FOUND"
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR";

// Domain Events:
//   SubscriptionExternalChanged { subscriptionId, oldExternalSubscriptionId, newExternalSubscriptionId }
//
// Also publishes to Tenancy:
//   shared.SubscriptionQuotaUpdated { userId, tier }
```

---

### 7.13 Integration Events Summary

Integration events cross context (and service) boundaries. Three flows:
**(A) Inbound from go-worker** — Go publishes outbox events after canonical UPSERTs; TS contexts consume.
**(B) Outbound to go-worker** — TS calls go-worker HTTP for commands (handshake, sync, reconcile).
**(C) Intra-API** — one TS BC publishes; another TS BC consumes.

```
═══════════════════════════════════════════════════════════════════════════
 (A) INBOUND: go-worker (Sync Engine) ──Kafka outbox──► TS API contexts
═══════════════════════════════════════════════════════════════════════════

go-worker ──┐
            │ order.updated                          ──► Sales       (cache invalidation,
            │                                              ProductCost reconciliation,
            │                                              Notifications fan-out)
            │ order_transaction.recorded             ──► Sales       (nested under Order)
            │ order_transaction.refunded             ──► Sales, Analytics
            │ order_transaction.disputed             ──► Sales, Analytics
            │ cart.abandoned                         ──► Sales
            │ cart.linked_to_order                   ──► Sales
            │
            │ product.updated                        ──► Catalog, Analytics
            │ variant.updated                        ──► Catalog, Analytics
            │
            │ campaign.updated                       ──► Marketing, Analytics
            │ campaign.status_changed                ──► Marketing, Analytics
            │ ad_set.updated                         ──► Marketing
            │ ad.updated                             ──► Marketing
            │ ad_spend.recorded   (AUTOMATIC)        ──► Marketing, Analytics
            │ marketing_reconciliation.completed     ──► Marketing, Analytics
            │
            │ pixel_event.recorded                   ──► Tracking, Sales (cart→order linking)
            │
            │ integration.handshake_succeeded        ──► Integration
            │ integration.handshake_failed           ──► Integration, Notifications
            │ integration.last_sync_updated          ──► Integration
            │ marketing_ad_account.discovered        ──► Integration
            │ integration.progress_updated           ──► (forwarded to frontend over SSE/WS)
            │
            └─────────────────────────────────────────────────────────────►

═══════════════════════════════════════════════════════════════════════════
 (B) OUTBOUND: TS API ──HTTP (synchronous)──► go-worker
═══════════════════════════════════════════════════════════════════════════

TS API (Integration BC) ─► POST /integrations/handshake { platform, credentials }
                            └─► validates with vendor; returns externalId + discovered ad accounts
                            └─► fires C21 ConnectIntegration

TS API (Integration BC) ─► POST /sync { storeIntegrationId, credentials, pipelines[], windowDays? }
                            └─► enqueues backfill job
                            └─► fires C23 TriggerReintegration (and per-integration during C24)

TS API (Marketing BC,   ─► POST /marketing/reconcile/<platform> { credentials, adAccountId, dateRange }
        on dashboard       └─► synchronously fetches + UPSERTs
        query)             └─► fires C38 ReconcileMarketingAccounts

═══════════════════════════════════════════════════════════════════════════
 (C) INTRA-API: TS BC ──in-process event bus──► TS BC
═══════════════════════════════════════════════════════════════════════════

Identity      ─► Tenancy        : UserRegistered                       (enable future CreateStore)
Identity      ─► Notifications  : FcmTokenRegistered/Unregistered,
                                  UserPreferencesUpdated               (cache delivery routing)

Tenancy       ─► Integration    : StoreDisabled, StoreEnabled          (cascade active flag)
Tenancy       ─► Sales, Catalog,
                  Marketing,
                  Tracking,
                  Analytics      : StoreDisabled                        (quarantine ingest/queries)

Billing       ─► Tenancy        : shared.SubscriptionQuotaUpdated      (refresh STORE_AMOUNT)

Integration   ─► Sales, Catalog,
                  Marketing,
                  Tracking,
                  Analytics      : StoreIntegrationDataWipeRequested    (cascade-clean canonical rows;
                                                                         preserve merchant aggregates)

Sales         ─► Analytics      : OrderOverridden                      (cache invalidation)
Catalog       ─► Analytics      : ProductCostCreated/Updated/Deleted   (recompute margins)
Marketing     ─► Analytics      : AdSpendRecorded (MANUAL),
                                  CampaignProductBindingCreated/Removed (recompute ROAS)
Finance       ─► Analytics      : TaxesUpdated, FeesConfigurationUpdated,
                                  OperationalCostRecorded/Updated/
                                  Deleted/StatusToggled,
                                  WarrantyReserveCreated/Updated/Deleted,
                                  FxRateCaptured                       (recompute profit margin)

Tenancy       ─► Notifications  : StoreMemberInvited                   (invitation email)
Integration   ─► Notifications  : IntegrationHandshakeFailed           (sync-error notification)
Sales (Go)    ─► Notifications  : OrderUpdated                         (per-Store opt-in push)
```

---

### 7.14 Error Codes Glossary

All error codes are returned as the string union from each Command/Read's `Errors` type. Codes are stable; frontend i18n maps them to localized strings.

```typescript
// ─────────── Global (used across most commands/reads) ───────────

type GlobalErrors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR";

// ─────────── BC1: Identity ───────────

type IdentityErrors =
  | "INVALID_EMAIL"
  | "EMAIL_ALREADY_REGISTERED"
  | "PASSWORD_TOO_WEAK"
  | "INVALID_CREDENTIALS"
  | "USER_DISABLED"
  | "INVALID_RESET_TOKEN"
  | "RESET_TOKEN_EXPIRED"
  | "RESET_TOKEN_ALREADY_USED"
  | "INVALID_TIMEZONE"
  | "INVALID_LEAD_TOKEN";

// ─────────── BC2: Tenancy ───────────

type TenancyErrors =
  | "STORE_NOT_FOUND"
  | "STORE_QUOTA_EXCEEDED"
  | "NO_ACTIVE_SUBSCRIPTION"
  | "REPORTING_CURRENCY_LOCKED"
  | "STORE_ALREADY_DISABLED"
  | "STORE_NOT_DISABLED"
  | "STORE_MEMBERSHIP_NOT_FOUND"
  | "CANNOT_REMOVE_LAST_OWNER"
  | "CANNOT_DEMOTE_LAST_OWNER"
  | "ALREADY_A_MEMBER"
  | "INVITATION_ALREADY_PENDING"
  | "INVALID_INVITATION_TOKEN"
  | "INVITATION_EXPIRED"
  | "INVITATION_ALREADY_USED";

// ─────────── BC3: Integration ───────────

type IntegrationErrors =
  | "STORE_INTEGRATION_NOT_FOUND"
  | "STORE_INTEGRATION_INACTIVE"
  | "STORE_INTEGRATION_ALREADY_DISCONNECTED"
  | "PLATFORM_NOT_SUPPORTED"
  | "INVALID_CREDENTIAL_FIELDS"
  | "OAUTH_CODE_INVALID"
  | "INTEGRATION_HANDSHAKE_FAILED"
  | "INTEGRATION_QUOTA_EXCEEDED"
  | "REINTEGRATION_RATE_LIMITED";

// ─────────── BC4: Sales ───────────

type SalesErrors =
  | "ORDER_NOT_FOUND"
  | "INVALID_LINE_ID"
  | "INVALID_OVERRIDE_FIELDS";

// ─────────── BC5: Catalog ───────────

type CatalogErrors =
  | "PRODUCT_NOT_FOUND"
  | "VARIANT_NOT_FOUND"
  | "PRODUCT_COST_NOT_FOUND"
  | "PRODUCT_COST_SCOPE_LOCKED"
  | "DUPLICATE_PRODUCT_COST_SCOPE"
  | "INVALID_DATE_RANGE"
  | "TAG_TOO_LONG"
  | "CSV_PARSE_ERROR";

// ─────────── BC6: Marketing ───────────

type MarketingErrors =
  | "CAMPAIGN_NOT_FOUND"
  | "AD_SPEND_NOT_FOUND"
  | "CANNOT_MUTATE_AUTOMATIC_AD_SPEND"
  | "BINDING_NOT_FOUND"
  | "BINDING_ALREADY_EXISTS";

// ─────────── BC7: Tracking ───────────

type TrackingErrors =
  | "PIXEL_NOT_SUPPORTED_FOR_PLATFORM";

// ─────────── BC8: Finance ───────────

type FinanceErrors =
  | "OPERATIONAL_COST_NOT_FOUND"
  | "WARRANTY_RESERVE_NOT_FOUND"
  | "INVALID_RATE"
  | "INVALID_START_DATE"
  | "FX_PROVIDER_UNAVAILABLE";

// ─────────── BC9: Analytics ───────────

type AnalyticsErrors =
  | "GOAL_NOT_FOUND"
  | "GOAL_LOCKED"
  | "INVALID_TARGET_AMOUNT"
  | "NO_PREVIOUS_GOAL_FOUND"
  | "STORE_INTEGRATION_NOT_FOUND"
  | "USER_NOT_FOUND"
  | "ADMIN_SECRET_INVALID";

// ─────────── BC10: Notifications ───────────

type NotificationsErrors =
  | "TARGET_USERS_OR_STORE_REQUIRED"
  | "NOTIFICATION_DELIVERY_NOT_FOUND";

// ─────────── BC11: Billing ───────────

type BillingErrors =
  | "SUBSCRIPTION_NOT_FOUND"
  | "EXTERNAL_SUBSCRIPTION_NOT_FOUND"
  | "BILLING_WEBHOOK_SIGNATURE_INVALID"
  | "BILLING_WEBHOOK_PAYLOAD_INVALID"
  | "BILLING_WEBHOOK_UNKNOWN_PLATFORM"
  | "SUBSCRIPTION_LOOKUP_FAILED";

// ─────────── All errors (the universe) ───────────

type AnyError =
  | GlobalErrors
  | IdentityErrors
  | TenancyErrors
  | IntegrationErrors
  | SalesErrors
  | CatalogErrors
  | MarketingErrors
  | TrackingErrors
  | FinanceErrors
  | AnalyticsErrors
  | NotificationsErrors
  | BillingErrors;
```

---

*End of document.*

