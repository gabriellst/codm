---
name: projection-go
description: "Create a read-side projection in Go — a free record struct that materialises a domain view. No base class, no invariants. Pairs with a Projector that drives it from events via the canonical find → ApplyX → save flow."
---

> **BEFORE IMPLEMENTING**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional before coding.
> 2. **`bad_practices`** — keep these violations in mind throughout implementation.

# Create a Projection (Go)

A Projection is a **free record struct** — a flat struct that materialises a denormalised view of one or more aggregates. **No base class**, **no invariants**, **no domain events raised**. Projections are malleable read models, not entities.

The lang-agnostic philosophy (modelling decision framework, archetype decision tree, denormalisation trade-offs) lives in [`../SKILL.md`](../SKILL.md). Read it before modelling. This playbook covers **Go idioms only**.

## Why Projections Exist

CQRS here is logical, not physical — the same Postgres database holds both write-side aggregates and read-side projections. Aggregates enforce invariants on write; projections materialise fast reads. A field belongs on the aggregate only if a business rule reads it; counters, denormalised joins, last-event timestamps, and derived ranks go on the projection.

## Where It Lives

```
internal/<ctx>/projections/
├── <name>_projection.go              # free record struct + ApplyX methods
├── <name>_projection_repository.go   # interface (named after the projection)
├── mock_<name>_projection_repository.go
├── pg_<name>_projection_repository.go
└── projectors/
    └── <name>_projector.go
```

The interface and the projection type can share one file when the interface is small (see `video_watch_analytics.go` in `analytics/projections/` which declares both the struct and the repository interface in one file).

## The Struct

A projection is a plain Go struct with exported fields. Use `db` struct tags when the repository scans rows via `pgx` or `database/sql`. It carries **no constructor** — the projector builds the struct literal directly from the event payload.

```go
// Package projections provides the VideoSearchProjection read model.
package projections

import "time"

// VideoSearchProjection mirrors search.search_index.
// Written by VideoSearchProjector; read by SearchVideos query use case.
// No domain logic, no invariants.
type VideoSearchProjection struct {
    VideoID     string
    Title       string
    Description string
    UpdatedAt   time.Time
}
```

For projections that evolve via incremental mutation (timestamps, soft-deletes, content edits), add **`ApplyX` methods**. The method owns the transition logic — the projector simply calls it.

```go
// Message mirrors channel.messages.
type Message struct {
    ID                string          `db:"id"`
    ChannelID         string          `db:"channel_id"`
    PlatformMessageID string          `db:"platform_message_id"`
    Content           json.RawMessage `db:"content"`
    DeliveredAt       *time.Time      `db:"delivered_at"`
    SeenAt            *time.Time      `db:"seen_at"`
    EditedAt          *time.Time      `db:"edited_at"`
    DeletedAt         *time.Time      `db:"deleted_at"`
    Version           int64           `db:"version"`
}

// ApplyDelivered advances DeliveredAt. Only moves forward — out-of-order receipts are ignored.
func (m *Message) ApplyDelivered(at time.Time) {
    if m.DeliveredAt == nil || at.After(*m.DeliveredAt) {
        m.DeliveredAt = &at
    }
}

// ApplyEdited replaces content and records the edit timestamp.
func (m *Message) ApplyEdited(newContent json.RawMessage, at time.Time) {
    m.Content = newContent
    m.EditedAt = &at
}

// ApplySoftDelete records deletion without removing the row.
func (m *Message) ApplySoftDelete(at time.Time) {
    m.DeletedAt = &at
}
```

Each `ApplyX` method name matches the event that drives it (`ApplyDelivered` ← `MessageDeliveredEvent`).

## The Repository Interface

**No shared base** — each repository declares only the surface it needs. Minimum set for canonical `find → ApplyX → save`:

| Method | Always? | Purpose |
|--------|---------|---------|
| `FindByKey(ctx, key) (*P, error)` | Yes | Load row before applying event |
| `Save(ctx, *P) error` | Yes | Write the mutated row |
| `InsertIfNew(ctx, *P) (bool, error)` | Yes | Idempotent creation — returns `false` on duplicate, no error |

Atomic ops are **edge cases**. Add them only when one of these triggers applies and document the trigger:
- **Hot-row contention** — concurrent writes to the same row cause lost-update races
- **Bulk** — one event updates N rows; N+1 `find → save` is a performance problem
- **Monotonic constraint** — only advance a field, never roll back (`SetIfGreaterLastMessageAt`)
- **Conditional update** — needs SQL-level atomicity
- **Cache-mirror upsert** — archetype A/B1 where the payload is the authoritative new state

```go
// VideoSearchProjectionRepository defines persistence operations for VideoSearchProjection.
type VideoSearchProjectionRepository interface {
    // Upsert inserts or replaces the search index row, recomputing the tsvector.
    // Atomic op justified: payload IS the authoritative new state (cache-mirror upsert).
    Upsert(ctx context.Context, p *VideoSearchProjection) error
    // Delete removes the row for the given videoId on archive.
    Delete(ctx context.Context, videoID string) error
}
```

