---
name: test-go
description: "Write and update backend tests in Go using stdlib testing + testify. Colocated *_test.go files for unit/entity/projector tests. Mock repositories via mock_<name>_repository.go files. Integration tests via the pg test harness where needed."
---

> **BEFORE IMPLEMENTING**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional before coding.
> 2. **`bad_practices`** — keep these violations in mind throughout implementation.

# Write Tests (Go)

Use Go's stdlib `testing` package plus `github.com/stretchr/testify/{require,assert}` for all backend tests.

## Folder Layout

Tests are **colocated** with the artifact they test. There is no separate `tests/` directory for unit and component tests — only the `*_test.go` files next to the source files:

```
internal/transcoding/
├── entities/
│   ├── transcoding_job.go
│   └── transcoding_job_test.go      # entity unit tests
├── usecases/
│   ├── start_transcoding_job.go
│   └── start_transcoding_job_test.go
├── handlers/
│   ├── enqueue_transcoding_job.go
│   └── enqueue_transcoding_job_test.go
├── projections/
│   ├── video_search_projection.go
│   ├── message.go
│   └── message_test.go              # projection ApplyX tests
└── projections/projectors/
    ├── message_projector.go
    └── message_projector_test.go    # projector handler tests via mock repo
```

### The one exception: flow tests live in `tests/flows/`, mirroring TypeScript

Colocation answers "which artifact does this test?". Some tests have no single artifact — their
subject is a JOURNEY: they boot a context through `core/testenv` (a real fx app, real HTTP, real
SQLite) and assert on what came out of the real mapper → outbox → handler → projector chain.

Those live in **`packages/api/go/tests/flows/`**, as `package flows_test`, with a `doc.go` stating
what the folder admits.

**This mirrors TypeScript deliberately.** `packages/api/typescript/tests/` has carried `flows/`,
`architecture/`, `kernel/`, `spikes/` and `support/` for a long time, and `tests/flows/*.flow.test.ts`
means the same thing there. One repo, two languages, one mental model: if you know where a flow test
lives in TypeScript, you know where it lives in Go. The architecture is already spelled identically
on both sides (`controllers/`, `usecases/`, `entities/`, `handlers/`, `repositories/`, `events/`,
`errors/`, `enums/`), and tests were the gap.

**Why the rule needs stating:** until 2026-08-18 Go had no `tests/` tree at all, so this category had
nowhere to live and the channel context's three flow tests (`qr_pairing`, `contact_snapshot`,
`inbound_emission`) sat loose at the context ROOT, interleaved alphabetically with `config.go`,
`module.go` and `overlay.go`. They violated the colocation checklist below — there is no
`qr_pairing.go` for `qr_pairing_test.go` to sit next to — and **a file with no category lands at the
root by default**, which is how a context root becomes a junk drawer one file at a time.

Leaving the package directory gives up the idiomatic `package channel_test` black-box position. It is
legal because such tests use only EXPORTED identifiers, and `internal/` visibility still permits the
import (`template/api-go/tests/flows` and `template/api-go/internal/channel` share the
`template/api-go` root). A flow spanning two contexts also has a home this way, which a context-local
folder could not offer.

A test belongs in `tests/flows/` only when it cannot name one artifact as its subject. If it can, it
goes next to that artifact — the colocation rule governs everything else.


## Quick Decision Rule

| Artifact | Test type | Uses mock? |
|----------|-----------|-----------|
| Entity / Value Object | Direct instantiation unit test | No |
| Projection (ApplyX methods) | Direct instantiation unit test | No |
| Projector Handle() | Mock repository test | Yes — mock repo in the same package |
| Use case Execute() | Mock or real repo test | Depends on complexity |
| Handler EventName() | Direct struct test | No |

## Entity Unit Tests

Test entity constructors and behavior methods directly — no mocks, no DB.

