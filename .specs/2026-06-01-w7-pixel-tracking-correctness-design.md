# Pixel Tracking Correctness — clientId Stitching, Retroactive Backfill, Dedup TTLs — Design Spec (W7)

**Date:** 2026-06-01
**Status:** Draft
**Bounded Context:** go/sync (tracking)
**Kind:** bug
**Story Points:** 8 — 5-pt base (new `pixelstitch` service + `retroactive` migration-with-backfill + two new `ReadRepository` methods + handler wiring) + 1 tier for migration-with-backfill (`retroactive` column added to existing `tracking.pixel_events`) + 1 tier for cross-service contract change (new `FindVisitorKeyByCartExternalId` read touches `tracking.pixel_events` across the Go/TS shared schema boundary); three discrete correctness behaviors, each with its own persistence path.
**Part of:** .specs/2026-06-01-bk-dash-crucial-gaps-closure-roadmap-design.md (master roadmap)
**Depends on:** none (Wave 0)

## Context

The pixel ingest pipeline ships in `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/go/internal/sync/` and is structurally complete: the Shopify mapper at `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/go/internal/webhooks/mappers/shopify/pixel_event_recorded.go` normalizes raw browser events; `PixelEventRecordedHandler` at `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/go/internal/sync/handlers/pixel_event_recorded_handler.go` resolves the sales-channel, queries prior stages for the visitor, calls `pixelbackfill.SynthesizeMissingStages`, and bulk-upserts via `PgPixelStorage` at `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/go/internal/sync/storage/pixel/pixel_pg.go`. The Redis throttle lives at `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/go/internal/sync/services/pixelthrottle/throttle.go`; the backfill synthesizer at `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/go/internal/sync/services/pixelbackfill/backfill.go`. The read side — `PixelEventReadRepository` at `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/typescript/src/tracking/repositories/PixelEventReadRepository/PixelEventReadRepository.ts` — feeds `GetPixelFunnel` and is TS-owned.

The database schema is the Drizzle source at `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/contracts/db/schema/tracking.ts`, materialized by migration `0006_gorgeous_morph.sql`. The `tracking.pixel_events` table has `visitor_key` and `cart_external_id` columns but **no `retroactive` column**. The Go read-side port at `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/go/internal/sync/repositories/pixel/pixel_read.go` exposes only `DistinctStagesForVisitor` — there is no method to look up a prior visitor key by cart token.

Three source behaviors from the `bk-dash-backend/backend-old` reference's `PixelCreatedHandler` were intentionally deferred in the 2026-05-28 spec: (1) clientId stitching across cart/checkout sessions, (2) a `retroactive` boolean column to distinguish synthesized rows from real ones, and (3) explicit confirmation that the `active=true` sales-channel guard (already implemented) satisfies the skip-if-no-pixels requirement. The master roadmap (`.specs/2026-06-01-bk-dash-crucial-gaps-closure-roadmap-design.md` § W7) now reopens all three as correctness bugs because they silently corrupt attribution and inflate funnel counts.

## Problem

1. **clientId is not stitched across cart sessions.** Shopify's pixel SDK issues a fresh `clientId` for the `checkout_completed` event (the checkout iframe has a different browsing context than the storefront). If the handler stores the CHECKOUT_COMPLETED row with an empty or new `visitor_key`, the visitor's full funnel path — which the storefront correctly recorded under the original `clientId` — is broken. The `DistinctStagesForVisitor` query then finds no prior stages, triggers a full backfill synthesizing all earlier steps as synthetic rows attributed to a ghost visitor, and double-counts every funnel stage for that checkout.

2. **Synthetic backfill rows carry no `retroactive` marker.** The `pixelbackfill.SynthesizeMissingStages` doc already notes this gap: "There is no `retroactive` flag (the table has none)." Without it, the TS `GetPixelFunnel` use case cannot distinguish a real `PAGE_VIEWED` from one synthesized because the visitor skipped to checkout. Any query filtering on `retroactive = false` (e.g. accurate attribution reports, future cohort analysis) returns incorrect totals, and the current aggregation silently conflates real and synthetic events in every count.

