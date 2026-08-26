package mediator

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"template/core-go/db/sqlite"
	"template/core-go/types"
)

const (
	testSource    = "integration"
	testEventName = "integration.channel.connected"
)

type samplePayload struct {
	ChannelID string `json:"channelId"`
}

// recordingHandler records delivered events and can be told to fail its first
// failTimes calls (to exercise retry / dead-letter paths).
type recordingHandler struct {
	name      string
	failTimes int

	mu       sync.Mutex
	calls    int
	received []types.IntegrationEventI
}

func (h *recordingHandler) EventName() string { return h.name }

func (h *recordingHandler) Handle(_ context.Context, event types.IntegrationEventI) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.calls++
	if h.calls <= h.failTimes {
		return fmt.Errorf("recordingHandler: forced failure %d", h.calls)
	}
	h.received = append(h.received, event)
	return nil
}

func (h *recordingHandler) snapshot() (calls int, received []types.IntegrationEventI) {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.calls, append([]types.IntegrationEventI(nil), h.received...)
}

// newTestMediator builds a mediator over a real migrated SQLite store (the new
// claimed_by/lease_until columns are exercised end to end) with an injectable clock.
func newTestMediator(t *testing.T) (*SqlExternalMediator, *sqlite.SqliteStore, *int64) {
	t.Helper()
	store, err := sqlite.NewSqliteStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewSqliteStore: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })

	clock := time.Now().UnixMilli()
	m := NewSqlExternalMediator(store.DB(), testSource, NewSqliteWalPollingStrategy(0, 0))
	m.now = func() time.Time { return time.UnixMilli(clock) }
	return m, store, &clock
}

func countRows(t *testing.T, db *sql.DB, where string, args ...any) int {
	t.Helper()
	var n int
	q := "SELECT COUNT(*) FROM shared_outbox"
	if where != "" {
		q += " WHERE " + where
	}
	if err := db.QueryRow(q, args...).Scan(&n); err != nil {
		t.Fatalf("count rows: %v", err)
	}
	return n
}

// Publish → drainOnce delivers to a registered handler, marks the row processed,
// and the payload round-trips through UnmarshalIntegrationEvent.
func TestSqlExternalMediator_PublishThenConsume(t *testing.T) {
	ctx := context.Background()
	m, store, _ := newTestMediator(t)

	h := &recordingHandler{name: testEventName}
	m.Register(h)

	event := types.NewIntegrationEvent(testEventName, "owner-1", samplePayload{ChannelID: "c-1"})
	if err := m.Publish(ctx, event); err != nil {
		t.Fatalf("Publish: %v", err)
	}

	// Exactly one row, unprocessed, tagged with our source.
	if got := countRows(t, store.DB(), "source = ? AND processed_at IS NULL", testSource); got != 1 {
		t.Fatalf("expected 1 unprocessed row, got %d", got)
	}

	n, err := m.drainOnce(ctx)
	if err != nil {
		t.Fatalf("drainOnce: %v", err)
	}
	if n != 1 {
		t.Fatalf("expected to claim 1 row, got %d", n)
	}

	calls, received := h.snapshot()
	if calls != 1 || len(received) != 1 {
		t.Fatalf("expected handler called once with 1 event, got calls=%d received=%d", calls, len(received))
	}

	typed, err := types.UnmarshalIntegrationEvent[samplePayload](received[0])
	if err != nil {
		t.Fatalf("UnmarshalIntegrationEvent: %v", err)
	}
	if typed.Name != testEventName || typed.OwnerID != "owner-1" || typed.Payload.ChannelID != "c-1" {
		t.Fatalf("payload did not round-trip: %+v", typed)
	}

	// The row is now processed and drops out of the unprocessed set.
	if got := countRows(t, store.DB(), "processed_at IS NOT NULL"); got != 1 {
		t.Fatalf("expected the row to be marked processed, got %d processed", got)
	}
	// A second drain claims nothing.
	if n, err := m.drainOnce(ctx); err != nil || n != 0 {
		t.Fatalf("expected 0 rows on second drain, got n=%d err=%v", n, err)
	}
}