```go
package entities_test

import (
    "testing"
    "template/api-go/internal/transcoding/entities"
    "template/api-go/internal/transcoding/enums"
    ctxevents "template/api-go/internal/transcoding/events"
)

func TestNewTranscodingJob_EmptyVideoID(t *testing.T) {
    _, err := entities.NewTranscodingJob("", "http://example.com/video.mp4", "owner-1")
    if err == nil {
        t.Fatal("expected error for empty videoID, got nil")
    }
}

func TestMarkRunning_FromPending(t *testing.T) {
    job, _ := entities.NewTranscodingJob("video-1", "http://example.com/video.mp4", "owner-1")
    job.PullDomainEvents()

    if err := job.MarkRunning(); err != nil {
        t.Fatalf("expected no error, got %v", err)
    }
    if job.Status != enums.JobStatusRunning {
        t.Errorf("expected RUNNING, got %q", job.Status)
    }
}

func TestMarkRunning_FromRunning_ReturnsError(t *testing.T) {
    job, _ := entities.NewTranscodingJob("video-1", "http://example.com/video.mp4", "owner-1")
    _ = job.MarkRunning()

    if err := job.MarkRunning(); err == nil {
        t.Fatal("expected error when calling MarkRunning on RUNNING job")
    }
}

func TestMarkCompleted_RaisesDomainEvent(t *testing.T) {
    job, _ := entities.NewTranscodingJob("video-1", "http://example.com/video.mp4", "owner-1")
    _ = job.MarkRunning()
    job.PullDomainEvents()

    if err := job.MarkCompleted("http://cdn.example.com/out.m3u8"); err != nil {
        t.Fatalf("expected no error, got %v", err)
    }
    evts := job.PullDomainEvents()
    if len(evts) != 1 {
        t.Fatalf("expected 1 domain event, got %d", len(evts))
    }
    if evts[0].GetEventName() != ctxevents.TranscodingJobCompletedEventName {
        t.Errorf("unexpected event: %s", evts[0].GetEventName())
    }
}
```

Use `t.Fatal` / `t.Fatalf` for precondition failures; `t.Error` / `t.Errorf` for assertion mismatches.

## Projection ApplyX Tests

Test each `ApplyX` method in isolation — no projector, no repo:

```go
package projections_test

import (
    "encoding/json"
    "testing"
    "time"

    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"

    "monorepo/api/internal/channel/projections"
)

func TestMessage_ApplyDelivered_SetsDeliveredAt(t *testing.T) {
    m := &projections.Message{}
    at := time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC)

    m.ApplyDelivered(at)

    require.NotNil(t, m.DeliveredAt)
    assert.Equal(t, at, *m.DeliveredAt)
}

func TestMessage_ApplyDelivered_ForwardOnly(t *testing.T) {
    t1 := time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC)
    t2 := time.Date(2026, 1, 1, 9, 0, 0, 0, time.UTC)  // earlier — out-of-order

    m := &projections.Message{}
    m.ApplyDelivered(t1)
    m.ApplyDelivered(t2)  // must not roll back

    assert.Equal(t, t1, *m.DeliveredAt, "DeliveredAt must not go backward")
}

func TestMessage_ApplyEdited_ReplacesContentAndSetsEditedAt(t *testing.T) {
    original := json.RawMessage(`{"text":"hello"}`)
    updated := json.RawMessage(`{"text":"hello world"}`)
    at := time.Date(2026, 1, 1, 11, 0, 0, 0, time.UTC)

    m := &projections.Message{Content: original}
    m.ApplyEdited(updated, at)

    assert.JSONEq(t, `{"text":"hello world"}`, string(m.Content))
    require.NotNil(t, m.EditedAt)
    assert.Equal(t, at, *m.EditedAt)
}
```

## Projector Tests via Mock Repository

