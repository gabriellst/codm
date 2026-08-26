package pool_test

import (
	"context"
	"sync"
	"testing"

	"github.com/google/uuid"

	"template/api-go/internal/channel/services/gateway"
	"template/api-go/internal/channel/services/gateway/mock"
	"template/api-go/internal/channel/services/pool"
	"template/core-go/types"
)

// fakeDomainEventRepo is the minimal repositories.DomainEventRepository double
// mock.MockChannel needs — it persists the events its scripted Connect/Logout
// paths raise via mapper.MapEvent.
type fakeDomainEventRepo struct {
	mu    sync.Mutex
	saved []types.DomainEventI
}

func (r *fakeDomainEventRepo) Save(_ context.Context, e types.DomainEventI) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.saved = append(r.saved, e)
	return nil
}

func (r *fakeDomainEventRepo) SaveAll(_ context.Context, events []types.DomainEventI) error {
	for _, e := range events {
		_ = r.Save(context.Background(), e)
	}
	return nil
}

// TestChannelPoolImpl_RegisterAfterRemove_BuildsAFreshChannel is the
// pool-level half of requirement 1 ("o canal é removido do pool... de modo
// que o próximo connect no mesmo channelId crie um cliente novo"). The
// WhatsmeowChannel-level fix (see whatsapp.WhatsmeowChannel.handleEvent's
// events.LoggedOut case) depends entirely on THIS pool contract holding:
// once a channelId is Remove()d, the NEXT Register() for that same id must
// go back through the factory and hand out a brand-new Channel — never the
// stale cached one. Uses the gateway/mock Channel/Factory so this proves the
// pool's own bookkeeping, independent of the WhatsApp adapter.
func TestChannelPoolImpl_RegisterAfterRemove_BuildsAFreshChannel(t *testing.T) {
	factory := mock.NewMockChannelFactory(mock.Scenario{}, &fakeDomainEventRepo{})
	p := pool.NewChannelPool(factory)

	channelID := uuid.New()
	cfg := gateway.ChannelConfig{OwnerID: "owner-1", OwnerRemoteID: "5511999999999@s.whatsapp.net"}

	first, err := p.Register(context.Background(), channelID, cfg)
	if err != nil {
		t.Fatalf("first Register: %v", err)
	}

	// A second Register on the SAME id, without a Remove in between, is the
	// pool's existing cache-hit contract — same instance back.
	again, err := p.Register(context.Background(), channelID, cfg)
	if err != nil {
		t.Fatalf("second Register (no Remove): %v", err)
	}
	if first != again {
		t.Fatalf("want Register to return the cached instance when nothing evicted it")
	}

	// Simulates what WhatsmeowChannel.handleEvent's events.LoggedOut case does
	// via its evictor (gateway.PoolEvictor) — see whatsmeow_channel.go.
	p.Remove(channelID)

	rebuilt, err := p.Register(context.Background(), channelID, cfg)
	if err != nil {
		t.Fatalf("Register after Remove: %v", err)
	}
	if rebuilt == first {
		t.Fatalf("want a NEW channel instance after Remove — got the same stale one back " +
			"(this is exactly the production bug: a connect on the same channelId kept " +
			"reusing a channel bound to a permanently deleted whatsmeow device store)")
	}

	// The rebuilt channel must be immediately usable — Connect never returns
	// "invalid use of deleted device" on a fresh instance.
	if err := rebuilt.Connect(context.Background()); err != nil {
		t.Fatalf("Connect on the rebuilt channel: %v", err)
	}
}

// TestChannelPoolImpl_Remove_IsIdempotent guards the eviction call site itself
// (WhatsmeowChannel.handleEvent may call Remove for a channelId that a
// concurrent Restart/Delete already evicted) — Remove on an absent id must be
// a no-op, never a panic.
func TestChannelPoolImpl_Remove_IsIdempotent(t *testing.T) {
	factory := mock.NewMockChannelFactory(mock.Scenario{}, &fakeDomainEventRepo{})
	p := pool.NewChannelPool(factory)

	p.Remove(uuid.New())
	p.Remove(uuid.New())
}
