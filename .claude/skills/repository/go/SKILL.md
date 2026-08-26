---
name: repository-go
description: Go variant of the `repository` skill. Covers interface definition, Postgres implementation, mock implementation, and fx wiring for domain entity persistence in the api-go workspace.
---

# repository — Go

> **Before implementing**: open [`registry.yaml`](./registry.yaml) and read every `when: always` pattern and every bad practice before writing a line of code.

Lang-agnostic philosophy: [`../SKILL.md`](../SKILL.md).

## Why Repositories Exist

Repositories abstract data persistence so domain logic does not depend on the database driver. The interface (domain layer) declares the contract; the `pg*` implementation (infrastructure layer) executes SQL via `database/sql`; the `mock*` implementation enables unit tests with zero I/O.

---

## Folder layout — folder-per-repo

Each repository lives in its own sub-package under `<ctx>/repositories/<snake_name>/`:

```
transcoding/repositories/transcoding_job/
├── transcoding_job_repository.go       # interface
├── pg_transcoding_job_repository.go    # Postgres impl (unexported struct, exported constructor)
└── mock_transcoding_job_repository.go  # in-memory mock for tests
```

The package name is the snake_case resource name (e.g. `package transcodingjob`).

---

## Step 1: Interface (`<name>_repository.go`)

```go
// Package transcodingjob provides the TranscodingJobRepository interface and implementations.
package transcodingjob

import (
    "context"

    "template/api-go/internal/transcoding/entities"
)

// TranscodingJobRepository defines persistence operations for the TranscodingJob aggregate.
type TranscodingJobRepository interface {
    Find(ctx context.Context, id string) (*entities.TranscodingJob, error)
    FindByVideoID(ctx context.Context, videoID string) (*entities.TranscodingJob, error)
    Save(ctx context.Context, job *entities.TranscodingJob) error
}
```

Rules:
- Not-found semantics: `Find` and any single-row query return `(nil, nil)` — never return `sql.ErrNoRows` to the caller.
- Write methods (`Save`, `Delete`) return only `error`.
- No pagination/listing methods in domain repositories — those belong in projection repositories or query use cases.

---

## Step 2: Postgres implementation (`pg_<name>_repository.go`)

