package handlers

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/google/uuid"

	ctxevents "template/api-go/internal/channel/events"
	"template/core-go/types"
)

type countingRepo struct {
	count atomic.Int32
	mu    sync.Mutex
	saved []types.DomainEventI
}

func (r *countingRepo) Save(ctx context.Context, e types.DomainEventI) error {
	r.count.Add(1)
	r.mu.Lock()
	r.saved = append(r.saved, e)
	r.mu.Unlock()
	return nil
}

func (r *countingRepo) SaveAll(ctx context.Context, events []types.DomainEventI) error {
	for _, e := range events {
		_ = r.Save(ctx, e)
	}
	return nil
}

// idDedupRepo mimics the event store's INSERT … ON CONFLICT (id) DO NOTHING
// idiom (pg_domain_event_repository.go — conflict behavior itself is proven by
// its batch test's "ID collision" case): a Save with an already-seen event id
// is dropped. Composing it with the handlers proves redelivery does not
// duplicate fact rows end-to-end.
type idDedupRepo struct {
	countingRepo
	seen map[string]bool
}

func (r *idDedupRepo) Save(ctx context.Context, e types.DomainEventI) error {
	id := ""
	if p, ok := e.(interface{ GetEventID() string }); ok {
		id = p.GetEventID()
	}
	r.mu.Lock()
	if r.seen == nil {
		r.seen = map[string]bool{}
	}
	dup := id != "" && r.seen[id]
	r.seen[id] = true
	r.mu.Unlock()
	if dup {
		return nil // ON CONFLICT (id) DO NOTHING
	}
	return r.countingRepo.Save(ctx, e)
}

// Double-delivery case (HDL-GO-06): the same gateway_connected delivered twice
// (at-least-once outbox) must yield exactly ONE sync_started fact row, while a
// DIFFERENT source event still produces its own row.
func TestSyncStartedHandler_RedeliveryDoesNotDuplicateFactRows(t *testing.T) {
	repo := &idDedupRepo{}
	h := NewSyncStartedHandler(repo)

	channelID := uuid.New()
	evt := ctxevents.NewGatewayConnectedEvent(channelID, "tenant", ctxevents.GatewayConnectedPayload{
		ChannelID: channelID,
		Platform:  "WHATSAPP",
		OwnerID:   "tenant",
	})

	// Same source event, delivered twice.
	if err := h.Handle(context.Background(), evt); err != nil {
		t.Fatalf("first Handle failed: %v", err)
	}
	if err := h.Handle(context.Background(), evt); err != nil {
		t.Fatalf("redelivery Handle failed: %v", err)
	}
	if repo.count.Load() != 1 {
		t.Fatalf("redelivery duplicated the sync_started fact: want 1 row, got %d", repo.count.Load())
	}

	// A distinct source event (fresh reconnect) is a NEW fact.
	evt2 := ctxevents.NewGatewayConnectedEvent(channelID, "tenant", ctxevents.GatewayConnectedPayload{
		ChannelID: channelID,
		Platform:  "WHATSAPP",
		OwnerID:   "tenant",
	})
	if err := h.Handle(context.Background(), evt2); err != nil {
		t.Fatalf("Handle for second source failed: %v", err)
	}
	if repo.count.Load() != 2 {
		t.Fatalf("distinct source events must derive distinct fact rows: want 2, got %d", repo.count.Load())
	}
}

// The derived id is deterministic per (source event id, derived name): sync
// handlers listening to the SAME source event derive DIFFERENT ids per fact
// kind, and the same handler derives the SAME id across redeliveries.
func TestSyncHandlers_DerivedIDsAreDeterministicPerSourceAndName(t *testing.T) {
	repo := &countingRepo{}
	started := NewSyncStartedHandler(repo)

	channelID := uuid.New()
	evt := ctxevents.NewGatewayConnectedEvent(channelID, "tenant", ctxevents.GatewayConnectedPayload{
		ChannelID: channelID,
		Platform:  "WHATSAPP",
		OwnerID:   "tenant",
	})

	if err := started.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle 1: %v", err)
	}
	if err := started.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle 2: %v", err)
	}

	repo.mu.Lock()
	defer repo.mu.Unlock()
	id0 := repo.saved[0].(interface{ GetEventID() string }).GetEventID()
	id1 := repo.saved[1].(interface{ GetEventID() string }).GetEventID()
	if id0 != id1 {
		t.Fatalf("same source + same derived name must give the same id: %s vs %s", id0, id1)
	}
}

func TestSyncCompletedHandler_EmitsOnEveryCall(t *testing.T) {
	repo := &countingRepo{}
	h := NewSyncCompletedHandler(repo)

	channelID := uuid.New()
	evt := ctxevents.NewGatewaySyncCompleteEvent(channelID, "tenant", ctxevents.ChannelGatewaySyncCompletePayload{
		ChannelID: channelID,
		OwnerID:   "tenant",
	})

	if err := h.Handle(context.Background(), evt); err != nil {
		t.Fatalf("first Handle failed: %v", err)
	}
	if err := h.Handle(context.Background(), evt); err != nil {
		t.Fatalf("second Handle failed: %v", err)
	}
	if repo.count.Load() != 2 {
		t.Fatalf("expected 2 sync_completed saves (guard removed), got %d", repo.count.Load())
	}
}

func TestSyncProgressHandler_EmitsDomainEvent(t *testing.T) {
	repo := &countingRepo{}
	h := NewSyncProgressHandler(repo)

	channelID := uuid.New()
	evt := ctxevents.NewGatewayHistorySyncEvent(channelID, "tenant", ctxevents.ChannelGatewayHistorySyncPayload{
		ChannelID:       channelID,
		OwnerID:         "tenant",
		HistorySyncType: "initial",
		Percent:         42,
	})

	if err := h.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle failed: %v", err)
	}
	if repo.count.Load() != 1 {
		t.Fatalf("expected 1 save, got %d", repo.count.Load())
	}
	repo.mu.Lock()
	defer repo.mu.Unlock()
	if repo.saved[0].GetEventName() != "channel.sync_progress" {
		t.Fatalf("got %s", repo.saved[0].GetEventName())
	}
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelSyncProgressPayload](repo.saved[0])
	if err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if e.Payload.Percent != 42 {
		t.Fatalf("want percent=42, got %d", e.Payload.Percent)
	}
}