```go
// VideoWatchAnalyticsRepository defines persistence for the analytics projection.
type VideoWatchAnalyticsRepository interface {
    // IncrementViewCountBatch atomically adds count to view_count for (videoId, day).
    // Creates the row if absent.
    // Atomic op justified: hot-row contention — 50+ concurrent writes per hot video.
    IncrementViewCountBatch(ctx context.Context, videoID, day string, count int) error
}
```

## The Postgres Implementation

```go
type pgVideoSearchProjectionRepository struct {
    db *sql.DB
}

// NewPgVideoSearchProjectionRepository constructs the Postgres implementation.
// Returns the interface type so fx can bind without wrapping.
func NewPgVideoSearchProjectionRepository(db *sql.DB) VideoSearchProjectionRepository {
    return &pgVideoSearchProjectionRepository{db: db}
}

func (r *pgVideoSearchProjectionRepository) Upsert(ctx context.Context, p *VideoSearchProjection) error {
    _, err := r.db.ExecContext(ctx, `
        INSERT INTO search.search_index (video_id, title, description, tsv, updated_at)
        VALUES ($1, $2, $3, to_tsvector('english', $2 || ' ' || $3), $4)
        ON CONFLICT (video_id) DO UPDATE
          SET title = EXCLUDED.title, description = EXCLUDED.description,
              tsv = EXCLUDED.tsv, updated_at = EXCLUDED.updated_at
    `, p.VideoID, p.Title, p.Description, time.Now().UTC())
    if err != nil {
        return fmt.Errorf("search.search_index upsert: %w", err)
    }
    return nil
}
```

Key rules:
- Constructor returns the **interface type** (not `*pgImpl`) so fx binds the interface.
- Wrap errors with `fmt.Errorf("table op: %w", err)`.
- Use `ON CONFLICT DO UPDATE` for upserts; `INSERT … ON CONFLICT DO NOTHING` + check for `InsertIfNew`.

## The In-Memory Mock

Every projection repository ships an in-memory mock for unit tests, colocated as `mock_<name>_repository.go`:

```go
// MockVideoSearchProjectionRepository is an in-memory implementation for tests.
type MockVideoSearchProjectionRepository struct {
    Rows    map[string]*VideoSearchProjection
    Upserts int
    Deletes int
}

func NewMockVideoSearchProjectionRepository() *MockVideoSearchProjectionRepository {
    return &MockVideoSearchProjectionRepository{Rows: make(map[string]*VideoSearchProjection)}
}

func (r *MockVideoSearchProjectionRepository) Upsert(_ context.Context, p *VideoSearchProjection) error {
    r.Rows[p.VideoID] = p
    r.Upserts++
    return nil
}

func (r *MockVideoSearchProjectionRepository) Delete(_ context.Context, videoID string) error {
    delete(r.Rows, videoID)
    r.Deletes++
    return nil
}

// Reset clears all state. Call between tests.
func (r *MockVideoSearchProjectionRepository) Reset() {
    r.Rows = make(map[string]*VideoSearchProjection)
    r.Upserts = 0
    r.Deletes = 0
}
```

For repos with `FindByKey + Save + InsertIfNew`, maintain two maps (keyed by primary key and by natural key). See `dev:packages/channel/internal/channel/projections/projectors/message_projector_test.go` for the canonical mock shape with both map types and `var _ Interface = (*mockImpl)(nil)` compile-time assertion.

## Wiring in the fx Module

```go
var Module = fx.Module("search",
    // Repository — constructor returns interface type directly.
    fx.Provide(projections.NewPgVideoSearchProjectionRepository),
    // Projectors are provided separately; see projector skill.
    fx.Provide(projectors.NewVideoSearchProjector),
    fx.Provide(projectors.NewVideoArchivedProjector),
    // ...
)
```

## Checklist

- [ ] Struct has exported fields and `db` tags where needed — no base class
- [ ] `ApplyX` methods own transition logic; projector delegates to them
- [ ] Interface declares only the surface the projector uses
- [ ] Atomic ops carry a comment naming the justifying trigger
- [ ] `InsertIfNew` returns `(bool, error)` — `false` on duplicate, no error
- [ ] Postgres constructor returns the interface type
- [ ] Mock implements the full interface; has a `Reset()` helper
- [ ] Compile-time assertion: `var _ MyRepo = (*mockImpl)(nil)`

## References

- `packages/api/go/internal/search/projections/` — VideoSearchProjection + mock + Pg impl
- `packages/api/go/internal/analytics/projections/` — VideoWatchAnalytics with atomic ops
- `dev:packages/channel/internal/channel/projections/message.go` — canonical `ApplyX` shape
- `dev:packages/channel/internal/channel/projections/remote.go` — multi-method projection
- [`../SKILL.md`](../SKILL.md) — lang-agnostic philosophy and archetype decision tree
