# Marketing Concurrency Runtime (Spec γ) — Design Spec

**Date:** 2026-05-28
**Status:** Approved
**Bounded Context:** Go `sync` BC (new `services/runtime/` subpackage)
**Kind:** feature (Spec γ — shared concurrency runtime for marketing pipelines)
**Story Points:** 5 — 3 new primitives (DayWorkerPool, ProgressPublisher, RateLimiter port) + RunInput extension + tests with a fake pipeline. Single BC; no DB changes; no controllers; cross-service tie-breaker N/A (this is intra-BC infra).

## Context

Source repo `go-worker-monorepo` ships 3 platform-specific orchestrators (Facebook, Google, TikTok) for marketing-metric pipelines. The orchestrators are ~80% identical: a pool of N day-workers (`MaxConcurrentDays`) consume from a buffered `dayCh`; each fans out hour-slices (Facebook + TikTok) or processes the day whole (Google); progress is published via mediator with a 5%-step throttle using an atomic counter; an `AccountRateLimiter` (Facebook only) reads response headers (`X-Ad-Account-Usage`, `X-Business-Use-Case`, `X-FB-Ads-Insights-Throttle`) and adapts the semaphore + blocked-until window.

The current repo (`packages/api/go/internal/sync/services/pipelines/`) has the Pipeline interface, Factory, PendingPipeline stub, and Shopify pipelines. `RunInput` carries only `Credentials`, `StoreID`, `StoreIntegrationID`, `StoreIntegrationExternalID`, `WindowDays *int`. No mediator. No worker pool. No progress publishing. Spec γ.1+ (Facebook/Google/TikTok pipelines) need this runtime to mirror the source's concurrency shape.

Per memory `project_canonical_aggregate_strategy` + `project_go_sync_pipeline_pattern`, runtime primitives belong in `packages/api/go/internal/sync/services/runtime/` (new subpackage). Per the user's "Extract shared primitives now" decision (chat 2026-05-28), shared primitives land in the runtime; platform-specific impls (Facebook's header-adaptive RateLimiter) land alongside per-platform pipeline code in Spec γ.1.

## Problem

1. **No shared day-worker-pool primitive.** Spec γ.1-3 would re-implement 80% the same goroutine pool 3 times.
2. **No progress-event publishing.** Source's `IntegrationProgressEvent` (5%-step throttle via atomic CAS) is missing from the current `pipelines.RunInput`; there's no way for a pipeline to report progress to the UI.
3. **No RateLimiter port.** Facebook's header-adaptive rate limiter needs to plug into a generic port; without a port, the Facebook impl would either live inline in each Facebook pipeline (duplication) or be shoehorned into the pipeline interface.
4. **`pipelines.RunInput` lacks `Mediator`.** Without a mediator, progress events can't reach the UI.

## Goal

Land the shared concurrency runtime (`packages/api/go/internal/sync/services/runtime/`) so Spec γ.1+ Facebook/Google/TikTok pipelines compose the same primitives (DayWorkerPool, ProgressPublisher, optional RateLimiter) instead of re-implementing them. Extend `pipelines.RunInput` with a `Mediator` field for progress publishing.

## Decisions

1. **New subpackage `packages/api/go/internal/sync/services/runtime/`** holds the shared primitives.
2. **`DayWorkerPool`** in `runtime/day_worker_pool.go`:
   - `type DayFn func(ctx context.Context, day time.Time) (recordCount int, err error)`
   - `type DayWorkerPool struct { maxConcurrent int }`
   - `func NewDayWorkerPool(maxConcurrent int) *DayWorkerPool`
   - `func (p *DayWorkerPool) Run(ctx context.Context, days []time.Time, fn DayFn) (totalRecords int, err error)` — workers consume from a buffered `dayCh`, run `fn(ctx, day)` each, accumulate record counts and return on first error (or after all days drained).
3. **`ProgressPublisher`** in `runtime/progress_publisher.go`:
   - `type ProgressPublisher struct { mediator mediator.ExternalMediator; jobID string; pipelineName string; platform string; total int32; completed atomic.Int32; lastStep atomic.Int32 }`
   - `func NewProgressPublisher(med mediator.ExternalMediator, jobID, pipelineName, platform string, total int32) *ProgressPublisher`
   - `func (p *ProgressPublisher) Tick(ctx context.Context, increment int32)` — atomic.Add, recompute percentage, CAS the lastStep gate at 5%-boundaries, publish `IntegrationProgressEvent` if step advanced.
   - `func (p *ProgressPublisher) TerminalComplete(ctx context.Context)` — force-publish 100% (idempotent via CAS) so the UI sees terminal state even when total ended at 0.
4. **`RateLimiter` port** in `runtime/rate_limiter.go`:
   - `type RateLimiter interface { Acquire(ctx context.Context) error; Release(); UpdateFromHeaders(headers http.Header) }`
   - `type NoopRateLimiter struct{}` impl returning no-op for Acquire/Release/UpdateFromHeaders. Used by Google/TikTok where the SDK handles backoff internally.
   - Facebook's header-adaptive `AccountRateLimiter` impl lives in Spec γ.1 under `packages/api/go/internal/sync/services/facebook/rate_limiter.go` (not here — that file knows Meta's specific header names).