3. **The `DistinctStagesForVisitor` query uses `visitor_key` equality**, which only works correctly after stitching. Without stitching, Problem 1 and Problem 2 compound: the full backfill fires on the wrong visitor, synthetic rows accumulate for ghost visitors, and funnel counts inflate on every CHECKOUT_COMPLETED.

## Goal

After this workstream, a merchant's pixel funnel accurately reflects real visitor paths: a `CHECKOUT_COMPLETED` event whose checkout-iframe `clientId` differs from the storefront `clientId` is stitched to the correct prior visitor via cart token lookup, inheriting the correct `visitor_key` before persistence; every synthesized upstream row is flagged `retroactive = true` so read-side queries can filter to real-only events; and the three existing behaviors — per-type TTL dedup, forward-funnel backfill, and silent skip for inactive integrations — continue to work correctly after the handler is extended.

## Decisions

1. **Add `retroactive boolean NOT NULL DEFAULT false` to `tracking.pixel_events`.** This is a Drizzle schema amendment in `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/contracts/db/schema/tracking.ts` that generates a migration. The migration is forward-safe: all existing rows default to `false` (real events). Synthetic rows produced by `pixelbackfill.SynthesizeMissingStages` set `retroactive = true`; the Go `PgPixelStorage.upsert` writes the field; the TS `DrizzlePixelEventReadRepository` projects it.

2. **Add `retroactive bool` to `PixelEventInput` and `PixelEvent`.** `SynthesizeMissingStages` sets `retroactive = true` on the returned inputs; `NewPixelEventFromProviderInput` propagates the field; the `PgPixelStorage` UPSERT writes it; the `ON CONFLICT DO UPDATE` preserves it with `retroactive = EXCLUDED.retroactive` so a real event that later arrives replaces its synthetic twin's flag (i.e. a real `PAGE_VIEWED` after its synthetic twin correctly becomes `false`). The deterministic synthetic `externalEventId` (`synthetic:{visitorKey}:{stage}:{windowDay}`) already ensures they share the same `id`, so the UPSERT key fires and the conflict-update path executes.

3. **Add `FindVisitorKeyByCartExternalId(ctx, storeIntegrationID, cartExternalID string, since time.Time) (string, bool, error)` to `ReadRepository`.** This is the lookup that enables stitching: given the `cartExternalId` from the incoming CHECKOUT_COMPLETED, scan `tracking.pixel_events` for the most-recent `CHECKOUT_STARTED` or `CART_VIEWED` row with that `cart_external_id` within the 24h window, and return its `visitor_key`. Implementation lives in `pixel_read_pg.go` (`PgReadRepository`). The 24h window reuses the same constant as the backfill window.

4. **Add a `pixelstitch` package** at `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/go/internal/sync/services/pixelstitch/` (new) with a pure `StitchVisitorKey(input PixelEventInput, priorKey string) PixelEventInput` function. If the event is `CHECKOUT_COMPLETED` (or `CHECKOUT_CONTACT_INFO_SUBMITTED`) AND `input.VisitorKey` is empty or differs from the prior session's `visitor_key` (prior found via Decision 3), then replace `input.VisitorKey` with the prior key. If no prior row is found (visitor went straight to checkout on a fresh session), the original `VisitorKey` is preserved as-is. Stitching is a pure transform, not a DB write.

5. **The handler calls stitching before throttle and backfill.** The updated `PixelEventRecordedHandler.Handle` flow becomes: (a) resolve sales-channel → (b) stitch visitor key if applicable → (c) throttle check on the stitched key → (d) build `PixelEvent` → (e) query `DistinctStagesForVisitor` on the stitched key → (f) synthesize missing stages with `retroactive = true` → (g) enqueue batch. This order is required: throttle must operate on the canonical visitor key (post-stitch), and backfill must query stages under the stitched key.

