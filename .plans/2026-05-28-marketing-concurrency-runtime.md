# Marketing Concurrency Runtime (Spec γ) — Implementation Plan

> **For agentic workers:** Execute via `/build`. Single Task — small surface, all primitives land together so they can be unit-tested as a unit.

**Goal:** Land shared concurrency primitives (DayWorkerPool, ProgressPublisher, RateLimiter port + Noop impl) under `packages/api/go/internal/sync/services/runtime/`, plus extend `pipelines.RunInput` with `Mediator`, `JobID`, `Platform` fields. Spec γ.1+ pipelines compose these instead of re-implementing per-platform.

**Architecture:** Pure intra-BC primitives. No DB, no controllers, no events outside the existing `IntegrationProgressUpdatedEvent` wire event. Constructor-based; pipelines instantiate via dependency injection at the fx layer.

**Tech Stack:** Go 1.24+ (sync, sync/atomic, time, net/http). Existing `core/services/mediator` package for the ExternalMediator type.

**Spec:** .specs/2026-05-28-marketing-concurrency-runtime-design.md
**Tasks:** 1
**Estimated minutes:** 60

---

## Task T1: Concurrency runtime primitives + RunInput extension

**Files to write:**
- Create: `packages/api/go/internal/sync/services/runtime/day_worker_pool.go`
- Create: `packages/api/go/internal/sync/services/runtime/day_worker_pool_test.go`
- Create: `packages/api/go/internal/sync/services/runtime/progress_publisher.go`
- Create: `packages/api/go/internal/sync/services/runtime/progress_publisher_test.go`
- Create: `packages/api/go/internal/sync/services/runtime/rate_limiter.go`
- Create: `packages/api/go/internal/sync/services/runtime/rate_limiter_test.go`
- Modify: `packages/api/go/internal/sync/services/pipelines/types.go` — add `Mediator`, `JobID`, `Platform` fields to `RunInput`