// A re-published event id is idempotent at the outbox: exactly one row.
func TestSqlExternalMediator_PublishIsIdempotent(t *testing.T) {
	ctx := context.Background()
	m, store, _ := newTestMediator(t)

	event := types.NewIntegrationEvent(testEventName, "owner-1", samplePayload{ChannelID: "c-1"})
	for i := 0; i < 3; i++ {
		if err := m.Publish(ctx, event); err != nil {
			t.Fatalf("Publish #%d: %v", i, err)
		}
	}
	if got := countRows(t, store.DB(), ""); got != 1 {
		t.Fatalf("expected 1 row after 3 identical publishes, got %d", got)
	}
}

// With no ingress handler registered (egress-only, today's channel gateway), the
// consumer claims nothing — the published row is never dropped.
func TestSqlExternalMediator_EgressOnlyNeverDropsRows(t *testing.T) {
	ctx := context.Background()
	m, store, _ := newTestMediator(t)

	event := types.NewIntegrationEvent(testEventName, "owner-1", samplePayload{ChannelID: "c-1"})
	if err := m.Publish(ctx, event); err != nil {
		t.Fatalf("Publish: %v", err)
	}

	n, err := m.drainOnce(ctx)
	if err != nil {
		t.Fatalf("drainOnce: %v", err)
	}
	if n != 0 {
		t.Fatalf("egress-only drain must claim 0 rows, got %d", n)
	}
	if got := countRows(t, store.DB(), "processed_at IS NULL"); got != 1 {
		t.Fatalf("row must remain unprocessed, got %d unprocessed", got)
	}
}

// Publish fans out to in-process callbacks synchronously (the SSE path).
func TestSqlExternalMediator_PublishFiresCallbacks(t *testing.T) {
	ctx := context.Background()
	m, _, _ := newTestMediator(t)

	var got []types.IntegrationEventI
	m.RegisterCallback(func(_ context.Context, e types.IntegrationEventI) { got = append(got, e) })

	event := types.NewIntegrationEvent(testEventName, "owner-1", samplePayload{ChannelID: "c-1"})
	if err := m.Publish(ctx, event); err != nil {
		t.Fatalf("Publish: %v", err)
	}
	if len(got) != 1 || got[0].GetEventName() != testEventName {
		t.Fatalf("expected callback to fire once with the event, got %d", len(got))
	}
}

// A failed dispatch keeps the lease (natural backoff): the row is not reclaimed
// until the lease expires, then it is redelivered and succeeds.
func TestSqlExternalMediator_RetriesAfterLeaseExpiry(t *testing.T) {
	ctx := context.Background()
	m, store, clock := newTestMediator(t)

	h := &recordingHandler{name: testEventName, failTimes: 1} // fail once, then succeed
	m.Register(h)

	event := types.NewIntegrationEvent(testEventName, "owner-1", samplePayload{ChannelID: "c-1"})
	if err := m.Publish(ctx, event); err != nil {
		t.Fatalf("Publish: %v", err)
	}

	// First drain: dispatch fails, row keeps its lease.
	if n, err := m.drainOnce(ctx); err != nil || n != 1 {
		t.Fatalf("first drain: n=%d err=%v", n, err)
	}
	if got := countRows(t, store.DB(), "processed_at IS NOT NULL"); got != 0 {
		t.Fatalf("failed row must not be processed yet, got %d processed", got)
	}
	// While the lease holds, a drain claims nothing.
	if n, err := m.drainOnce(ctx); err != nil || n != 0 {
		t.Fatalf("lease-held drain must claim 0, got n=%d err=%v", n, err)
	}

	// Advance the clock past the lease → the row is reclaimable and now succeeds.
	*clock += integrationLease.Milliseconds() + 1
	if n, err := m.drainOnce(ctx); err != nil || n != 1 {
		t.Fatalf("post-lease drain: n=%d err=%v", n, err)
	}

	calls, received := h.snapshot()
	if calls != 2 || len(received) != 1 {
		t.Fatalf("expected 2 calls (1 fail + 1 success) and 1 delivery, got calls=%d received=%d", calls, len(received))
	}
	if got := countRows(t, store.DB(), "processed_at IS NOT NULL"); got != 1 {
		t.Fatalf("row must be processed after successful retry, got %d", got)
	}
}

