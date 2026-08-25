package whatsapp

import (
	"context"
	"sync"
	"sync/atomic"

	"template/core-go/repositories"
	"template/core-go/types"
)

// fakeDomainEventRepo records Save/SaveAll calls for assertion. Shared test
// double across this package's test files (bootstrap_test.go,
// process_history_sync_test.go) — split into its own file after
// sync_trigger_test.go (the file that originally declared it, alongside a
// test for the now-removed markSyncComplete/projectContactSnapshot trigger —
// see T13, .plans/2026-08-10-eixo-ambiente-go.md) was deleted: contact
// snapshot projection moved out of this adapter into
// projections/projectors/remote_snapshot_projector.go, so there was no longer
// a trigger method here to test, but this double is still load-bearing for
// the other suites.
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