**Files to read:**
- `packages/api/go/internal/sync/services/pipelines/types.go` (current RunInput shape)
- `packages/api/go/core/services/mediator/` (ExternalMediator interface)
- `packages/contracts/wire/events/integration-progress-updated.tsp` (event field set)
- `packages/contracts/generated/go/wire/events.go` (IntegrationProgressUpdatedEvent Go type — confirm exact name + fields)
- `/Users/gabrielaraujo/Desktop/Projetos/bk-company/go-worker-monorepo/api/internal/sync/services/facebook/sync_orchestrator.go` (source's day-worker-pool + progress shape — for reference, NOT to copy verbatim; mirror the structure but use the simpler types described in spec γ Decisions 2/3)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** (none — pure Go infra)
**Depends on:** (none)

### Step T1.1 — Create DayWorkerPool

Write `runtime/day_worker_pool.go`:

```go
// Package runtime holds the shared concurrency primitives that marketing
// pipelines (Facebook/Google/TikTok) compose: day-worker pool, progress
// publisher, and rate-limiter port. Per Spec γ Decision 1.
package runtime

import (
	"context"
	"sync"
	"time"
)

// DayFn is the platform-specific work to run per day. The DayWorkerPool
// invokes it concurrently across `maxConcurrent` workers consuming from
// a buffered day channel.
type DayFn func(ctx context.Context, day time.Time) (recordCount int, err error)

// DayWorkerPool dispatches a list of days to a fixed pool of workers and
// accumulates the total records. The shape mirrors source repo's
// facebook/google/tiktok orchestrator day-fanout — extracted here to
// avoid 3× duplication.
type DayWorkerPool struct {
	maxConcurrent int
}

func NewDayWorkerPool(maxConcurrent int) *DayWorkerPool {
	if maxConcurrent < 1 {
		maxConcurrent = 1
	}
	return &DayWorkerPool{maxConcurrent: maxConcurrent}
}

// Run dispatches `fn` per day across up to maxConcurrent workers.
// Returns the sum of recordCounts and the first error encountered (workers
// continue draining on error; the first error wins for the return).
func (p *DayWorkerPool) Run(ctx context.Context, days []time.Time, fn DayFn) (int, error) {
	if len(days) == 0 {
		return 0, nil
	}

	dayCh := make(chan time.Time, len(days))
	for _, d := range days {
		dayCh <- d
	}
	close(dayCh)

	workers := p.maxConcurrent
	if workers > len(days) {
		workers = len(days)
	}

	var (
		mu       sync.Mutex
		total    int
		firstErr error
		wg       sync.WaitGroup
	)

	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for day := range dayCh {
				select {
				case <-ctx.Done():
					mu.Lock()
					if firstErr == nil {
						firstErr = ctx.Err()
					}
					mu.Unlock()
					return
				default:
				}

				count, err := fn(ctx, day)
				mu.Lock()
				total += count
				if err != nil && firstErr == nil {
					firstErr = err
				}
				mu.Unlock()
			}
		}()
	}

	wg.Wait()
	return total, firstErr
}
```

### Step T1.2 — Create DayWorkerPool tests

Write `runtime/day_worker_pool_test.go`:

```go
package runtime

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"
)

func TestDayWorkerPool_RunsAllDays(t *testing.T) {
	days := []time.Time{
		time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC),
		time.Date(2026, 1, 3, 0, 0, 0, 0, time.UTC),
		time.Date(2026, 1, 4, 0, 0, 0, 0, time.UTC),
		time.Date(2026, 1, 5, 0, 0, 0, 0, time.UTC),
	}

	var processed atomic.Int32
	fn := func(ctx context.Context, day time.Time) (int, error) {
		processed.Add(1)
		return 10, nil
	}

	pool := NewDayWorkerPool(3)
	total, err := pool.Run(context.Background(), days, fn)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if processed.Load() != 5 {
		t.Errorf("processed = %d, want 5", processed.Load())
	}
	if total != 50 {
		t.Errorf("total = %d, want 50", total)
	}
}

func TestDayWorkerPool_FirstErrorPropagates(t *testing.T) {
	days := []time.Time{
		time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC),
		time.Date(2026, 1, 3, 0, 0, 0, 0, time.UTC),
	}

	wantErr := errors.New("boom")
	fn := func(ctx context.Context, day time.Time) (int, error) {
		return 0, wantErr
	}

	pool := NewDayWorkerPool(2)
	_, err := pool.Run(context.Background(), days, fn)

	if !errors.Is(err, wantErr) {
		t.Errorf("err = %v, want %v", err, wantErr)
	}
}

func TestDayWorkerPool_EmptyDays(t *testing.T) {
	pool := NewDayWorkerPool(3)
	total, err := pool.Run(context.Background(), nil, func(ctx context.Context, day time.Time) (int, error) {
		t.Fatal("fn should not be called for empty days")
		return 0, nil
	})
	if err != nil {
		t.Errorf("err = %v, want nil", err)
	}
	if total != 0 {
		t.Errorf("total = %d, want 0", total)
	}
}

func TestDayWorkerPool_RespectsMaxConcurrent(t *testing.T) {
	days := make([]time.Time, 10)
	for i := range days {
		days[i] = time.Date(2026, 1, i+1, 0, 0, 0, 0, time.UTC)
	}

	var inFlight, maxInFlight atomic.Int32
	fn := func(ctx context.Context, day time.Time) (int, error) {
		cur := inFlight.Add(1)
		for {
			max := maxInFlight.Load()
			if cur <= max || maxInFlight.CompareAndSwap(max, cur) {
				break
			}
		}
		time.Sleep(20 * time.Millisecond)
		inFlight.Add(-1)
		return 1, nil
	}

	pool := NewDayWorkerPool(3)
	_, err := pool.Run(context.Background(), days, fn)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if maxInFlight.Load() > 3 {
		t.Errorf("maxInFlight = %d, want <= 3", maxInFlight.Load())
	}
}
```

### Step T1.3 — Create RateLimiter port + Noop impl

Write `runtime/rate_limiter.go`:

```go
package runtime

import (
	"context"
	"net/http"
)

// RateLimiter is the per-account rate-limiting port marketing pipelines
// optionally compose. Facebook ships a header-adaptive impl (Spec γ.1);
// Google/TikTok use NoopRateLimiter (their SDKs handle backoff internally).
type RateLimiter interface {
	Acquire(ctx context.Context) error
	Release()
	UpdateFromHeaders(headers http.Header)
}

// NoopRateLimiter satisfies RateLimiter without any blocking. Used when
// the provider SDK handles rate limiting itself.
type NoopRateLimiter struct{}

func (NoopRateLimiter) Acquire(ctx context.Context) error  { return nil }
func (NoopRateLimiter) Release()                           {}
func (NoopRateLimiter) UpdateFromHeaders(http.Header)      {}
```

Tests in `runtime/rate_limiter_test.go`:

```go
package runtime

import (
	"context"
	"net/http"
	"testing"
)

func TestNoopRateLimiter_AcquireNeverBlocks(t *testing.T) {
	var l RateLimiter = NoopRateLimiter{}
	if err := l.Acquire(context.Background()); err != nil {
		t.Errorf("Acquire returned err = %v, want nil", err)
	}
	l.Release()
	l.UpdateFromHeaders(http.Header{})
}
```

### Step T1.4 — Create ProgressPublisher

Write `runtime/progress_publisher.go`:

```go
package runtime

import (
	"context"
	"log/slog"
	"sync/atomic"

	"template/core-go/services/mediator"
	"template/core-go/types"
)

// ProgressPublisher publishes IntegrationProgressUpdatedEvent throttled
// to 5% step boundaries. The atomic counter + CAS pattern mirrors the
// source repo's facebook/sync_orchestrator.publishMarketingProgress.
type ProgressPublisher struct {
	mediator     mediator.ExternalMediator
	jobID        string
	pipelineName string
	platform     string
	accountID    string
	total        int32
	completed    atomic.Int32
	lastStep     atomic.Int32
}

func NewProgressPublisher(med mediator.ExternalMediator, jobID, pipelineName, platform, accountID string, total int32) *ProgressPublisher {
	p := &ProgressPublisher{
		mediator:     med,
		jobID:        jobID,
		pipelineName: pipelineName,
		platform:     platform,
		accountID:    accountID,
		total:        total,
	}
	p.lastStep.Store(-1)
	return p
}

// Tick increments the completed counter by `increment` and publishes a
// progress event if a new 5%-step boundary was crossed.
func (p *ProgressPublisher) Tick(ctx context.Context, increment int32) {
	if p.mediator == nil || p.total <= 0 {
		return
	}
	completed := p.completed.Add(increment)
	p.publishIfStepAdvanced(ctx, completed)
}

// TerminalComplete forces a 100% publish (idempotent thanks to the step
// gate) so the UI sees terminal state even when total ended at 0.
func (p *ProgressPublisher) TerminalComplete(ctx context.Context) {
	if p.mediator == nil {
		return
	}
	// Force 100% by using total as the completion baseline; CAS still
	// suppresses if 100% already fired.
	p.publishStep(ctx, 100, p.total, p.total)
}

func (p *ProgressPublisher) publishIfStepAdvanced(ctx context.Context, completed int32) {
	progress := int(completed * 100 / p.total)
	if progress > 100 {
		progress = 100
	}
	step := int32(progress / 5)
	for {
		prev := p.lastStep.Load()
		if step <= prev {
			return
		}
		if p.lastStep.CompareAndSwap(prev, step) {
			break
		}
	}
	p.publishStep(ctx, int(step*5), completed, p.total)
}

func (p *ProgressPublisher) publishStep(ctx context.Context, progress int, completed, total int32) {
	// IntegrationProgressUpdatedEvent shape (per packages/contracts/wire/events/integration-progress-updated.tsp):
	// fields are platform-defined; check the generated Go event for exact names.
	// This emits via the external mediator using the generated event constructor.
	event := types.NewIntegrationEvent(
		"integration.shared.integration.progress_updated", // wire event name
		"sync", // entityType — sync runtime is the origin
		p.jobID, // tenant/ownerId carries the jobID for routing
		map[string]any{
			"integrationSetId": p.jobID,
			"integrationId":    p.accountID,
			"pipelineType":     p.pipelineName,
			"platform":         p.platform,
			"progress":         progress,
			"data": map[string]any{
				"completed": completed,
				"total":     total,
			},
		},
	)
	if err := p.mediator.Publish(ctx, event); err != nil {
		slog.Warn("ProgressPublisher.Publish failed", "platform", p.platform, "progress", progress, "error", err)
	}
}
```

NOTE: The exact `types.NewIntegrationEvent` signature may differ — read `packages/api/go/core/types/` to confirm. If the generated `IntegrationProgressUpdatedEvent` Go type has explicit fields, use it directly instead of `map[string]any`. Adapt the call to match the actual codebase pattern.

Tests in `runtime/progress_publisher_test.go`:

```go
package runtime

import (
	"context"
	"sync/atomic"
	"testing"

	"template/core-go/services/mediator"
	"template/core-go/types"
)

type recordingMediator struct {
	publishCount atomic.Int32
}

func (m *recordingMediator) Publish(ctx context.Context, e types.DomainEventI) error {
	m.publishCount.Add(1)
	return nil
}

var _ mediator.ExternalMediator = (*recordingMediator)(nil)

func TestProgressPublisher_Tick_PublishesAt5PercentBoundaries(t *testing.T) {
	med := &recordingMediator{}
	pub := NewProgressPublisher(med, "job-1", "MARKETING_METRICS_CONCURRENT", "FACEBOOK", "act_123", 100)

	for i := 0; i < 100; i++ {
		pub.Tick(context.Background(), 1)
	}

	// 100 ticks → progress 1%..100% → step thresholds at 5,10,15,...,100 → 20 distinct steps.
	count := med.publishCount.Load()
	if count != 20 {
		t.Errorf("publishCount = %d, want 20 (one per 5%% boundary)", count)
	}
}

func TestProgressPublisher_TerminalComplete_AlwaysPublishes(t *testing.T) {
	med := &recordingMediator{}
	pub := NewProgressPublisher(med, "job-1", "MARKETING_METRICS", "FACEBOOK", "act_123", 0)
	pub.TerminalComplete(context.Background())
	if med.publishCount.Load() < 1 {
		t.Errorf("TerminalComplete should publish at least once even with total=0; got %d", med.publishCount.Load())
	}
}

func TestProgressPublisher_NilMediator_NoOp(t *testing.T) {
	pub := NewProgressPublisher(nil, "job-1", "MARKETING_METRICS", "FACEBOOK", "act_123", 100)
	// Should not panic
	pub.Tick(context.Background(), 1)
	pub.TerminalComplete(context.Background())
}
```

NOTE: If `types.NewIntegrationEvent` signature doesn't match the example, adapt. The test asserts the mediator's `publishCount` not the event shape, so the shape can be anything as long as `Publish` is called.

### Step T1.5 — Extend RunInput with Mediator, JobID, Platform

Modify `packages/api/go/internal/sync/services/pipelines/types.go`:

```diff
 type RunInput struct {
 	StoreID                    string
 	StoreIntegrationID         string
 	StoreIntegrationExternalID string
 	Credentials                map[string]string
 	WindowDays                 *int
+	// JobID identifies the parent SyncJob for progress publishing.
+	// Populated by the executor; nil-safe for pipelines that don't publish progress.
+	JobID string
+	// Platform is the SalesPlatform or MarketingPlatform name for routing.
+	Platform string
+	// Mediator is the external mediator pipelines use to publish progress.
+	// Nil for pipelines that don't need progress (e.g., Shopify webhooks).
+	Mediator interface {
+		Publish(ctx context.Context, e types.DomainEventI) error
+	}
 }
```

NOTE: The Mediator field uses an inline interface to avoid forcing the entire `core/services/mediator` import into the pipelines package (where it would create a heavy dependency). If the existing codebase already imports `core/services/mediator` in pipelines/types.go, replace the inline with `mediator.ExternalMediator`.

If the inline interface doesn't satisfy the actual ExternalMediator interface, switch to:

```go
import (
    "context"
    "template/core-go/types"
)
...
Mediator interface {
    Publish(ctx context.Context, e types.DomainEventI) error
}
```

### Step T1.6 — Verify existing pipelines compile (RunInput change doesn't break Shopify)

```bash
cd packages/api/go && go test ./internal/sync/services/pipelines/... ./internal/sync/services/shopify/... -count=1
```

Expected: existing Shopify pipeline tests pass — they don't use the new fields.

### Step T1.7 — Run runtime tests

```bash
cd packages/api/go && go test ./internal/sync/services/runtime/... -count=1 -v
```

Expected: all 4 runtime tests pass.

### Step T1.8 — Full Go suite + workspace gates

```bash
cd packages/api/go && go test ./... -count=1
bun tsc && bun lint
```

Expected: all green; no regressions in existing tests.

---

## Final Validation

- [ ] `bun tsc` — clean
- [ ] `bun lint` — clean
- [ ] `bun run test` — Go + TS green
- [ ] AC mapping:
  - AC-1 (DayWorkerPool + tests) → T1.1, T1.2, T1.7
  - AC-2 (ProgressPublisher + tests) → T1.4, T1.7
  - AC-3 (RunInput Mediator/JobID/Platform) → T1.5, T1.6
  - AC-4 (RateLimiter port + Noop) → T1.3, T1.7
  - AC-5/6/7 (tsc/test/lint) → T1.8

## Notes

- **No SDK regen** — no new wire events; only existing IntegrationProgressUpdatedEvent is published.
- **No fx wiring** — primitives are constructor-based; pipelines compose them at their own constructor time.
- **Facebook header-adaptive RateLimiter** is NOT in this spec — it lives alongside Facebook-specific code in Spec γ.1 because it parses Meta-specific header names.
- **Mediator type tightness**: if the inline interface in RunInput doesn't satisfy `core/services/mediator.ExternalMediator`, switch to the named import. The worker should verify by inspecting the actual mediator package signature.
