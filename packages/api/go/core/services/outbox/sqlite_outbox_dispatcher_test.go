package outbox

import (
	"context"
	"database/sql"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"template/core-go/db/sqlite"
	"template/core-go/services/mediator"
	"template/core-go/types"
)

// testClock is a hand-cranked clock so the lease-expiry and dead-letter paths run
// deterministically (no real sleeps): the dispatcher reads d.now, the test advances it.
type testClock struct{ t time.Time }

func (c *testClock) now() time.Time          { return c.t }
func (c *testClock) advance(d time.Duration) { c.t = c.t.Add(d) }

// alwaysFailMediator is an InternalMediator whose Dispatch always errors, forcing
// every claimed row down the fail() path. It counts dispatch attempts so a test can
// assert redelivery actually re-invoked the handler.
type alwaysFailMediator struct{ dispatches int32 }

func (m *alwaysFailMediator) Register(mediator.DomainEventHandler)                       {}
func (m *alwaysFailMediator) RegisterCallback(func(context.Context, types.DomainEventI)) {}
func (m *alwaysFailMediator) Publish(context.Context, types.DomainEventI) error          { return nil }
func (m *alwaysFailMediator) Start(context.Context)                                      {}
func (m *alwaysFailMediator) Stop()                                                      {}
func (m *alwaysFailMediator) Dispatch(context.Context, types.DomainEventI) error {
	atomic.AddInt32(&m.dispatches, 1)
	return errHandlerRejected
}

// errHandlerRejected is a sentinel handler failure driving every claim down fail().
var errHandlerRejected = errors.New("boom: handler rejected the event")

// newOutboxStore opens a fresh migrated SQLite store for the dispatcher tests.
func newOutboxStore(t *testing.T) *sqlite.SqliteStore {
	t.Helper()
	store, err := sqlite.NewSqliteStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewSqliteStore: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	return store
}