For projector tests, define an in-memory mock in the same `_test.go` file (or in the projection repo's `mock_<name>_repository.go`). Use the compile-time interface check to catch drift.

```go
package projectors

import (
    "context"
    "testing"
    "time"

    "github.com/google/uuid"
    ctxevents "monorepo/api/internal/channel/events"
    "monorepo/api/internal/channel/projections"
    messagerepo "monorepo/api/internal/channel/repositories/message"
)

// ─── Mock ────────────────────────────────────────────────────────────────────

type mockMessageProjectionRepo struct {
    rowsByPlatformID map[string]*projections.Message
    rowsByID         map[string]*projections.Message
    insertIfNewCalls int
    saveCalls        []*projections.Message
}

func newMockMessageRepo() *mockMessageProjectionRepo {
    return &mockMessageProjectionRepo{
        rowsByPlatformID: make(map[string]*projections.Message),
        rowsByID:         make(map[string]*projections.Message),
    }
}

func (m *mockMessageProjectionRepo) platformKey(channelID, platformID string) string {
    return channelID + "|" + platformID
}

func (m *mockMessageProjectionRepo) Find(_ context.Context, id string) (*projections.Message, error) {
    return m.rowsByID[id], nil
}

func (m *mockMessageProjectionRepo) FindByPlatformID(_ context.Context, channelID, platformID string) (*projections.Message, error) {
    return m.rowsByPlatformID[m.platformKey(channelID, platformID)], nil
}

func (m *mockMessageProjectionRepo) Save(_ context.Context, msg *projections.Message) error {
    m.saveCalls = append(m.saveCalls, msg)
    m.rowsByID[msg.ID] = msg
    m.rowsByPlatformID[m.platformKey(msg.ChannelID, msg.PlatformMessageID)] = msg
    return nil
}

func (m *mockMessageProjectionRepo) InsertIfNew(_ context.Context, msg *projections.Message) (bool, error) {
    m.insertIfNewCalls++
    k := m.platformKey(msg.ChannelID, msg.PlatformMessageID)
    if _, exists := m.rowsByPlatformID[k]; exists {
        return false, nil
    }
    m.rowsByPlatformID[k] = msg
    m.rowsByID[msg.ID] = msg
    return true, nil
}

// Compile-time interface check
var _ messagerepo.MessageProjectionRepository = (*mockMessageProjectionRepo)(nil)

// ─── Tests ───────────────────────────────────────────────────────────────────

func TestMessageReceivedProjector_InsertsRow(t *testing.T) {
    repo := newMockMessageRepo()
    p := NewMessageReceivedProjector(repo)

    channelID := uuid.New()
    expectedID := uuid.New()
    evt := ctxevents.NewMessageReceivedEvent(channelID, "tenant", ctxevents.ChannelMessageReceivedPayload{
        ChannelID:         channelID,
        MessageID:         "msg-001",
        InternalMessageID: expectedID,
        RemoteID:          "remote@s.whatsapp.net",
        SenderID:          "sender@s.whatsapp.net",
        OccurredAt:        time.Now().UTC(),
        ObservedAt:        time.Now().UTC(),
        Platform:          "WHATSAPP",
        OwnerID:           "tenant",
    })

    if err := p.Handle(context.Background(), evt); err != nil {
        t.Fatalf("Handle: %v", err)
    }
    if repo.insertIfNewCalls != 1 {
        t.Fatalf("expected 1 InsertIfNew call, got %d", repo.insertIfNewCalls)
    }
    saved, _ := repo.FindByPlatformID(context.Background(), channelID.String(), "msg-001")
    if saved == nil {
        t.Fatal("expected row to be inserted")
    }
    if saved.ID != expectedID.String() {
        t.Errorf("ID mismatch: want %s, got %s", expectedID, saved.ID)
    }
}

func TestMessageReceivedProjector_IdempotentOnDuplicate(t *testing.T) {
    repo := newMockMessageRepo()
    p := NewMessageReceivedProjector(repo)
    channelID := uuid.New()
    evt := ctxevents.NewMessageReceivedEvent(channelID, "tenant", ctxevents.ChannelMessageReceivedPayload{
        ChannelID: channelID, MessageID: "msg-dup",
        OccurredAt: time.Now().UTC(), ObservedAt: time.Now().UTC(),
        Platform: "WHATSAPP", OwnerID: "tenant",
    })

    _ = p.Handle(context.Background(), evt)
    _ = p.Handle(context.Background(), evt)   // second call — must be no-op

    if len(repo.rowsByPlatformID) != 1 {
        t.Errorf("expected 1 row, got %d", len(repo.rowsByPlatformID))
    }
}
```

## Handler EventName Tests

For a handler whose logic delegates entirely to a use case (covered by its own tests), only the `EventName()` contract matters:

```go
func TestEnqueueTranscodingJobHandler_EventName(t *testing.T) {
    h := handlers.NewEnqueueTranscodingJobHandler(nil)
    if h.EventName() != "integration.video.uploaded" {
        t.Errorf("unexpected event name: %s", h.EventName())
    }
}
```

## Use Case Tests

For use cases that own real business invariants (multiple entity transitions, event persistence), test via a mock repository:

```go
func TestStartTranscodingJob_SavesEntityAndEvent(t *testing.T) {
    repo := transcodingjob.NewMockTranscodingJobRepository()
    eventRepo := newMockDomainEventRepository()
    uow := unitofwork.NewNoOpUnitOfWork()
    svc := services.NewStubTranscoderService("http://localhost", 0)

    h := usecases.NewStartTranscodingJobHandler(repo, uow, eventRepo, svc)
    out, err := h.Execute(context.Background(), usecases.StartTranscodingJobInput{
        VideoID:  "video-1",
        InputUrl: "http://cdn.example.com/raw.mp4",
        OwnerID:  "owner-1",
    })

    require.NoError(t, err)
    assert.NotEmpty(t, out.JobID)

    saved, _ := repo.FindByVideoID(context.Background(), "video-1")
    require.NotNil(t, saved)
    assert.Equal(t, enums.JobStatusPending, saved.Status)
}
```

## Testify Usage

- `require.NoError(t, err)` — stop the test immediately on unexpected error
- `require.NotNil(t, obj)` — stop before dereferencing
- `assert.Equal(t, want, got)` — log failure and continue
- `assert.JSONEq(t, wantJSON, gotJSON)` — JSON-aware equality
- Use `t.Fatal` / `t.Fatalf` when testify is not imported and you need to abort

## Table-Driven Tests

Use table-driven tests for state-machine coverage where the case matrix is large:

```go
func TestMarkCompleted_InvalidTransitions(t *testing.T) {
    cases := []struct {
        name    string
        setup   func(*entities.TranscodingJob)
        wantErr bool
    }{
        {"from pending", func(j *entities.TranscodingJob) {}, true},
        {"from completed", func(j *entities.TranscodingJob) {
            _ = j.MarkRunning()
            _ = j.MarkCompleted("url")
        }, true},
        {"from failed", func(j *entities.TranscodingJob) {
            _ = j.MarkRunning()
            _ = j.MarkFailed("err")
        }, true},
    }

    for _, tc := range cases {
        t.Run(tc.name, func(t *testing.T) {
            job, _ := entities.NewTranscodingJob("v", "http://u", "o")
            tc.setup(job)
            err := job.MarkCompleted("http://cdn.example.com/out.m3u8")
            if tc.wantErr && err == nil {
                t.Error("expected error, got nil")
            }
            if !tc.wantErr && err != nil {
                t.Errorf("unexpected error: %v", err)
            }
        })
    }
}
```

## Running Tests

```bash
# All tests in the api-go workspace
cd packages/api/go && go test ./...

# Specific package
cd packages/api/go && go test ./internal/transcoding/...

# Verbose
go test -v ./internal/transcoding/entities/...
```

## Checklist

- [ ] Test file colocated with the artifact (`<name>_test.go` next to `<name>.go`)
- [ ] Package declaration uses `_test` suffix (`package entities_test`) for black-box tests
- [ ] Mock repository in the same test file (small) or in `mock_<name>_repository.go` (reused)
- [ ] Compile-time interface check: `var _ Iface = (*mockImpl)(nil)`
- [ ] Entity tests: no DB, no mocks — direct instantiation only
- [ ] Projection ApplyX tests: direct struct construction, no projector or repo
- [ ] Projector tests: mock repo injected; assert on repo state post-Handle
- [ ] `t.Fatal` / `require.*` for preconditions; `t.Error` / `assert.*` for assertions

## References

- `packages/api/go/internal/transcoding/entities/transcoding_job_test.go` — entity unit test shape
- `dev:packages/channel/internal/channel/projections/message_test.go` — ApplyX projection tests
- `dev:packages/channel/internal/channel/projections/projectors/message_projector_test.go` — full mock repo + projector test suite
- `packages/api/go/internal/transcoding/handlers/enqueue_transcoding_job_test.go` — minimal EventName test
