# Finance Integration-Event Handlers — Design Spec (W5)

**Date:** 2026-06-01
**Status:** Draft
**Bounded Context:** finance
**Kind:** feature
**Story Points:** 5 — 10 handler classes (artifact count at the 3-5 tier boundary), cross-service contract (wire events already codegen'd, but handlers are the publishing bridge that activates them for Go/future consumers)
**Part of:** .specs/2026-06-01-bk-dash-crucial-gaps-closure-roadmap-design.md (master roadmap)
**Depends on:** none (Wave 0)

---

## Context

The finance bounded context manages five configuration domains: taxes, fees configuration, operational costs, warranty reserves, and FX rates. All 10 write-side use cases (`UpdateTaxes`, `UpdateFeesConfiguration`, `CreateOperationalCost`, `UpdateOperationalCost`, `DeleteOperationalCost`, `ToggleOperationalCostStatus`, `CreateWarrantyReserve`, `UpdateWarrantyReserve`, `DeleteWarrantyReserve`, `CaptureFxRates`) already persist their domain events to the outbox via `domainEventRepository.save(...)` inside a `withTransaction` call. The 10 corresponding wire (integration) event classes are already codegen'd and committed at `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/contracts/generated/typescript/src/wire/events/` — `taxes-updated.ts`, `fees-configuration-updated.ts`, `operational-cost-recorded.ts`, `operational-cost-updated.ts`, `operational-cost-deleted.ts`, `operational-cost-status-toggled.ts`, `warranty-reserve-created.ts`, `warranty-reserve-updated.ts`, `warranty-reserve-deleted.ts`, `fx-rate-captured.ts`.

Today `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/typescript/src/finance/index.ts` declares `internalHandlers = {}` and `externalHandlers = {}` (lines 5–6), and no `handlers/` directory exists under the finance context. The outbox dispatcher has nothing to route finance domain events to, so they accumulate in `shared.outbox` and are never forwarded as integration events — Go workers and any future consumer are blind to finance state changes.

The canonical pattern is established in `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/typescript/src/billing/handlers/SubscriptionQuotaUpdatedPublisher.ts`: one `@injectable()` class per domain event extending `EventHandler<typeof DomainEvent>`, injecting `ExternalMediator`, and calling `this.mediator.publish(new WireEvent({...}))`. The `billing/handlers/internal.ts` barrel re-exports them; `finance/index.ts` must do the same.

---

## Problem

1. All 10 finance domain events enter the outbox on every write but are never published as integration events. No downstream consumer (Go worker, future analytics pipeline, future webhook relay) can react to finance configuration changes — taxes, fees, operational costs, warranty reserves, or FX rates.
2. `finance/index.ts` `internalHandlers` is an empty object literal, so the `BoundedContext` framework never registers any handler subscriptions for finance events against the outbox dispatcher.
3. There is no `finance/handlers/` directory, meaning the pattern every bounded context with publishing enforces — handler-per-event-name, publisher class, barrel export, `internal.ts` / `external.ts` stubs — is entirely absent from finance.

---

## Goal

Create `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/typescript/src/finance/handlers/` containing one `EventHandler` publisher class per finance domain event (10 total), wired into `finance/index.ts` `internalHandlers`, so that every finance configuration change immediately produces its corresponding `integration.shared.finance.*` integration event through the outbox dispatcher — making the finance context a first-class signal source for Go workers and any future consumer.

---

## Decisions

1. **One handler class per domain event.** `EventHandler.name` binds to `this.event.name` for auto-registration; a single class can only declare one `event` field. No merging of handlers. Convention: `<DomainEventName>Handler` (e.g. `TaxesUpdatedHandler`) — no `On` prefix (per the `handler-per-event-name` codebase convention).

2. **Group related publishers in one file per aggregate/topic.** Mirrors how `SubscriptionQuotaUpdatedPublisher.ts` houses multiple handlers in one file with a shared private `publish()` helper. Finance groupings:
   - `TaxesUpdatedPublisher.ts` — 1 class: `TaxesUpdatedHandler`
   - `FeesConfigurationUpdatedPublisher.ts` — 1 class: `FeesConfigurationUpdatedHandler`
   - `OperationalCostPublisher.ts` — 4 classes: `OperationalCostRecordedHandler`, `OperationalCostUpdatedHandler`, `OperationalCostDeletedHandler`, `OperationalCostStatusToggledHandler`
   - `WarrantyReservePublisher.ts` — 3 classes: `WarrantyReserveCreatedHandler`, `WarrantyReserveUpdatedHandler`, `WarrantyReserveDeletedHandler`
   - `FxRateCapturedPublisher.ts` — 1 class: `FxRateCapturedHandler`

   Total: 5 publisher files, 10 handler classes.

3. **Wire event payload is the lean shape from the contracts package.** Each publisher maps the minimal identifiers from the domain event payload to the wire event schema already defined in `@template/contracts-typescript/wire/events`. No domain entity types cross the wire — only `storeId`, `*Id`, scalar fields, and enums as declared in the codegen'd wire schemas (e.g. `TaxesUpdatedEvent` carries `storeId`, `taxesId`, `effectiveAt`; `FxRateCapturedEvent` carries `fromCurrency`, `toCurrency`, `rate`, `source`, `startDate`).

4. **`internal.ts` is the barrel; `external.ts` is an empty stub.** All 10 publisher handler classes are re-exported from `handlers/internal.ts`. `handlers/external.ts` exports `{}` (no external integration events currently consumed by finance). `handlers/index.ts` re-exports from `internal` and `external`. This matches the billing handlers layout exactly.

5. **`finance/index.ts` `internalHandlers` receives all 10 classes.** Import from `./handlers` and list all 10 into the `internalHandlers` object passed to `BoundedContext.create`. `externalHandlers` stays `{}`.

6. **Publishing bridge only — no speculative consumers.** These handlers call `mediator.publish(new WireEvent({...}))` and return. No projection writes, no analytics reads, no additional side effects. Go workers and future consumers are out of scope for this workstream.

7. **Each publisher has a co-located unit test.** Pattern mirrors `SubscriptionQuotaUpdatedPublisher.test.ts`: construct the handler with a `MockExternalMediator`, call `handler.handle(new DomainEvent({...}))`, assert `mediator.getPublishedEvents()` length and the published wire event class + payload fields. No `TestBed`, no DI, no DB — pure unit.

8. **`OperationalCostCreatedEvent` maps to `OperationalCostRecordedEvent` (wire).** The domain event class in `finance/events/` is `OperationalCostCreatedEvent` (name: `finance.operational_cost.created`), but the wire event in contracts is `OperationalCostRecordedEvent` (name: `integration.shared.finance.operational_cost_recorded`). The handler class follows the wire event name: `OperationalCostRecordedHandler`. This asymmetry is pre-existing in the contracts codegen and must not be changed here.

---

## User Stories

**US-1 — Taxes configuration change is observable downstream**
Given the merchant updates tax rates for their store
When `UpdateTaxes` saves `TaxesUpdatedEvent` to the outbox and the dispatcher runs
Then an `integration.shared.finance.taxes_updated` integration event is published carrying `storeId`, `taxesId`, and `effectiveAt`

**US-2 — Fees configuration change is observable downstream**
Given the merchant saves a new fees configuration row
When `UpdateFeesConfiguration` saves `FeesConfigurationUpdatedEvent` to the outbox and the dispatcher runs
Then an `integration.shared.finance.fees_configuration_updated` integration event is published carrying `storeId`, `feesConfigurationId`, and `effectiveAt`

**US-3 — Operational cost lifecycle events are observable downstream**
Given the merchant creates, updates, deletes, or toggles the payment status of a recurring operational cost
When the corresponding use case saves its domain event to the outbox and the dispatcher runs
Then the matching `integration.shared.finance.operational_cost_*` integration event is published carrying at minimum `storeId` and `operationalCostId` (plus `status` and `occurrenceDate` for the toggled variant)

**US-4 — Warranty reserve lifecycle events are observable downstream**
Given the merchant creates, updates, or deletes a warranty reserve rule
When the corresponding use case saves its domain event to the outbox and the dispatcher runs
Then the matching `integration.shared.finance.warranty_reserve_*` integration event is published carrying `storeId` and `warrantyReserveId`

**US-5 — FX rate capture is observable downstream**
Given the scheduler appends a new FX rate
When `CaptureFxRates` saves `FxRateCapturedEvent` to the outbox and the dispatcher runs
Then an `integration.shared.finance.fx_rate_captured` integration event is published carrying `fromCurrency`, `toCurrency`, `rate`, `source`, and `startDate`

---

## Acceptance Criteria

1. `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/typescript/src/finance/handlers/` (new) exists with: `TaxesUpdatedPublisher.ts`, `FeesConfigurationUpdatedPublisher.ts`, `OperationalCostPublisher.ts`, `WarrantyReservePublisher.ts`, `FxRateCapturedPublisher.ts`, `internal.ts`, `external.ts`, `index.ts`, and 5 co-located `.test.ts` siblings.

2. All 10 handler classes are present with exact names: `TaxesUpdatedHandler`, `FeesConfigurationUpdatedHandler`, `OperationalCostRecordedHandler`, `OperationalCostUpdatedHandler`, `OperationalCostDeletedHandler`, `OperationalCostStatusToggledHandler`, `WarrantyReserveCreatedHandler`, `WarrantyReserveUpdatedHandler`, `WarrantyReserveDeletedHandler`, `FxRateCapturedHandler`. No `On` prefix on any class name.

3. Each handler class is `@injectable()`, extends `EventHandler<typeof <DomainEvent>>`, declares `readonly event = <DomainEvent>`, injects `ExternalMediator` via constructor, and in `handle()` calls `await this.mediator.publish(new <WireEvent>({...}))` with payload fields mapped from the domain event.

4. `handlers/internal.ts` re-exports all 10 handler classes. `handlers/external.ts` exports `{}`.

5. `finance/index.ts` `internalHandlers` lists all 10 handler classes imported from `./handlers`. `externalHandlers` remains `{}`.

6. Each of the 5 publisher test files constructs the handler with a `MockExternalMediator`, invokes `handler.handle(event)`, and asserts: (a) exactly one event was published, (b) the published event is an instance of the correct wire event class, (c) the wire payload fields match what the domain event carried.

7. `bun tsc` passes with no new type errors. `bun run test --filter finance` passes all tests (existing use-case tests unaffected; 5 new publisher test files green).

---

## Out of Scope

- Consumers of these integration events (Go workers, analytics projections, etc.).
- Any `externalHandlers` — no integration events are currently consumed by the finance context from outside.
- Any projection or read-model changes.
- Changing the naming asymmetry between `OperationalCostCreatedEvent` (domain) and `OperationalCostRecordedEvent` (wire) — that is a contracts codegen decision outside this workstream.