// seedOutboxRow inserts one unprocessed domain-event row of OutboxSource, ready to be
// claimed. The payload is a minimal-but-valid envelope; the fail path never needs it.
func seedOutboxRow(t *testing.T, db *sql.DB, id string, createdAt int64) {
	t.Helper()
	if _, err := db.ExecContext(context.Background(),
		`INSERT INTO shared_outbox (id, name, entity_id, owner_id, payload, source, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		id, "test.event", id, "owner-1",
		`{"id":"`+id+`","name":"test.event","entityId":"`+id+`","ownerId":"owner-1","payload":{}}`,
		OutboxSource, createdAt,
	); err != nil {
		t.Fatalf("seed outbox row: %v", err)
	}
}

type outboxRowState struct {
	attempts    int
	lastError   sql.NullString
	processedAt sql.NullInt64
	leaseUntil  sql.NullInt64
	claimedBy   sql.NullString
}

func readOutboxRow(t *testing.T, db *sql.DB, id string) outboxRowState {
	t.Helper()
	var s outboxRowState
	if err := db.QueryRowContext(context.Background(),
		`SELECT attempts, last_error, processed_at, lease_until, claimed_by FROM shared_outbox WHERE id = ?`, id,
	).Scan(&s.attempts, &s.lastError, &s.processedAt, &s.leaseUntil, &s.claimedBy); err != nil {
		t.Fatalf("read outbox row: %v", err)
	}
	return s
}

// TestSqliteOutboxDispatcher_RedeliversAfterLeaseExpiry proves the retry path: a
// failed dispatch keeps the row leased (hidden from re-claim) with attempts + last_error
// advanced, and it becomes claimable again only once the lease expires on the clock.
func TestSqliteOutboxDispatcher_RedeliversAfterLeaseExpiry(t *testing.T) {
	ctx := context.Background()
	store := newOutboxStore(t)
	clock := &testClock{t: time.Unix(1_700_000_000, 0).UTC()}
	t0 := clock.now().UnixMilli()

	seedOutboxRow(t, store.DB(), "019e0000-0000-7000-8000-000000000001", t0)

	med := &alwaysFailMediator{}
	d := NewSqliteOutboxDispatcher(store.DB(), med, mediator.NewSqliteWalPollingStrategy(0, 0))
	d.now = clock.now

	// First drain: claim + dispatch fail → attempts=1, still leased for sqliteLease.
	n, err := d.drainOnce(ctx)
	if err != nil {
		t.Fatalf("drainOnce #1: %v", err)
	}
	if n != 1 {
		t.Fatalf("drainOnce #1 claimed: got %d want 1", n)
	}
	got := readOutboxRow(t, store.DB(), "019e0000-0000-7000-8000-000000000001")
	if got.attempts != 1 {
		t.Fatalf("attempts after first fail: got %d want 1", got.attempts)
	}
	if got.processedAt.Valid {
		t.Fatalf("row must not be processed after a retryable fail, got processed_at=%d", got.processedAt.Int64)
	}
	if !got.lastError.Valid || got.lastError.String == "" {
		t.Fatalf("last_error must be recorded on fail, got %+v", got.lastError)
	}
	wantLease := t0 + sqliteLease.Milliseconds()
	if !got.leaseUntil.Valid || got.leaseUntil.Int64 != wantLease {
		t.Fatalf("lease_until: got %v want %d", got.leaseUntil, wantLease)
	}

	// Still within the lease → the row is hidden, drain claims nothing, attempts unchanged.
	clock.advance(sqliteLease / 2)
	n, err = d.drainOnce(ctx)
	if err != nil {
		t.Fatalf("drainOnce #2: %v", err)
	}
	if n != 0 {
		t.Fatalf("leased row must not be re-claimed before expiry: got %d want 0", n)
	}
	if got := readOutboxRow(t, store.DB(), "019e0000-0000-7000-8000-000000000001"); got.attempts != 1 {
		t.Fatalf("attempts must stay 1 while leased, got %d", got.attempts)
	}

	// Past the lease → the row is reclaimed and redelivered (attempts advances to 2).
	clock.advance(sqliteLease)
	n, err = d.drainOnce(ctx)
	if err != nil {
		t.Fatalf("drainOnce #3: %v", err)
	}
	if n != 1 {
		t.Fatalf("expired row must be reclaimed: got %d want 1", n)
	}
	if got := readOutboxRow(t, store.DB(), "019e0000-0000-7000-8000-000000000001"); got.attempts != 2 {
		t.Fatalf("attempts after redelivery: got %d want 2", got.attempts)
	}
	if atomic.LoadInt32(&med.dispatches) != 2 {
		t.Fatalf("handler must have been re-invoked on redelivery: dispatches=%d want 2", med.dispatches)
	}
}

// TestSqliteOutboxDispatcher_DeadLettersAtCap proves the dead-letter path: after the
// attempt cap the row is marked processed (stops being claimed) with last_error kept
// for audit, and no further redelivery happens.
func TestSqliteOutboxDispatcher_DeadLettersAtCap(t *testing.T) {
	ctx := context.Background()
	store := newOutboxStore(t)
	clock := &testClock{t: time.Unix(1_700_000_000, 0).UTC()}

	const id = "019e0000-0000-7000-8000-0000000000aa"
	seedOutboxRow(t, store.DB(), id, clock.now().UnixMilli())

	med := &alwaysFailMediator{}
	d := NewSqliteOutboxDispatcher(store.DB(), med, mediator.NewSqliteWalPollingStrategy(0, 0))
	d.now = clock.now

	// Drain repeatedly, each time stepping past the lease so the row is re-claimable,
	// until it dead-letters. sqliteMaxAttempts failures cap it.
	for i := 0; i < sqliteMaxAttempts; i++ {
		n, err := d.drainOnce(ctx)
		if err != nil {
			t.Fatalf("drainOnce iter %d: %v", i, err)
		}
		if n != 1 {
			t.Fatalf("iter %d: expected to claim the row (got %d) — dead-lettered too early?", i, n)
		}
		clock.advance(sqliteLease + time.Second)
	}

	got := readOutboxRow(t, store.DB(), id)
	if got.attempts != sqliteMaxAttempts {
		t.Fatalf("attempts at dead-letter: got %d want %d", got.attempts, sqliteMaxAttempts)
	}
	if !got.processedAt.Valid {
		t.Fatalf("dead-lettered row must have processed_at set to stop being claimed")
	}
	if !got.lastError.Valid || got.lastError.String == "" {
		t.Fatalf("dead-lettered row must keep last_error for audit, got %+v", got.lastError)
	}

	// Once dead-lettered it is never claimed again, no matter how far the clock moves.
	clock.advance(24 * time.Hour)
	before := atomic.LoadInt32(&med.dispatches)
	n, err := d.drainOnce(ctx)
	if err != nil {
		t.Fatalf("post-dead-letter drain: %v", err)
	}
	if n != 0 {
		t.Fatalf("dead-lettered row must not be re-claimed: got %d want 0", n)
	}
	if atomic.LoadInt32(&med.dispatches) != before {
		t.Fatalf("no dispatch must happen after dead-letter: got %d want %d", med.dispatches, before)
	}
}