6. **The `retroactive` field is read-side visible via `PixelFunnelStage` but the `GetPixelFunnel` use case does not filter by it by default.** The TS `PixelEventReadRepository.aggregateFunnelStages` adds `retroactive` to the Drizzle select; `PixelFunnelStage` gains an optional `retroactiveCount` field so dashboards can optionally expose the split. The existing `count` and `uniqueSessions` continue to include all rows (synthetic + real) to match the pre-spec behavior; the new `retroactiveCount` is additive. This is the minimal contract change needed without breaking existing callers.

7. **The `active = true` guard in `saleschannel.Resolver` already implements the skip-if-no-pixels requirement.** The resolver at `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/go/internal/sync/services/saleschannel/resolver.go` queries `integration.store_integrations WHERE id = $1 AND type = 'SALES_CHANNEL' AND active = true`; an inactive or missing integration returns `PIXEL_UNKNOWN_STORE_INTEGRATION` and the handler returns an error before writing. No additional guard is needed.

8. **No NuvemShop pixel mapper.** The scope is explicitly the existing Shopify/NuvemShop pixel path. NuvemShop registers a `PendingMapper` for `EXTERNAL_PIXEL_EVENT_RECORDED`; no stitching or backfill changes are needed on the NuvemShop side because no NuvemShop pixel mapper produces events today.

9. **No change to per-type TTL values.** The TTL table in `pixelthrottle/throttle.go` is correct per the source reference (`PAGE_VIEWED` 60s, `PRODUCT_VIEWED` 300s, `PRODUCT_ADDED_TO_CART`/`PRODUCT_REMOVED_FROM_CART`/`CART_VIEWED`/`CHECKOUT_STARTED` 1800s, `CHECKOUT_COMPLETED`/`CHECKOUT_CONTACT_INFO_SUBMITTED` 0). This workstream confirms correctness; no code change.

## User Stories

**Story 1 — Merchant's conversion funnel is attributed to the right visitor.**

Given a Shopify storefront pixel emits `page_viewed`, `product_viewed`, `product_added_to_cart`, `checkout_started` with `clientId = "storefront-abc"` and `cartToken = "tok-1"`, and later emits `checkout_completed` with `clientId = "checkout-xyz"` (a different checkout-context id) and the same `cartToken = "tok-1"`, when the `checkout_completed` event is ingested, then the persisted `visitor_key` on the `CHECKOUT_COMPLETED` row is `"storefront-abc"` (stitched from the prior `CHECKOUT_STARTED` row by cart token), the throttle and backfill queries operate under `"storefront-abc"`, and no duplicate funnel path is created for `"checkout-xyz"`.

**Story 2 — Retroactive synthetic rows are distinguishable from real events.**

Given a visitor whose first-recorded pixel event is `CHECKOUT_STARTED` with no prior stages in the 24h window, when the handler synthesizes `PAGE_VIEWED`, `PRODUCT_VIEWED`, `PRODUCT_ADDED_TO_CART`, and `CART_VIEWED` rows for that visitor, then each synthesized row has `retroactive = true` and the real `CHECKOUT_STARTED` row has `retroactive = false`. When a real `PAGE_VIEWED` later arrives for the same visitor within the same day, the `ON CONFLICT DO UPDATE` sets `retroactive = false` on that row.

**Story 3 — Duplicate pixel events within the TTL window are silently dropped.**

Given two `page_viewed` events arrive for the same `(visitorKey, storeIntegrationId)` within 60 seconds, when both are processed by the handler, then only the first produces a row in `tracking.pixel_events`; the second is dropped by the Redis throttle before reaching the storage channel.

**Story 4 — Pixel events for inactive integrations are silently skipped.**

Given a `checkout_completed` event arrives with a `storeIntegrationId` whose `integration.store_integrations` row has `active = false`, when the handler attempts to resolve the sales-channel, then no row is written to `tracking.pixel_events` and the handler returns `PIXEL_UNKNOWN_STORE_INTEGRATION`.

## Acceptance Criteria

1. `packages/contracts/db/schema/tracking.ts` adds `retroactive: boolean('retroactive').notNull().default(false)` to `pixelEvents`; a new Drizzle migration file is generated; all existing rows default to `false`; `go build ./...` and `bun tsc` pass after the migration.

