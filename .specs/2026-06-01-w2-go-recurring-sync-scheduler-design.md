# Go Recurring-Sync Scheduler — Cron Infrastructure — Design Spec (W2)

**Date:** 2026-06-01
**Status:** Draft
**Bounded Context:** packages/api/go — sync infra
**Kind:** feature
**Story Points:** 8 — 5 base (new infra service + fx lifecycle hook + job-registration surface + built-in marketing job + test harness) +1 for cross-service contract (Redis SETNX distributed lock consumed from the already-wired client), rounded to the next Fibonacci tier for the breadth of the hook surface other workstreams (W4, W8, W10) depend on.
**Part of:** .specs/2026-06-01-bk-dash-crucial-gaps-closure-roadmap-design.md (master roadmap)
**Depends on:** none (Wave 0 — foundation)

---

## Context

The `api-go` service processes data syncs only when an integration is first activated or a merchant manually triggers a refresh. The integration-activated path lives in `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/go/internal/sync/handlers/integration_activated_handler.go`: it exchanges credentials, calls `StartSync`, then fires `ExecuteAsync` in a detached goroutine. The merchant-manual path is exposed by the TS side in `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/typescript/src/marketing/usecases/ReconcileMarketingAccounts.ts` (lines 28–29), which explicitly documents: *"Go runs the same job on cron (spec § Scheduled Flows); this is the merchant-triggered manual path."* No such cron runs. There is no scheduler, ticker, or periodic loop anywhere in `packages/api/go`.

The `sync/module.go` at `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/go/internal/sync/module.go` already provides a `*redis.Client` (lines 359–365) via the Redis URL from `config.Config.RedisURL`. The `pipelineresolver` at `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/go/internal/sync/services/pipelineresolver/resolver.go` maps `MARKETING_PLATFORM` integrations to `[MARKETING_METRICS_CONCURRENT, CAMPAIGNS]`. Real pipeline implementations exist for META, TikTok, and Google Ads MARKETING_METRICS (registered in `sync/module.go` lines 244–291); the DISPUTES and TRANSACTIONS pipelines for sales-channel platforms are stubs in `pendingPipelineProviders()`.

The `fx.Module` pattern used throughout the codebase (shared infra in `core/module.go`, bounded-context modules in `sync/module.go`, `integrations/module.go`, `webhooks/module.go`) and the `fx.Lifecycle.Append(fx.Hook{OnStart, OnStop})` idiom used by `startStorageLoops` are the established wiring model for background services.

## Problem

1. Marketing metrics dashboards (META, TikTok, Google Ads) only refresh when a merchant manually hits "Refresh data" or when an integration is first activated. Between those events, the data displayed is stale.
2. There is no mechanism for other workstreams (W4 OAuth token renewal, W8 payment sweep, W10 digest assembly) to register periodic jobs — each would need to invent its own goroutine management pattern, creating duplicated lifecycle code.
3. In a multi-instance deployment, a naive per-instance ticker fires the same sync for every running replica, causing duplicate SyncJob creation and redundant external API calls.

## Goal

Introduce a `Scheduler` service in `packages/api/go` that registers as an `fx.Lifecycle` hook, owns a job-registration surface consumed by other workstreams, fires an hourly MARKETING_METRICS sync for every active `MARKETING_PLATFORM` integration (batched in groups of 50), and prevents duplicate concurrent runs via a Redis SETNX distributed lock. The scheduler uses stdlib `time.Ticker` — no new library dependency — and exposes a `Register(job ScheduledJob)` method so W4, W8, and W10 can plug in without re-inventing lifecycle management.

## Decisions

1. **stdlib `time.Ticker`, not `robfig/cron`.** `go.mod` carries no existing cron library (verified: `github.com/redis/go-redis/v9` is present but no cron library). Adding `robfig/cron` for a single hourly tick is a dependency without payoff; a `time.Ticker`-based manager is zero-dependency, fully controllable in tests via an injected `Clock` interface, and produces no magic cron-string parsing surface. Cron expression support is not needed for any job in the Wave 0–1 scope.

