// Package projections holds the channel gateway's read model — one row per
// channel session, materialized from the domain lifecycle events. It backs the
// gateway's own read endpoints (list/get channels) and is the source of truth
// for reconnection (owner_remote_id / account_detail).
package projections

import (
	"context"
	"time"

	"template/contracts-go/wire"
)

// ChannelProjection is a pure read-model record mirroring gateway.channels.
// No invariants, no domain logic — the projectors own its transitions.
type ChannelProjection struct {
	ID            string             `db:"id"`
	OwnerID       string             `db:"owner_id"`
	Kind          wire.ChannelKind   `db:"kind"`
	Status        wire.ChannelStatus `db:"status"`
	AccountDetail string             `db:"account_detail"`
	CreatedAt     time.Time          `db:"created_at"`
	UpdatedAt     time.Time          `db:"updated_at"`
}

// ChannelProjectionRepository is the atomic vocabulary for the channels read model.
type ChannelProjectionRepository interface {
	Upsert(ctx context.Context, row *ChannelProjection) error
	FindByID(ctx context.Context, id string) (*ChannelProjection, error)
	FindByOwnerAndKind(ctx context.Context, ownerID string, kind wire.ChannelKind) (*ChannelProjection, error)
	ListByOwner(ctx context.Context, ownerID string) ([]*ChannelProjection, error)
	// ListPaired returns every channel that already has a paired platform account
	// (account_detail <> ''), across all owners. The boot lifecycle hook uses it
	// to restore live sessions after a restart.
	ListPaired(ctx context.Context) ([]*ChannelProjection, error)
	SetStatus(ctx context.Context, id string, status wire.ChannelStatus, accountDetail string) error
}