```go
package transcodingjob

import (
    "context"
    "database/sql"
    "fmt"
    "time"

    "template/api-go/internal/transcoding/entities"
    "template/api-go/internal/transcoding/enums"
    coreentities "template/core-go/entities"
    coreobjects "template/core-go/objects"
    "template/core-go/repositories"
    "template/core-go/services/unitofwork"
)

// Compile-time check: pgTranscodingJobRepository must implement TranscodingJobRepository.
var _ TranscodingJobRepository = (*pgTranscodingJobRepository)(nil)

type pgTranscodingJobRepository struct {
    db              *sql.DB
    domainEventRepo repositories.DomainEventRepository
}

// NewPgTranscodingJobRepository constructs the Postgres implementation.
func NewPgTranscodingJobRepository(db *sql.DB, domainEventRepo repositories.DomainEventRepository) *pgTranscodingJobRepository {
    return &pgTranscodingJobRepository{db: db, domainEventRepo: domainEventRepo}
}

// txOrDB returns the active transaction from context if present, otherwise the default DB.
func (r *pgTranscodingJobRepository) txOrDB(ctx context.Context) interface {
    ExecContext(context.Context, string, ...any) (sql.Result, error)
    QueryRowContext(context.Context, string, ...any) *sql.Row
} {
    if tx, ok := unitofwork.TxFromContext(ctx); ok {
        return tx
    }
    return r.db
}

// Save inserts or updates a TranscodingJob row.
// ALWAYS calls IncrementVersion before writing and drains domain events to the outbox.
func (r *pgTranscodingJobRepository) Save(ctx context.Context, job *entities.TranscodingJob) error {
    _ = job.IncrementVersion()
    db := r.txOrDB(ctx)

    _, err := db.ExecContext(ctx, `
        INSERT INTO transcoding.transcoding_jobs
          (id, video_id, status, input_url, output_url, failure_reason, owner_id, created_at, updated_at, version)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE
          SET status         = EXCLUDED.status,
              output_url     = EXCLUDED.output_url,
              failure_reason = EXCLUDED.failure_reason,
              updated_at     = EXCLUDED.updated_at,
              version        = EXCLUDED.version
    `,
        job.ID.String(),
        job.VideoID,
        string(job.Status),
        job.InputUrl,
        job.OutputUrl,
        job.FailureReason,
        job.OwnerID,
        job.CreatedAt,
        job.UpdatedAt,
        job.Version,
    )
    if err != nil {
        return fmt.Errorf("transcoding_jobs save: %w", err)
    }

    return r.domainEventRepo.SaveAll(ctx, job.PullDomainEvents())
}

// Find retrieves a TranscodingJob by UUID string. Returns (nil, nil) when not found.
func (r *pgTranscodingJobRepository) Find(ctx context.Context, id string) (*entities.TranscodingJob, error) {
    row := r.txOrDB(ctx).QueryRowContext(ctx, `
        SELECT id, video_id, status, input_url, output_url, failure_reason,
               owner_id, created_at, updated_at, version
        FROM transcoding.transcoding_jobs WHERE id = $1
    `, id)
    return r.scanRow(row)
}

// FindByVideoID retrieves the most recent job for a video. Returns (nil, nil) when not found.
func (r *pgTranscodingJobRepository) FindByVideoID(ctx context.Context, videoID string) (*entities.TranscodingJob, error) {
    row := r.txOrDB(ctx).QueryRowContext(ctx, `
        SELECT id, video_id, status, input_url, output_url, failure_reason,
               owner_id, created_at, updated_at, version
        FROM transcoding.transcoding_jobs WHERE video_id = $1
        ORDER BY created_at DESC LIMIT 1
    `, videoID)
    return r.scanRow(row)
}

func (r *pgTranscodingJobRepository) scanRow(row *sql.Row) (*entities.TranscodingJob, error) {
    var (
        rawID         string
        videoID       string
        rawStatus     string
        inputUrl      string
        outputUrl     *string
        failureReason *string
        ownerID       string
        createdAt     time.Time
        updatedAt     time.Time
        version       int
    )
    if err := row.Scan(
        &rawID, &videoID, &rawStatus, &inputUrl,
        &outputUrl, &failureReason, &ownerID,
        &createdAt, &updatedAt, &version,
    ); err != nil {
        if err == sql.ErrNoRows {
            return nil, nil  // strict (nil, nil) for not-found
        }
        return nil, fmt.Errorf("transcoding_jobs scan: %w", err)
    }

    id, err := coreobjects.IDFromString(rawID)
    if err != nil {
        return nil, err
    }

    base := coreentities.ReconstructBaseEntity(coreentities.ReconstructBaseEntityParams{
        ID:        id.UUID(),
        CreatedAt: createdAt,
        UpdatedAt: updatedAt,
        Version:   version,
    })

    return entities.ReconstructTranscodingJob(
        id, videoID, enums.JobStatus(rawStatus),
        inputUrl, outputUrl, failureReason, ownerID, base,
    ), nil
}
```

Key rules:
- `txOrDB` extracts the active `*sql.Tx` from context (placed there by `SQLUnitOfWork.Execute`) or falls back to `r.db`.
- `Save` calls `IncrementVersion()` before writing and calls `domainEventRepo.SaveAll` inside the same call (both write against the same connection/transaction).
- `scanRow` converts `sql.ErrNoRows` → `(nil, nil)` — never propagates `ErrNoRows` to callers.
- Enum columns stored as `text` — cast with `enums.JobStatus(rawStatus)` at the scan boundary.
- Nullable columns use `*string` / `*int` / etc., matched with pointer scan targets.
- `ReconstructTranscodingJob` (entity package) rebuilds the aggregate from flat fields without running business-logic constructors.

---

## Step 3: Mock implementation (`mock_<name>_repository.go`)