2. **Scheduler lives in `internal/sync/services/scheduler/` (new).** All periodic sync work originates in the sync bounded context. The `Scheduler` is registered in `sync/module.go` alongside the executor, following the same pattern used for `pixelthrottle` and `saleschannel`.

3. **Job registration surface: `Register(job ScheduledJob)` on the `Scheduler` struct.** `ScheduledJob` is an interface `{ Name() string; Interval() time.Duration; Run(ctx context.Context) error }`. The scheduler maintains per-job tickers (one `time.Ticker` per registered job, using `job.Interval()`). A shared dispatch loop selects across all job channels using a `reflect.Select` or a fan-in goroutine per job. Other workstreams call `scheduler.Register(job)` before `OnStart` fires.

4. **Redis SETNX distributed lock.** The already-provided `*redis.Client` (from `sync/module.go` line 359) is reused. Before each job execution, the scheduler sets `scheduler:lock:<job-name>` with `SET NX EX <interval-seconds>`. If the key is already set (another instance holds it), the job is skipped silently for this tick. The key expires automatically after one interval, so a crashed instance releases the lock without manual cleanup.

5. **Built-in job: `MarketingMetricsJob` (new).** This job queries `integration.store_integrations` for active `MARKETING_PLATFORM` rows, batches them 50 at a time, and for each integration calls `StartSync` + `ExecuteAsync` (reusing the existing `SyncStarter` and `AsyncExecutor` ports already defined in `handlers/integration_activated_handler.go`). It skips integrations that already have a RUNNING job (idempotent via `SyncJobRepository.FindRunning`). Interval: 1 hour. Only the three marketing platforms with real MARKETING_METRICS pipelines (META, TikTok, Google Ads) are targeted; DISPUTES and TRANSACTIONS pipelines are explicitly out of scope.

6. **No TS-side changes required.** The scheduler calls Go-internal use cases directly; it does not call TS endpoints. The TS `ReconcileMarketingAccounts` use case remains the merchant-manual path unchanged. This honors the cross-cutting rule: Go drives all periodic work; any TS periodic work is triggered by Go calling a TS endpoint via the Client SDK singleton — not applicable here since the scheduled work is pure Go-side sync.

7. **Injected `Clock` interface for testability.** The scheduler accepts a `Clock` interface `{ Now() time.Time; NewTicker(d time.Duration) *time.Ticker }`. Production wires `realClock{}`. Tests inject a controlled clock that fires ticks on demand without wall-clock waiting.

8. **Credentials for scheduled jobs come from the TS credential-exchange endpoint**, via the existing `credentials.Exchanger` interface at `/Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack/packages/api/go/internal/sync/services/credentials/exchanger.go`. The `MarketingMetricsJob` calls `exchanger.Exchange(ctx, integration.CredentialHandle)` for each integration before calling `ExecuteAsync` — the same flow as `IntegrationActivatedHandler`.

9. **Active integration query belongs to a new read-only port `ActiveIntegrationReader` (new).** Rather than duplicating the `integration.store_integrations` SQL ad-hoc, the scheduler package defines a minimal port and a Postgres implementation that reads `integration.store_integrations WHERE active = true AND type = $1 ORDER BY id LIMIT $2 OFFSET $3`. This follows the `saleschannel.NewPgReader` precedent for minimal read-only ports in the sync context.

## User Stories

**As a merchant**, given I have an active META, TikTok, or Google Ads marketing integration, when one hour has elapsed since the last scheduler tick, then my marketing metrics data is refreshed automatically without requiring me to click "Refresh data."

**As a developer running multiple `api-go` instances**, given two replicas are running, when the scheduler tick fires on both at the same time, then only one instance acquires the Redis lock and fires the `MarketingMetricsJob`; the other skips the tick silently — no duplicate SyncJobs are created for the same integration.

**As a developer implementing W4 (token renewal)**, given I have a new `TokenRenewalJob` that must run every 30 minutes, when I call `scheduler.Register(myJob)` from my module's `fx.Invoke`, then the scheduler fires `myJob.Run(ctx)` on its own interval without me writing any goroutine or lifecycle code.

