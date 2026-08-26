package remote

import (
	"context"

	"template/api-go/internal/channel/entities"
)

// RemoteRepository is the write side for the Remote aggregate. Find returns
// the aggregate with invariants; Save appends domain events from
// entity.PullDomainEvents() and updates any aggregate-state backing table
// in the same unit of work.
//
// Not-found semantics: Find returns (nil, nil) when the remote is absent.
type RemoteRepository interface {
	Find(ctx context.Context, channelID, remoteID string) (*entities.Remote, error)
	Save(ctx context.Context, remote *entities.Remote) error
}
