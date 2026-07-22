package whatsapp

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"

	"template/api-go/internal/shared/repositories"
	"template/api-go/internal/shared/types"
)

// fakeDomainEventRepo records Save/SaveAll calls for assertion.
type fakeDomainEventRepo struct {
	mu    sync.Mutex
	count atomic.Int32
	saved []types.DomainEventI
}

func (r *fakeDomainEventRepo) Save(ctx context.Context, e types.DomainEventI) error {
	r.count.Add(1)
	r.mu.Lock()
	r.saved = append(r.saved, e)
	r.mu.Unlock()
	return nil
}

func (r *fakeDomainEventRepo) SaveAll(ctx context.Context, events []types.DomainEventI) error {
	for _, e := range events {
		_ = r.Save(ctx, e)
	}
	return nil
}

var _ repositories.DomainEventRepository = (*fakeDomainEventRepo)(nil)

func TestMarkSyncComplete_LaunchesBootstrap(t *testing.T) {
	repo := &fakeDomainEventRepo{}
	c := &WhatsmeowChannel{
		instanceID:      uuid.New(),
		ownerID:         "tenant",
		domainEventRepo: repo,
	}
	c.markSyncComplete() // should not panic, launches goroutine
	time.Sleep(50 * time.Millisecond)
	// bootstrap no-ops because client/device are nil; no gateway event
	// should be persisted from markSyncComplete itself.
	if repo.count.Load() != 0 {
		t.Fatalf("markSyncComplete should not persist; got %d", repo.count.Load())
	}
}