5. **Extend `pipelines.RunInput`** with `Mediator mediator.ExternalMediator` field. Existing pipelines (Shopify orders/products/transactions) don't use it — pass `nil` or check `if in.Mediator == nil { return nil }` in any future progress callsite.
6. **Extend `pipelines.RunInput`** with `JobID string` and `Platform string` fields (needed by ProgressPublisher to emit per-job-per-platform progress events). Existing Shopify pipelines pass through without using them.
7. **Wire `IntegrationProgressUpdatedEvent` publishing** — the `ProgressPublisher.Tick` publishes via mediator using the existing wire event `IntegrationProgressUpdatedEvent` (see `packages/contracts/wire/events/integration-progress-updated.tsp`). Fields: `integrationSetId` (use jobID), `integrationId` (use external account id, passed via TickInput? — defer to publisher constructor signature), `pipelineType`, `platform`, `progress`, `data`.
8. **Tests with a fake pipeline** in `runtime/day_worker_pool_test.go` + `progress_publisher_test.go` + `rate_limiter_test.go`. Each test:
   - DayWorkerPool: N days, M workers, fn that sleeps + returns count → assert total records + max concurrent reached + ordering doesn't matter.
   - ProgressPublisher: 100 ticks against total=100 → assert exactly 20 events published (every 5%); ticks beyond total cap at 100%; CAS prevents duplicate publishes for same step.
   - RateLimiter (Noop): no-op behavior; Acquire never blocks; UpdateFromHeaders is a no-op.
9. **No fx wiring changes**. The runtime primitives are constructor-based; Spec γ.1+ pipelines instantiate them in their own constructors using their config + dependencies. Pipelines themselves are fx-wired.
10. **No SDK regen**. No controllers, no wire events added — `IntegrationProgressUpdatedEvent` already exists.

## User Stories

- **Story 1 — Facebook MarketingMetricConcurrent pipeline composes the runtime.** As a developer authoring Spec γ.1 Facebook MARKETING_METRICS pipeline, I want `runtime.NewDayWorkerPool(5).Run(ctx, days, p.syncDay)` so the per-day fanout is one line and the pipeline file focuses on `syncDay` (the platform-specific work). *(AC-1, AC-3)*
- **Story 2 — Progress events reach the UI throttled to 5%.** As a UI developer watching a sync run, I want progress events at 5% increments (not every individual day), so the SSE stream stays responsive without flooding. *(AC-2, AC-3)*
- **Story 3 — Google/TikTok skip rate limiting.** As a developer authoring Google or TikTok pipelines (Spec γ.2/3), I want a `runtime.NoopRateLimiter{}` impl I can pass to the pipeline so my code doesn't need to fork "with-rate-limiter vs without-rate-limiter" branches. *(AC-4)*

## Acceptance Criteria

- [ ] AC-1: `packages/api/go/internal/sync/services/runtime/day_worker_pool.go` exists with `DayFn`, `DayWorkerPool`, `NewDayWorkerPool`, `Run`. Tests in `day_worker_pool_test.go` assert: 10 days × 3 workers all complete; total records sum correctly; on first error the pool stops and returns the error.
- [ ] AC-2: `packages/api/go/internal/sync/services/runtime/progress_publisher.go` exists. Tests in `progress_publisher_test.go` assert: 100 single-tick calls against total=100 → exactly 20 events published (5% boundaries); duplicate-step ticks suppressed via CAS; `TerminalComplete` always publishes 100%.
- [ ] AC-3: `pipelines.RunInput` gains `Mediator mediator.ExternalMediator`, `JobID string`, `Platform string` fields. Existing Shopify pipelines compile and tests pass (Mediator is optional, pipelines pass through without using it).
- [ ] AC-4: `packages/api/go/internal/sync/services/runtime/rate_limiter.go` defines `RateLimiter` interface + `NoopRateLimiter` impl. Tests assert Noop never blocks.
- [ ] AC-5: `bun tsc` passes (no TS changes here).
- [ ] AC-6: `bun run test` passes — Go suite includes the new runtime tests; existing tests untouched.
- [ ] AC-7: `bun lint` passes.

## Forward Scope — Spec γ.1, γ.2, γ.3 + Spec β.2 preview

Spec γ.1 — Facebook: 4 pipelines (BUSINESS_ACCOUNTS, AD_ACCOUNTS, CAMPAIGNS, MARKETING_METRICS variants). Composes DayWorkerPool + ProgressPublisher + Facebook's header-adaptive AccountRateLimiter (ported from source). Per-platform HTTP client + normalizers + receivers.

Spec γ.2, γ.3 — Google, TikTok: clone Facebook's shape; Google uses Noop rate limiter (gRPC SDK handles it); TikTok uses Noop (or platform-specific minimal limiter when concrete needs surface).

Spec β.2 — TS-side: polymorphic `store_integration_marketing_access` link table + 2 wire-event handlers + `AdSpend → AdSpendManual` rename + decommission TS `marketing.Campaign` + delete `integration.MarketingAdAccount`. Independent of Spec γ; can be developed in parallel.