2. `PixelEventInput.Retroactive bool` and `PixelEvent.retroactive bool` fields exist; `NewPixelEventFromProviderInput` propagates the field; `PgPixelStorage.upsert` writes `retroactive` and its `ON CONFLICT DO UPDATE` clause includes `retroactive = EXCLUDED.retroactive`; `SynthesizeMissingStages` returns inputs with `Retroactive = true`; real-event inputs default to `Retroactive = false`.

3. `ReadRepository.FindVisitorKeyByCartExternalId(ctx, storeIntegrationID, cartExternalID string, since time.Time) (visitorKey string, found bool, err error)` is defined in `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/go/internal/sync/repositories/pixel/pixel_read.go` and implemented in `pixel_read_pg.go`; the query selects the `visitor_key` of the most-recent `CHECKOUT_STARTED` or `CART_VIEWED` row matching `(store_integration_id, cart_external_id)` within `since`; returns `found=false` when no row matches.

4. `services/pixelstitch/` (new) contains a pure `StitchVisitorKey(input PixelEventInput, priorKey string, found bool) PixelEventInput`; when `input.EventType == CHECKOUT_COMPLETED` (or `CHECKOUT_CONTACT_INFO_SUBMITTED`) AND `found == true`, it returns the input with `VisitorKey` replaced by `priorKey`; for all other event types or when `found == false`, it returns the input unchanged; no DB access inside the function; unit tests cover the four branches (CHECKOUT_COMPLETED + found, CHECKOUT_COMPLETED + not found, non-checkout event, empty priorKey).

5. `PixelEventRecordedHandler` calls `readRepo.FindVisitorKeyByCartExternalId` for every incoming event with a non-empty `CartExternalID`, then calls `pixelstitch.StitchVisitorKey` before the throttle check; throttle, `DistinctStagesForVisitor`, and `NewPixelEventFromProviderInput` all receive the stitched `input`; handler test `TestPixelHandler_StitchesClientIdFromPriorCheckout` verifies that a `CHECKOUT_COMPLETED` with `cartExternalId="tok-1"` and a `fakeReadRepo` returning a prior `visitor_key="storefront-abc"` for that token produces a row with `VisitorKey() == "storefront-abc"`.

6. Given a `CHECKOUT_COMPLETED` event arrives with `cartExternalId="tok-1"` and `visitorKey=""`, and `FindVisitorKeyByCartExternalId` returns `("storefront-abc", true, nil)`, when the handler processes it, then `tracking.pixel_events` contains a row with `visitor_key = 'storefront-abc'` and `retroactive = false`.

7. Given a `CHECKOUT_STARTED` event arrives with no prior stages for `visitorKey="v-1"` in the 24h window, when the handler processes it, then `tracking.pixel_events` contains rows for `PAGE_VIEWED`, `PRODUCT_VIEWED`, `PRODUCT_ADDED_TO_CART`, `CART_VIEWED` with `retroactive = true` and one row for `CHECKOUT_STARTED` with `retroactive = false`.

8. `go test ./internal/sync/...`, `go vet ./...`, `bun tsc`, and `bun lint` all pass after the changes; no new `bun run test` failure is introduced.

## Open Questions

- **TS read-side `retroactiveCount` field placement.** Decision 6 adds an optional `retroactiveCount` to `PixelFunnelStage` in the TS `GetPixelFunnel` output schema. If the dashboard team prefers to keep the schema frozen and expose `retroactive` only as a separate query, the field can be omitted here and added in a follow-up. This decision can be deferred to plan time without blocking the Go side.

## Out of Scope

- NuvemShop pixel mapper (no NuvemShop pixel path ships in this project).
- Changes to per-type TTL values (confirmed correct; no code change).
- Historical backfill of existing `tracking.pixel_events` rows to set correct `retroactive` values (all existing rows default to `false` via migration, which is safe: pre-spec rows were real events or synthetic events whose distinction was never tracked — treating them as real is a conservative default).
- The `CartLinkedToOrderEvent` / `sales.carts` Cart projection (separate spec, out of W7 scope per the master roadmap).
- Any change to `GetPixelFunnel` filtering logic beyond the additive `retroactiveCount` field.
