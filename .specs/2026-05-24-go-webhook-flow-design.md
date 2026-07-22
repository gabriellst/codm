# Go Webhook Flow Rewrite — Design Spec (Spec B of 3)

**Date:** 2026-05-24
**Status:** Approved
**Bounded Context:** Go service — `internal/webhooks` (reuses `internal/sync` events + handlers from Spec A)
**Kind:** feature (architectural rewrite)
**Story Points:** 13 — single controller + two-layer event indirection (`WebhookReceivedEvent` → handler → mapper → `ExternalXUpdatedEvent`) + `(platform,event)` mapper factory rekey + per-`(platform,event)` mapper impls; reuses Spec A's handler chain (no new persistence).

> **Spec B of a 3-spec sequence.** Depends on **Spec A** (`.specs/2026-05-24-go-sync-restructure-design.md`, built) — specifically its `internal/sync/events/External{Order,Product,ProductVariant}UpdatedEvent` + the per-entity handlers registered with the mediator. Spec B makes webhook ingest a SECOND producer of those same external events, so persistence + wire-event publication are reused unchanged. Spec C (sync kinds) is independent of B.

## Context

The Go webhooks BC (`packages/api/go/internal/webhooks/`) currently exposes **9 per-platform controllers** (`shopify_webhook.go`, `cartpanda_webhook.go`, … `tiktok_webhook.go`), each a thin wrapper calling `services.WebhookDispatcher.Dispatch(ctx, "<PLATFORM>", "<sig-header>", r)`. The dispatcher: reads the body, resolves a `WebhookVerifier` by platform (HMAC schemes via `WebhookVerifierFactory`), verifies the signature, resolves a `WebhookMapper` by platform (`WebhookMapperFactory`), runs `mapper.Map(ctx, rawBody) → MappedWebhook{ExternalEventID, WebhookEventType, Events []any}`, builds a `WebhookReceivedEvent` with a deterministic id (`HashedID("webhook", platform, externalEventId)` → dedupe via the events-table PK), and `DomainEventRepository.Save`s it.

Two structural gaps:
1. **The chain dead-ends at "raw `WebhookReceivedEvent` saved."** Nothing consumes `WebhookReceivedEvent`. `MappedWebhook.Events []any` is computed but **discarded** — the dispatcher only reads `ExternalEventID` + `WebhookEventType`. No domain entity is ever persisted from a webhook.
2. **The mapper factory is keyed by platform only.** A platform's webhook can carry many event types (order/updated, product/updated, refund/created…), but one `WebhookMapper` per platform must internally branch on the event — there's no `(platform, event)` resolution.

Spec A (built) introduced `internal/sync/events/External{Order,Product,ProductVariant}UpdatedEvent` + per-entity handlers (`internal/sync/handlers/`) registered with the `mediator.InternalMediator`. Those handlers persist the canonical entity to `internal/sync/storage/<entity>` and publish the `integration.shared.<entity>.updated` wire event. Spec A's sync pipelines already publish those external events; Spec B makes webhooks the second producer.

The shape Spec B implements is the user-provided flow (Excalidraw): **Webhook Controller `(?platform,?event,?integrationId)` → publishes `WebhookReceivedEvent` → `WebhookReceivedEventHandler` → `WebhookMapperFactory.Get(platform,event)` → `Mapper(request)→ExternalXUpdatedEvent` → published → `ExternalXUpdatedHandler` (Spec A) persists + publishes the wire event.**

## Problem

1. **Webhook ingest persists nothing.** A live Shopify `orders/updated` webhook is verified, its raw body saved to the event log, and then dropped — the canonical order is never upserted. The read model never reflects webhook-driven changes (only full syncs do).
2. **Nine near-identical controllers.** Each per-platform controller is boilerplate differing only in the platform string + signature header. Adding a platform means a new controller file.
3. **Mapper can't be selected by event type.** `(platform)` keying forces a single mapper per platform to switch over event types internally, instead of one focused mapper per `(platform, event)` the way the reference (`bk-dash-backend`) does it.

