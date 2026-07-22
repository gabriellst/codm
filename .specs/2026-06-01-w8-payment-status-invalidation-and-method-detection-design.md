# Payment-Status Invalidation Sweep + Shopify Payment-Method Detection — Design Spec (W8)

**Date:** 2026-06-01
**Status:** Draft
**Bounded Context:** cross-context: go/sync, finance
**Kind:** bug
**Story Points:** 8 — cross-service contract (TypeSpec enum + dual-language codegen), migration-with-backfill (new `bank_slip_days` column on `finance.fees_configuration`), and new Go use-case in the sweep path that wires into W2's cron registry
**Part of:** .specs/2026-06-01-bk-dash-crucial-gaps-closure-roadmap-design.md (master roadmap)
**Depends on:** W2 (go-recurring-sync-scheduler)

---

## Context

The Go sync pipeline writes every inbound Shopify order to `sales.orders` with `payment_method = 'CREDIT_CARD'` unconditionally. The comment at line 283 of `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/go/internal/sync/services/shopify/order_normalizer.go` reads: `"Shopify rarely exposes per-order payment method; default"` — but Shopify does surface the method through `payment_gateway_names` and through transaction-level data. Brazilian merchants using Shopify Payments or third-party gateways (AppMax, Pagar.me, Yever) routinely process PIX and boleto orders; all of these are currently stored as `CREDIT_CARD`, corrupting any payment-method breakdown in the analytics layer.

By contrast, the NuvemShop normalizer at `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/go/internal/sync/services/nuvemshop/order_normalizer.go` already has a working `mapPaymentMethod` function that maps `"boleto"` → `BANK_SLIP` and `"pix"` → `PIX`. The Shopify normalizer needs an equivalent that reads the `payment_gateway_names[0]` string — a field already captured in `rawShopifyOrder.PaymentGateway` (line 42–43 of `order_normalizer.go`) — and maps it to the canonical `PaymentMethod` enum.

The second problem is structural: `PaymentStatus` in `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/contracts/wire/enums/payment-status.tsp` has no `CANCELED` value. PIX orders expire in 24 hours and boleto orders in a configurable number of days (defaulting to 7 in the source `bk-dash-backend` implementation). Without a `CANCELED` status, expired pending orders can never be moved to a terminal state; they accumulate as phantom pending revenue. The sweep logic also reads a `bankSlipDays` configuration from `FeesConfiguration`, but that field does not yet exist in the entity at `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/typescript/src/finance/entities/FeesConfiguration.ts` or the Drizzle schema at `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/contracts/db/schema/finance.ts`.

---

## Problem

1. All Shopify orders land in `sales.orders` with `payment_method = 'CREDIT_CARD'` regardless of actual method, because `order_normalizer.go` line 283 is a hardcoded default with no gateway-to-method mapping. PIX and boleto orders are misclassified.

2. `PaymentStatus` (TypeSpec source + both generated TS and Go outputs) has no `CANCELED` value. Expired pending PIX/boleto orders cannot be transitioned to a terminal state; pending revenue figures are permanently inflated.

3. `FeesConfiguration` has no `bankSlipDays` field. The sweep job has no configurable threshold to determine when a pending boleto order has expired. There is also no `bank_slip_days` column in `finance.fees_configuration`.

4. No scheduled sweep job exists (W2 cron is a dependency) to bulk-cancel pending PIX orders older than 24 h or pending boleto orders older than `bankSlipDays` days, nor to revert already-canceled orders back to `PENDING` when `bankSlipDays` increases.

---

## Goal

After this workstream:
- Shopify orders with PIX/boleto gateways are stored with the correct `PaymentMethod` (PIX or BANK_SLIP) instead of CREDIT_CARD.
- A `CANCELED` status exists in the canonical `PaymentStatus` contract and both generated targets (TypeScript, Go).
- `FeesConfiguration` carries a `bankSlipDays: number` field (default 7), persisted in `finance.fees_configuration`.
- A Go sweep job, registered into W2's cron scheduler, bulk-cancels expired pending PIX/boleto orders for Shopify and NuvemShop platforms and reverts back to PENDING when the merchant increases `bankSlipDays`.

---

## Decisions

1. **Add `CANCELED` to the TypeSpec `PaymentStatus` enum** at `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/contracts/wire/enums/payment-status.tsp`. Re-run contracts codegen (`bun contracts`) to propagate `CANCELED` into both `/packages/contracts/generated/typescript/src/wire/enums/payment-status.ts` and `/packages/contracts/generated/go/wire/enums.go`. The `payment_status` column in `sales.orders` is stored as `text` (confirmed in migration `0002_demonic_roulette.sql`) — no DB enum type migration is required; only the contracts codegen output changes.

