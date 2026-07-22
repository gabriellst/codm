package handlers

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/google/uuid"

	ctxevents "template/api-go/internal/channel/events"
	"template/api-go/internal/shared/types"
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