## Goal

Collapse the 9 controllers into **one** `WebhookController` keyed by `?platform&event&integrationId` query params that verifies (per-platform) and publishes a `WebhookReceivedEvent`. A new `WebhookReceivedEventHandler` resolves a `(platform, event)` mapper from the factory, maps the raw body into Spec A's `ExternalXUpdatedEvent`(s), and publishes them — at which point Spec A's already-registered per-entity handlers persist the canonical entity + publish the wire event. Webhook ingest thus reaches the read model through the exact same handler chain as sync, with zero duplicated persistence logic. Per-`(platform, event)` mappers are added incrementally; `SHOPIFY × order/updated` ships as the reference, the rest as PENDING stubs.

## Decisions

1. **One `WebhookController`** at `POST /webhooks?platform=<SalesPlatform>&event=<provider event name>&integrationId=<uuid>` (RESOLVED: all-query-param form, per the Excalidraw diagram). Replaces the 9 per-platform controllers (all deleted). `platform` is validated against the `SalesPlatform` wire enum; `event` is a provider-native event-name string; `integrationId` is the target `store_integration` UUID. Unknown/missing `platform` → 400; missing `event` or `integrationId` → 400.
2. **The controller verifies then publishes.** Resolve the `WebhookVerifier` by platform (existing `WebhookVerifierFactory`), verify the raw body against the platform's signature header, then publish a `WebhookReceivedEvent`. No mapping in the controller. Invalid signature → 401; verified → 202 Accepted.
3. **`WebhookReceivedEvent` payload gains `event` + `integrationId`.** Extend the existing `WebhookReceivedPayload{Platform, ExternalEventID, WebhookEventType, RawBody}` with `Event string` (the `?event` param) and `IntegrationID string`. Dedupe id stays `HashedID("webhook", platform, externalEventId)`.
4. **New `WebhookReceivedEventHandler`** (`internal/webhooks/handlers/`) implements `mediator.DomainEventHandler` on `WebhookReceivedEvent`. It resolves `WebhookMapperFactory.Get(platform, event)`, runs the mapper over the raw body, and publishes each resulting `ExternalXUpdatedEvent` via an injected `ExternalEventPublisher` (the same port shape Spec A defined — `mediator.Dispatch` inline, since the webhook controller already returned 202 and the handler runs in the dispatcher).
5. **`WebhookMapper` interface returns Spec A's events.** Change `Map` to `Map(ctx, rawBody []byte) ([]types.DomainEventI, error)` returning `internal/sync/events.ExternalXUpdatedEvent`(s). The factory keys on `(platform, event)`. Mapper impls live at `internal/webhooks/mappers/<platform>/<event>.go`.
6. **Per-`(platform, event)` mapper impls.** Ship `ShopifyOrderUpdatedWebhookMapper` (`SHOPIFY`, `orders/updated`) as the reference — it parses the Shopify order payload into `sync` storage's `OrderInput` and returns an `ExternalOrderUpdatedEvent`. All other `(platform, event)` pairs register as PENDING mappers returning a typed `WEBHOOK_MAPPER_PENDING` error (mirrors Spec A's `PendingPipeline`).
7. **Reuse Spec A's `ExternalXUpdatedHandler`s unchanged.** The external events the webhook handler publishes are consumed by the sync BC's already-registered per-entity handlers. Spec B adds **no** persistence code and **no** new wire events.
8. **Keep the existing per-platform `WebhookVerifier`s + `WebhookVerifierFactory`** (HMAC schemes). Delete `WebhookDispatcher` (its verify-then-save responsibility splits between the controller and the handler) and the per-platform controllers.

## User Stories