```go
package transcodingjob

import (
    "context"
    "sync"

    "template/api-go/internal/transcoding/entities"
)

// Compile-time check.
var _ TranscodingJobRepository = (*mockTranscodingJobRepository)(nil)

type mockTranscodingJobRepository struct {
    mu        sync.RWMutex
    byID      map[string]*entities.TranscodingJob
    byVideoID map[string]*entities.TranscodingJob
}

// NewMockTranscodingJobRepository constructs an empty in-memory mock.
func NewMockTranscodingJobRepository() TranscodingJobRepository {
    return &mockTranscodingJobRepository{
        byID:      make(map[string]*entities.TranscodingJob),
        byVideoID: make(map[string]*entities.TranscodingJob),
    }
}

func (r *mockTranscodingJobRepository) Save(_ context.Context, job *entities.TranscodingJob) error {
    r.mu.Lock()
    defer r.mu.Unlock()
    _ = job.IncrementVersion()
    job.PullDomainEvents() // drain events — parity with Postgres impl
    r.byID[job.ID.String()] = job
    r.byVideoID[job.VideoID] = job
    return nil
}

func (r *mockTranscodingJobRepository) Find(_ context.Context, id string) (*entities.TranscodingJob, error) {
    r.mu.RLock()
    defer r.mu.RUnlock()
    if job, ok := r.byID[id]; ok {
        return job, nil
    }
    return nil, nil
}

func (r *mockTranscodingJobRepository) FindByVideoID(_ context.Context, videoID string) (*entities.TranscodingJob, error) {
    r.mu.RLock()
    defer r.mu.RUnlock()
    if job, ok := r.byVideoID[videoID]; ok {
        return job, nil
    }
    return nil, nil
}

// Reset clears all state. Test helper — call between test cases.
func (r *mockTranscodingJobRepository) Reset() {
    r.mu.Lock()
    defer r.mu.Unlock()
    r.byID = make(map[string]*entities.TranscodingJob)
    r.byVideoID = make(map[string]*entities.TranscodingJob)
}
```

Rules:
- Mock calls `IncrementVersion()` and `PullDomainEvents()` to match Postgres behavior.
- `Reset()` is a test helper (not part of the interface); call it between test cases.
- Use `sync.RWMutex` for goroutine safety — handlers run concurrently.
- Return type of constructor is the **interface**, not the concrete struct.

---

## Step 4: fx wiring (`module.go`)

Bind the interface to the Postgres implementation via `fx.Annotate` + `fx.As`:

```go
fx.Provide(fx.Annotate(
    transcodingjob.NewPgTranscodingJobRepository,
    fx.As(new(transcodingjob.TranscodingJobRepository)),
)),
```

For the mock (used in test binaries):

```go
fx.Provide(fx.Annotate(
    transcodingjob.NewMockTranscodingJobRepository,
    fx.As(new(transcodingjob.TranscodingJobRepository)),
)),
```

The `fx.As` annotation makes consumers depend on the **interface**, not the concrete struct. Any `struct` that lists `transcodingjob.TranscodingJobRepository` as a field will have it auto-injected.

---

## Projection repositories (read-side)

When the repository serves a **Projection** (read-model materialised from events) rather than an aggregate, the shape changes:

| | Aggregate repository | Projection repository |
|---|---|---|
| File location | `<ctx>/repositories/<name>/` | `<ctx>/projections/` |
| Interface | `FooRepository` | `FooProjectionRepository` (no shared base) |
| Canonical methods | `Find`, `Save` (+ domain-specific finders) | `FindByKey`, `Save`, `InsertIfNew` |
| Atomic ops | Generally not needed | Edge cases only (hot-row, bulk, monotonic) |

Atomic op methods go on the concrete struct (not on the interface) unless they are exercised in tests. Add them only when measurement or correctness demands — see `/projection` skill.

---

## Child-table repository with no entity behind it, and no justification on the parent [bp-GO-REPO-10]

Same DDD rule as the TypeScript pair (not a language particularity): a repository over a table with no `entities.X` struct behind it and no `projections.X` struct either is legitimate only as infra, or as a child table whose PARENT aggregate documents the lifecycle/scale reason it stays out. Zero violations in the current Go inventory (6 repositories), but the boundary is easy to blur when one table is written by both an aggregate repo and a projection repo — see the `gateway_remotes` worked example (disjoint columns by CONTRACT, checked on BOTH `ON CONFLICT` clauses, not just the aggregate's) and the `gateway_remote_memberships` trap (no entity, no projection struct, legitimately written only by the projection because the row has no identity of its own and is replaced in bulk). See `bp-GO-REPO-10` in registry.yaml for the full worked examples.

## Checklist

- [ ] Folder is `<ctx>/repositories/<snake_name>/` with three files: interface, pg, mock.
- [ ] Interface uses `(nil, nil)` for not-found, never `sql.ErrNoRows`.
- [ ] `pgXRepository` is an unexported struct; constructor is exported.
- [ ] `Save` calls `IncrementVersion()` and `domainEventRepo.SaveAll`.
- [ ] `txOrDB` used in every method — transactions flow through context.
- [ ] Mock calls `IncrementVersion()` and `PullDomainEvents()` to match Postgres.
- [ ] Mock constructor returns the **interface type**, not the struct.
- [ ] `fx.As(new(XRepository))` used in `module.go` for both Pg and mock builds.
- [ ] Compile-time interface check: `var _ XRepository = (*pgXRepository)(nil)`.