**As an operator**, given an integration already has a RUNNING sync job when the scheduler tick fires, then no new SyncJob is created for it — the existing job runs to completion undisturbed and the scheduler moves on to the next integration.

## Acceptance Criteria

1. `internal/sync/services/scheduler/scheduler.go` (new) compiles cleanly: `go build ./...` from `packages/api/go` passes with no new errors after the scheduler package is added.
2. `sync/module.go` is modified to wire the `Scheduler` as an `fx.Lifecycle` hook: `OnStart` launches the scheduler's tick loop in a goroutine; `OnStop` cancels its context and waits for the goroutine to exit before returning.
3. `scheduler_test.go` (new): injecting a controlled `Clock` that fires two ticks asserts a registered `ScheduledJob.Run` is called exactly twice.
4. `scheduler_test.go`: two scheduler instances sharing a stub `Locker` (an in-process mutex implementation of the lock interface) assert that only one calls `ScheduledJob.Run` per tick when both tick simultaneously.
5. `marketing_metrics_job.go` (new): given three active `MARKETING_PLATFORM` integrations and stub `Exchanger`/`SyncStarter`/`AsyncExecutor`, `Run(ctx)` calls `SyncStarter.Start` exactly three times.
6. `marketing_metrics_job.go`: given one integration already has a RUNNING job (`SyncStarter.Start` returns `SYNC_ALREADY_RUNNING`), `Run(ctx)` absorbs that error and calls `SyncStarter.Start` for the remaining integrations — `Run` returns `nil`.
7. `marketing_metrics_job.go`: given 51 active integrations, the `ActiveIntegrationReader` is called twice (LIMIT 50 OFFSET 0, then LIMIT 50 OFFSET 50), and `SyncStarter.Start` is called exactly 51 times.
8. The Redis lock key for `MarketingMetricsJob` is `scheduler:lock:marketing_metrics`; it is set with TTL equal to the job's interval (3600 seconds) before `Run` is called; a second `Scheduler` invoking the same job within that TTL does not call `SyncStarter.Start`.

---

## Open Questions

1. **Credential handle retrieval**: `MarketingMetricsJob` needs a `CredentialHandle` per active integration to call `exchanger.Exchange`. The `ActiveIntegrationReader` SQL reads `integration.store_integrations`; the handle may live in a joined `integration.integration_credential_secrets` row. Confirm whether the handle column is accessible via a JOIN in the same query, or whether the scheduled job should call `exchanger.Exchange(ctx, storeIntegrationId)` directly with the integration ID (which would require the TS exchange endpoint to accept an ID instead of a pre-issued handle).

2. **Pipeline names for the hourly job**: `pipelineresolver.Resolve(MARKETING_PLATFORM)` returns `[MARKETING_METRICS_CONCURRENT, CAMPAIGNS]`. The brief says "hourly MARKETING_METRICS trigger." Confirm which pipeline names the `MarketingMetricsJob` should pass to `StartSync` — `MARKETING_METRICS_CONCURRENT` only, or also `CAMPAIGNS` — and at what cadence `CAMPAIGNS` should run if different.

3. **Per-job vs. shared ticker**: if W4 and W8 register jobs at 30-minute intervals while the marketing job is hourly, per-job tickers (one `time.Ticker` per registered job) or a single GCD-based ticker both work. The per-job approach is simpler and avoids elapsed-time bookkeeping per job; confirm this is preferred before implementation.

---

## Out of Scope

- DISPUTES and TRANSACTIONS pipeline scheduling (no gateways connected; pending stubs in `pendingPipelineProviders()`).
- W4 OAuth token renewal job implementation (W4 spec owns that job; W2 only delivers the registration surface).
- W8 payment sweep and W10 digest jobs (same — W2 provides the hook, those specs own their jobs).
- Any TS-side periodic scheduler; all periodic work is Go-owned per the cross-cutting decision.
- Persistent cron schedule storage (next-run stored in DB, admin UI to configure intervals). All intervals are compile-time constants for this wave.
- Retry / dead-letter logic for failed scheduler runs beyond the existing `SyncJob.Fail` path already in `executor.go`.