- **Story 1:** As a merchant whose store fires a Shopify `orders/updated` webhook, I want the canonical order persisted, so the dashboard reflects the change without waiting for a full sync. *(Decisions 4–7; AC-1, AC-2)*
  - Given a verified `SHOPIFY` `orders/updated` webhook for a connected integration, when it's received, then an `ExternalOrderUpdatedEvent` is published and the sync order handler upserts the canonical order + publishes `integration.shared.order.updated`.
- **Story 2:** As a developer adding a new provider/event, I want to register one `(platform, event)` mapper, so I don't write a controller or branch inside a god-mapper. *(Decisions 1, 5, 6; AC-3, AC-4)*
  - Given a new mapper registered for `(KIWIFY, order.paid)`, when a Kiwify `order.paid` webhook arrives, then the factory routes to it with no controller change.
- **Story 3:** As an operator, I want unsigned/invalid webhooks rejected before any event is published, so forged payloads can't drive persistence. *(Decision 2; AC-5)*
  - Given a webhook with a bad signature, when received, then the controller returns 401 and publishes no `WebhookReceivedEvent`.

## Acceptance Criteria

- [ ] **AC-1:** A single `WebhookController` serves `POST /webhooks?platform&event&integrationId`; the 9 per-platform controllers are deleted (`go build` green; route test asserts the single endpoint).
- [ ] **AC-2:** A verified `SHOPIFY`/`orders/updated` webhook results in an `ExternalOrderUpdatedEvent` being published and the sync `OrderUpdatedHandler` upserting the order + saving the wire event (Go integration/flow test through the mediator).
- [ ] **AC-3:** `WebhookMapperFactory.Get(platform, event)` returns the registered mapper for `(SHOPIFY, orders/updated)`; an unregistered `(platform, event)` returns a typed `WEBHOOK_MAPPER_PENDING` (or not-found) error, not a panic.
- [ ] **AC-4:** `WebhookReceivedEventHandler` implements `mediator.DomainEventHandler` on `WebhookReceivedEvent`, resolves the `(platform,event)` mapper, and publishes the mapper's `ExternalXUpdatedEvent`s (unit test with a fake mapper + capture publisher).
- [ ] **AC-5:** An invalid signature returns 401 and publishes no `WebhookReceivedEvent` (controller test with a failing verifier).
- [ ] **AC-6:** `WebhookReceivedPayload` carries `Event` + `IntegrationID`; dedupe id remains `HashedID("webhook", platform, externalEventId)` (unit test asserts deterministic id stability).
- [ ] **AC-7:** `go build ./...` + `go test ./...` + `go vet ./internal/webhooks/...` green.

## Risks & Migration

- **Wire-contract continuity:** Spec B publishes Spec A's external events, which flow to Spec A's handlers producing the SAME `integration.shared.<entity>.updated` wire events the old (discarded) path never actually produced. Net new persistence behavior — no existing consumer regresses (the old path persisted nothing).
- **Route change:** `POST /webhooks/<platform>` → `POST /webhooks?platform=&event=&integrationId=` (RESOLVED: all-query-param). External providers' webhook registrations point at whatever URL the integration handshake configured; confirm the registration writer (TS Integration BC / handshake) emits the new query-param URL before deleting the old per-platform routes. Dependency: providers must preserve the query string on the registered webhook URL — verify per provider when wiring real (non-Shopify) mappers in follow-ups.
- **PENDING mappers:** only `SHOPIFY`/`orders/updated` is real; every other `(platform,event)` returns `WEBHOOK_MAPPER_PENDING`. Live webhooks for unimplemented pairs are verified + `WebhookReceivedEvent`-logged but produce no entity (graceful, not a 500).

## Open Questions

- **Dedupe granularity:** dedupe on `WebhookReceivedEvent` (raw, current) vs additionally on the derived `ExternalXUpdatedEvent`. Current raw-level dedupe is retained; entity-level idempotency is already handled by the storage UPSERT (deterministic id). No second dedupe planned unless `/plan` finds a gap.
