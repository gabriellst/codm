# Cross-Category Platform Union Typing — Design Spec

**Date:** 2026-05-26
**Status:** Approved
**Bounded Context:** cross-context — `contracts` (TypeSpec + codegen), `api/go` core OpenAPI emitter + `sync`/`integration` contexts, generated `client` SDK
**Kind:** chore (codegen capability + contract reshape)
**Story Points:** 13 — cross-service contract reversal + two codegen pipelines (contracts + Go-service OpenAPI) + a new emitter capability + a validator change; one tight vertical, executes in two phases.

## Context

A cross-category `platform` field rides several Go surfaces. The two `/sync` request bodies — `packages/api/go/internal/sync/controllers/sync_controller.go:41` (`POST /sync`) and `packages/api/go/internal/sync/controllers/start_sync.go:18` (`POST /sync/jobs`) — plus the internal event-consumer struct `packages/api/go/internal/sync/handlers/integration_activated_handler.go` all declare `Platform string`. Callers pass *any* platform category: `packages/api/typescript/src/integration/usecases/TriggerReintegration.ts:62` forwards `integration.platform` (a union of all five platform enums), and `packages/api/typescript/src/marketing/usecases/ReconcileMarketingAccounts.ts:79` forwards a `MarketingPlatform`.

Today that field generates as `z.string()` in the Go SDK client (`packages/client/dist/typescript/src/go/zod/syncSchema.ts`), so `this.client.go.sync(...)` accepts any string. This session already landed the prerequisite fix in `packages/api/go/core/pkg/openapi` (`walker.go` `ownsSchemaSource` + `enums.go`/`schema.go`): the emitter now scans all `template/*` source modules (excluding the generated `client-go`), so every **single-category** enum field already emits a typed `$ref` — e.g. `pipelines` is now `z.array(syncPipelineNameSchema)` and `handshake.go:45` (`Platform wire.SalesPlatform`, sales-only) emits `$ref SalesPlatform`. The remaining gap is the cross-category `platform` field, which has no single enum to point at.

The five platform enums live in TypeSpec (`packages/contracts/wire/enums/{sales,checkout,payment-gateway,marketing,infoproduct}-platform.tsp`) and flow to Go via `packages/contracts/codegen/emit-wire-go.ts` and to TS via `emit-wire-ts.ts`, both reading `dist/contracts.openapi.yaml` parsed by `packages/contracts/codegen/lib/parse-openapi.ts`. Separately, the Go **service** OpenAPI (`packages/api/go/public/openapi.json`) is emitted from Go structs by `core/pkg/openapi` and consumed by Kubb to build the client. The emitter already parses doc-comment annotations for struct discriminated unions (`@union`/`@variant` in `core/pkg/openapi/unions.go`), but has no mechanism for a scalar field that is `oneOf` several string enums.

The current `integration-activated.tsp:19` documents the opposite decision — `platform: string`, *"Open string here so the contract doesn't have to evolve when new platforms join — the Go worker validates against its registry of supported pipelines."* This spec consciously reverses that for cross-category platform fields.

## Problem

1. `client.go.sync({ platform })` is typed `z.string()` — a caller can pass any string and the type system catches nothing; the mismatch (`integration.platform` / `MarketingPlatform` vs the wire field) is invisible at compile time.
2. The runtime guard is wrong: `validate:"required,oneof=SHOPIFY NUVEM_SHOP"` on the `/sync` DTOs would **reject** a legitimate `MarketingPlatform` (e.g. `META`) that `ReconcileMarketingAccounts` sends — a latent bug.
3. There is no faithful contract representation of "a platform that may be any of the five categories"; the concept exists only as an ad-hoc `z.union` hand-written on the TS entity (`packages/api/typescript/src/integration/services/index.ts:83`), not in the shared contract.

## Goal

Cross-category `platform` fields become a faithful, contract-sourced union of the five platform enums. The generated client (`client.go.sync`) exposes `platform` as `z.union([...])` instead of `z.string()`, so call sites are type-checked against the real platform set; the Go worker validates incoming platform values against that same set at runtime; and the union is defined once in TypeSpec as the single source of truth, reused everywhere via a named `Platform` component.

## Decisions

1. **TypeSpec is the source of truth.** Define `union Platform` over the five platform enums (`SalesPlatform | CheckoutPlatform | PaymentGatewayPlatform | MarketingPlatform | InfoproductPlatform`) in `packages/contracts/wire`. Update the `integration-activated.tsp` doc comment to record the reversed rationale (cross-category platform is now a typed union, not an open string).
2. **Bridge the two pipelines via a generated annotation.** `emit-wire-go.ts` emits `type Platform string` carrying a generated doc-comment `// @oneof SalesPlatform CheckoutPlatform PaymentGatewayPlatform MarketingPlatform InfoproductPlatform`. The Go-service OpenAPI emitter reads that annotation. The contract codegen writes the bridge; the service emitter reads it.
3. **New emitter capability — scalar enum-union.** `core/pkg/openapi` gains a `@oneof` annotation handler on a type declaration that emits a named component (`Platform: { oneOf: [ {$ref: SalesPlatform}, … ] }`) reusing the already-registered enum components, and resolves fields typed as that type to `$ref Platform`. Modeled on the existing `@union`/`@variant` parsing in `unions.go`, but for a scalar field rather than a struct.
4. **Contracts codegen learns unions only as far as `Platform` needs.** `parse-openapi.ts` gains a `union-ref` `FieldType` (recognizing a named OpenAPI `oneOf` of enum `$ref`s); `emit-wire-go.ts` maps it to the Go type name + emits the `@oneof` bridge comment + a generated `Platform.Valid()` membership check; `emit-wire-ts.ts` emits `PlatformSchema = z.union([...])`. This is not a general union feature — scoped to the enum-`oneOf` shape.
5. **Retype the cross-category fields to `wire.Platform`:** `sync_controller.go`, `start_sync.go`, and the `integration_activated_handler` struct. `handshake.go` stays `wire.SalesPlatform` (it is sales-only; already correct).
6. **Replace the wrong validator** (`oneof=SHOPIFY NUVEM_SHOP`) with a registered custom validator backed by `wire.Platform.Valid()`, accepting any of the five member enums' values — realizing the `.tsp`'s "worker validates against its registry" intent.
7. **Regenerate all three outputs** (contracts wire bindings, Go service `openapi.json`, Kubb SDK) and fix any call-site type errors surfaced in `api-typescript`.