2. **Shopify payment-method detection via `payment_gateway_names[0]`**. The `rawShopifyOrder` struct already captures `PaymentGateway []string \`json:"payment_gateway_names"\`` (order_normalizer.go lines 42–43). Introduce a `mapShopifyPaymentMethod(gateway string) string` function in `order_normalizer.go` that maps well-known Brazilian gateway strings (pix, pagarme_pix, appmax_pix, boleto, pagarme_boleto, appmax_boleto, and Shopify native boleto/pix identifiers) to `BANK_SLIP` or `PIX`, and falls back to `CREDIT_CARD` for card gateways and `OTHER` for unknown. Replace the hardcoded `string(wire.PaymentMethodCREDIT_CARD)` at line 283 with `mapShopifyPaymentMethod(gateway)`. This mirrors the pattern already established in the NuvemShop normalizer's `mapPaymentMethod`.

3. **`bankSlipDays` field on `FeesConfiguration`**. Add `bankSlipDays: z.number().int().min(1).default(7)` to `FeesConfigurationSchema` in `/packages/api/typescript/src/finance/entities/FeesConfiguration.ts`. Add `bankSlipDays: integer('bank_slip_days').notNull().default(7)` to the `feesConfiguration` Drizzle table in `/packages/contracts/db/schema/finance.ts`. Generate a new Drizzle migration (`bun migrate:create`) that emits `ALTER TABLE "finance"."fees_configuration" ADD COLUMN "bank_slip_days" integer NOT NULL DEFAULT 7`. The column default 7 makes the migration safe for existing rows (no manual backfill needed). Expose `bankSlipDays` in `UpdateFeesConfigurationInputSchema` in `/packages/api/typescript/src/finance/usecases/UpdateFeesConfiguration.ts`.

4. **Sweep job registered into W2's Go cron scheduler**. Implement `PaymentStatusInvalidationJob` in a new `internal/finance` Go package under `/packages/api/go/internal/finance/`. The job is registered with W2's cron at startup via the same `fx.Provide` + `ResultTags(\`group:"cron_jobs"\`)` pattern W2 defines for other periodic jobs. The job fires once per hour (matching the Go cron cadence from the master roadmap cross-cutting decision). The job reads all stores' active `FeesConfiguration.bankSlipDays` by calling the TS BFF API via the `Client` SDK singleton (`import tsclientgen "template/client-go/pkg/typescript"`) — consistent with the `project_sdk_client_singleton` memory rule that backend Go-to-TS calls use the SDK client, not hand-written HTTP.

5. **Scope: Shopify and NuvemShop only**. The sweep and the payment-method fix apply exclusively to `platform IN ('SHOPIFY', 'NUVEM_SHOP')`. Other platforms (CART_PANDA, YAMPI, KIWIFY) are PENDING stubs and are not affected.

6. **Sweep logic mirrors source behavior**. On each run:
   - Bulk-set `payment_status = 'CANCELED'` on `sales.orders` rows where `platform IN ('SHOPIFY', 'NUVEM_SHOP')` AND `payment_status = 'PENDING'` AND `payment_method = 'PIX'` AND `external_created_at < NOW() - INTERVAL '24 hours'`.
   - Bulk-set `payment_status = 'CANCELED'` on rows where `payment_status = 'PENDING'` AND `payment_method = 'BANK_SLIP'` AND `external_created_at < NOW() - INTERVAL '<bankSlipDays> days'` (per store).
   - Revert rows where `payment_status = 'CANCELED'` AND `payment_method = 'BANK_SLIP'` AND `external_created_at >= NOW() - INTERVAL '<bankSlipDays> days'` back to `PENDING` (handles merchant increasing `bankSlipDays`). PIX has a fixed 24 h expiry; no revert path for PIX.
   - Each bulk-update emits an `OrderUpdatedEvent` per affected row through a `BulkSetPaymentStatus(ctx, ids []string, status wire.PaymentStatus) error` method added to the order repository — keeping the outbox pattern consistent with how single-order saves work.

7. **W3 lands before W8 integration test**. The sweep operates on orders in `sales.orders`. If W3's order-ingest fix (correct variant linkage) has not landed, the sweep's integration test runs against incomplete order data. The AC for the sweep test is guarded by a note that W3 must be merged first.

---

## User Stories

**Story 1 — Shopify PIX classification**

Given a Shopify order with `payment_gateway_names: ["pagarme_pix"]` is ingested by the sync pipeline,
When `OrdersNormalizer.Normalize` maps the order to `OrderInput`,
Then `PaymentMethod` is `PIX`, not `CREDIT_CARD`.

**Story 2 — Shopify boleto classification**

Given a Shopify order with `payment_gateway_names: ["pagarme_boleto"]` is ingested,
When the normalizer maps the order,
Then `PaymentMethod` is `BANK_SLIP`.

**Story 3 — Expired PIX order canceled**