// A perpetually-failing handler dead-letters the row after integrationMaxAttempts,
// after which it stops being claimed.
func TestSqlExternalMediator_DeadLettersAfterMaxAttempts(t *testing.T) {
	ctx := context.Background()
	m, store, clock := newTestMediator(t)

	h := &recordingHandler{name: testEventName, failTimes: 1000} // never succeeds
	m.Register(h)

	event := types.NewIntegrationEvent(testEventName, "owner-1", samplePayload{ChannelID: "c-1"})
	if err := m.Publish(ctx, event); err != nil {
		t.Fatalf("Publish: %v", err)
	}

	for i := 0; i < integrationMaxAttempts; i++ {
		n, err := m.drainOnce(ctx)
		if err != nil {
			t.Fatalf("drain #%d: %v", i, err)
		}
		if i < integrationMaxAttempts-1 && n != 1 {
			t.Fatalf("drain #%d expected to claim 1, got %d", i, n)
		}
		*clock += integrationLease.Milliseconds() + 1 // expire the lease for the next attempt
	}

	// Dead-lettered: processed_at set, attempts at the cap, and no longer claimable.
	var attempts int64
	var processed sql.NullInt64
	if err := store.DB().QueryRow(
		"SELECT attempts, processed_at FROM shared_outbox WHERE id = ?", event.GetEventID(),
	).Scan(&attempts, &processed); err != nil {
		t.Fatalf("read dead-lettered row: %v", err)
	}
	if attempts < integrationMaxAttempts {
		t.Fatalf("expected attempts >= %d, got %d", integrationMaxAttempts, attempts)
	}
	if !processed.Valid {
		t.Fatalf("dead-lettered row must have processed_at set")
	}
	if n, err := m.drainOnce(ctx); err != nil || n != 0 {
		t.Fatalf("dead-lettered row must not be claimed again, got n=%d err=%v", n, err)
	}
}

// Start/Stop drives the full loop: Publish nudges the strategy, the loop wakes and
// delivers to the handler.
func TestSqlExternalMediator_StartStopDeliversViaLoop(t *testing.T) {
	ctx := context.Background()
	m, _, _ := newTestMediator(t)
	m.now = time.Now // real clock for the live loop

	delivered := make(chan types.IntegrationEventI, 1)
	m.RegisterCallback(func(_ context.Context, _ types.IntegrationEventI) {})
	m.Register(&channelHandler{name: testEventName, out: delivered})

	if err := m.Start(ctx); err != nil {
		t.Fatalf("Start: %v", err)
	}
	defer func() { _ = m.Stop(ctx) }()

	event := types.NewIntegrationEvent(testEventName, "owner-1", samplePayload{ChannelID: "c-1"})
	if err := m.Publish(ctx, event); err != nil {
		t.Fatalf("Publish: %v", err)
	}

	select {
	case got := <-delivered:
		if got.GetEventName() != testEventName {
			t.Fatalf("unexpected event delivered: %s", got.GetEventName())
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for loop delivery")
	}
}

// channelHandler forwards each delivered event onto a channel for the loop test.
type channelHandler struct {
	name string
	out  chan types.IntegrationEventI
}

func (h *channelHandler) EventName() string { return h.name }
func (h *channelHandler) Handle(_ context.Context, event types.IntegrationEventI) error {
	select {
	case h.out <- event:
	default:
	}
	return nil
}

// The polling strategy's in-process nudge wakes a waiter immediately.
func TestSqliteWalPollingStrategy_NudgeWakesWaiter(t *testing.T) {
	s := NewSqliteWalPollingStrategy(500*time.Millisecond, time.Second)

	done := make(chan error, 1)
	go func() { done <- s.Wait(context.Background(), testSource) }()

	time.Sleep(20 * time.Millisecond)
	_ = s.Notify(context.Background(), testSource)

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Wait returned error: %v", err)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("nudge did not wake the waiter within the poll interval")
	}
}