## User Stories

- **Story 1:** As a backend developer calling the Go sync worker, I want `client.go.sync`'s `platform` typed as the platform union, so the compiler rejects an invalid platform instead of failing silently at the wire.
  - Given the SDK is regenerated, when I call `client.go.sync({ platform: integration.platform })`, then it type-checks because `integration.platform` is one of the five platform enums.
  - Given I try `client.go.sync({ platform: 'NOT_A_PLATFORM' })`, when I compile, then `tsc` fails.

- **Story 2:** As the marketing reconciliation flow, I want to pass a `MarketingPlatform` to the sync worker without being rejected, so reconciliation actually runs.
  - Given `ReconcileMarketingAccounts` calls `client.go.sync({ platform: 'META', pipelines: ['MARKETING_METRICS'] })`, when the Go worker validates the body, then `META` is accepted (it is a member of the `Platform` union).

- **Story 3:** As a developer adding a new platform, I want to add it once in the TypeSpec enum + the `Platform` union, so a single regen propagates it to the Go wire type, the service OpenAPI, and the client `z.union` without hand-editing each surface.
  - Given a new platform enum value is added and `Platform` references its enum, when codegen + SDK regen run, then the new value appears in `PlatformSchema`/`platformSchema` and is accepted by `Platform.Valid()`.

## Acceptance Criteria

- [ ] AC-1: `packages/contracts/wire` declares a `Platform` union over the five platform enums, and `integration-activated.tsp`'s `platform` doc comment reflects the reversed (typed-union) rationale.
- [ ] AC-2: After contracts codegen, `wire.Platform` exists in the generated Go bindings with a `// @oneof …` doc comment listing the five member enums, and a `Platform.Valid()` method that returns true for any member value and false otherwise.
- [ ] AC-3: After contracts codegen, `emit-wire-ts` output exposes a `PlatformSchema` equal to `z.union` of the five member enum schemas.
- [ ] AC-4: `packages/api/go/public/openapi.json` contains a named `Platform` component shaped as `oneOf` of the five enum `$ref`s, and the `/sync` + `/sync/jobs` request bodies' `platform` property is `$ref: '#/components/schemas/Platform'` (not `{type: string}`).
- [ ] AC-5: In the regenerated client, `packages/client/dist/typescript/src/go/zod/syncSchema.ts` types `platform` as the platform union (`z.union([...])` of the five enum schemas), not `z.string()`.
- [ ] AC-6: The `/sync` and `/sync/jobs` DTOs (and the `integration_activated_handler` struct) are typed `wire.Platform`; the `oneof=SHOPIFY NUVEM_SHOP` tag is replaced by validation accepting any of the five platform categories. A request with a `MarketingPlatform` value passes validation; a non-platform string is rejected.
- [ ] AC-7: `go build ./...` + `go vet ./...` (api-go and core), `bun tsc` (all projects, including a non-cached `api-typescript`), and the existing Go `sync`/`integration` controller tests pass after regen.
- [ ] AC-8: `handshake.go` and all single-category platform fields remain `SalesPlatform`/`MarketingPlatform`/etc. (unchanged) — the union is applied only to the cross-category fields named in Decision 5.

## Risks & Migration

- **TypeSpec union emit shape (open question).** The exact OpenAPI that TypeSpec produces for a named `union` of enum refs — a named component with `oneOf` of `$ref`s vs an inlined `oneOf` — drives the `parse-openapi.ts` handling. Verify the emitted `contracts.openapi.yaml` shape first in `/plan`; if TypeSpec inlines rather than naming the union, the parser must synthesize the named `Platform` type.
- **Reversal of a documented decision.** This intentionally overrides the `integration-activated.tsp` "open string by design" rationale. The tradeoff (the contract now evolves when a platform category is added) is accepted; Decision 1 updates the doc so the reversal is explicit, not silent.
- **Two-phase execution.** Phase 1 (TypeSpec union + contracts codegen → `wire.Platform`/`PlatformSchema`) has no observable client change on its own; Phase 2 (emitter capability + DTO retypes + validator + SDK regen + call-site fixes) delivers the `z.union` in the client. Plan accordingly; neither phase ships value alone.

## Out of Scope

- A general-purpose union feature in the contracts codegen — only the enum-`oneOf` shape `Platform` needs.
- `handshake` and any single-category platform field (already correct via the landed emitter fix).
- The struct `@union`/`@variant` mechanism (unchanged; the new `@oneof` is additive and separate).