Given a PENDING PIX order (Shopify or NuvemShop platform) whose `external_created_at` is 25 hours ago,
When the `PaymentStatusInvalidationJob` runs,
Then the order's `payment_status` is updated to `CANCELED`.

**Story 4 — Expired boleto order canceled**

Given a merchant has `bankSlipDays = 7` and a PENDING BANK_SLIP order whose `external_created_at` is 8 days ago,
When the sweep job runs,
Then the order's `payment_status` is updated to `CANCELED`.

**Story 5 — Boleto revert on config increase**

Given a merchant increases `bankSlipDays` from 7 to 10 and an order was canceled at day 8,
When the sweep job runs after the config change,
Then that order's `payment_status` is reverted to `PENDING`.

**Story 6 — bankSlipDays persisted**

Given a merchant calls `PATCH /fees-configuration` with `bankSlipDays: 10`,
When `UpdateFeesConfiguration` executes,
Then the active `fees_configuration` row has `bank_slip_days = 10`.

---

## Acceptance Criteria

1. `PaymentStatus` in `/packages/contracts/wire/enums/payment-status.tsp` contains `CANCELED: "CANCELED"`. Both generated outputs (`/packages/contracts/generated/typescript/src/wire/enums/payment-status.ts` and `/packages/contracts/generated/go/wire/enums.go`) expose the new value. `bun tsc` passes.

2. `OrdersNormalizer.Normalize` in `order_normalizer.go` calls `mapShopifyPaymentMethod(gateway)` (not a hardcoded literal). Unit tests in `order_normalizer_test.go` cover: `pagarme_pix` → `PIX`, `pagarme_boleto` → `BANK_SLIP`, `shopify_payments` → `CREDIT_CARD`, empty gateway → `CREDIT_CARD` (fallback).

3. `FeesConfigurationSchema` includes `bankSlipDays: z.number().int().min(1).default(7)`. The `fees_configuration` Drizzle table has a `bank_slip_days integer NOT NULL DEFAULT 7` column. A migration file under `/packages/contracts/db/migrations/` adds this column. `bun tsc` passes.

4. `UpdateFeesConfiguration` accepts and persists `bankSlipDays` input. A test in `/packages/api/typescript/src/finance/usecases/FeesConfiguration.test.ts` asserts that calling `UpdateFeesConfiguration` with `bankSlipDays: 10` produces a row with `bank_slip_days = 10`.

5. `PaymentStatusInvalidationJob` exists in `/packages/api/go/internal/finance/` (new) and is registered into W2's cron job group. `go build ./...` passes.

6. Given a PENDING PIX order older than 24 h in a Go integration test, when the job's cancel sweep runs, the order row has `payment_status = 'CANCELED'`. Scope filter `platform IN ('SHOPIFY', 'NUVEM_SHOP')` is enforced: a PENDING PIX order for a PENDING-stub platform is not canceled.

7. Given a PENDING BANK_SLIP order older than `bankSlipDays` days, when the sweep runs, the row has `payment_status = 'CANCELED'`. Given the same row after `bankSlipDays` is increased (so the order is no longer expired), when the sweep runs again, the row reverts to `payment_status = 'PENDING'`.

8. Each bulk status change produces an `OrderUpdatedEvent` in `shared.outbox` (verified in the Go integration test via direct SQL or the domain-event query).

---

## Open Questions

1. **Shopify gateway string catalog**: the mapping in Decision 2 covers gateways observed in bk-dash-backend (`pagarme_pix`, `pagarme_boleto`, `appmax_pix`, `appmax_boleto`). Are there additional Brazilian gateway strings (e.g. Yever PIX, Boa Compra boleto) that need explicit entries? This determines whether the initial PR ships with a narrow allowlist or a broader heuristic (substring `"pix"` → PIX, substring `"boleto"` → BANK_SLIP as catch-all fallback before OTHER).

2. **SDK call vs. Go-side FeesConfiguration read**: Decision 4 proposes the sweep reads `bankSlipDays` via the TS Client SDK singleton (Go → TS BFF). An alternative is a direct SQL read against `finance.fees_configuration` from Go (adding a minimal Go-side read query). The SDK-singleton path is consistent with the memory rule but adds a network hop per store; the direct SQL path avoids it but introduces a cross-BC read in Go. Confirm preferred approach before implementation.

3. **W3 gate**: confirm W3 (order-ingest variant fix) has landed before merging W8's sweep integration test suite.

---

## Out of Scope

- CartPanda, Yampi, Kiwify payment-method detection (those normalizers are PENDING stubs).
- Payment-method detection from Shopify transaction-level data (`/orders/:id/transactions.json` is a separate pull tracked as a future iteration per the existing code comment in `order_normalizer.go`).
- PIX revert path (PIX expiry is fixed at 24 h; no merchant-configurable override).
- Any dispute pipeline changes.
- Changes to `OperationalCostPaymentStatus` (separate enum, unrelated to order payment status).