// Wait returns the context error when cancelled.
func TestSqliteWalPollingStrategy_WaitRespectsContext(t *testing.T) {
	s := NewSqliteWalPollingStrategy(time.Second, 2*time.Second)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := s.Wait(ctx, testSource); err == nil {
		t.Fatal("expected Wait to return the cancelled context error")
	}
}

// newEgressOnlyTestMediator mirrors newTestMediator but builds the mediator the way the
// gateway's composition root does — declared egress-only.
func newEgressOnlyTestMediator(t *testing.T) (*SqlExternalMediator, *sqlite.SqliteStore) {
	t.Helper()
	store, err := sqlite.NewSqliteStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewSqliteStore: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })

	clock := time.Now().UnixMilli()
	m := NewSqlExternalMediatorWithoutIngress(store.DB(), testSource, NewSqliteWalPollingStrategy(0, 0))
	m.now = func() time.Time { return time.UnixMilli(clock) }
	return m, store
}

// An egress-only mediator REFUSES an ingress handler, loudly. This is called from module
// wiring, so the error is a boot failure — the point is that a mis-wired ingress handler
// cannot end up silently registered on a mediator whose loop will never claim for it.
func TestEgressOnlyMediator_RegisterIngressHandlerFailsLoud(t *testing.T) {
	m, _ := newEgressOnlyTestMediator(t)

	err := m.Register(&recordingHandler{name: testEventName})
	if err == nil {
		t.Fatal("Register on an egress-only mediator must return an error, got nil")
	}
	if !strings.Contains(err.Error(), "egress-only") {
		t.Fatalf("error should name the reason, got: %v", err)
	}
	// And it must NOT have registered anything — a half-applied refusal would be worse
	// than either outcome.
	if names := m.handlerNames(); len(names) != 0 {
		t.Fatalf("refused registration still recorded handlers: %v", names)
	}

	// The non-egress-only construction still registers, so the guard is about the FLAG
	// and not about Register being broken.
	ok, _, _ := newTestMediator(t)
	if err := ok.Register(&recordingHandler{name: testEventName}); err != nil {
		t.Fatalf("Register on an ingress-capable mediator must succeed, got: %v", err)
	}
}

// An egress-only mediator still PUBLISHES (its lane keeps receiving rows) but claims
// nothing — drainOnce returns 0 and leaves the row unprocessed for the other process.
func TestEgressOnlyMediator_PublishesButClaimsNoIngress(t *testing.T) {
	ctx := context.Background()
	m, store := newEgressOnlyTestMediator(t)

	event := types.NewIntegrationEvent(testEventName, "owner-1", samplePayload{ChannelID: "c-1"})
	if err := m.Publish(ctx, event); err != nil {
		t.Fatalf("Publish: %v", err)
	}
	if got := countRows(t, store.DB(), "source = ? AND processed_at IS NULL", testSource); got != 1 {
		t.Fatalf("egress must still write its outbox row, got %d unprocessed rows", got)
	}

	n, err := m.drainOnce(ctx)
	if err != nil {
		t.Fatalf("drainOnce: %v", err)
	}
	if n != 0 {
		t.Fatalf("egress-only drainOnce must claim 0 rows, got %d", n)
	}

	// The row is untouched — not claimed, not processed. It belongs to the other process.
	if got := countRows(t, store.DB(), "claimed_by IS NOT NULL"); got != 0 {
		t.Fatalf("egress-only mediator claimed %d row(s); it must claim none", got)
	}
	if got := countRows(t, store.DB(), "processed_at IS NULL"); got != 1 {
		t.Fatalf("the published row must stay unprocessed for the ingress owner, got %d", got)
	}
}
