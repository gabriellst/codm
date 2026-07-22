package repositories

import (
	"context"

	"template/api-go/internal/shared/types"
)

// DomainEventRepository persists domain events to the event store and outbox.
// Every Save dual-writes: permanent event log + transient outbox for dispatch.
type DomainEventRepository interface {
	Save(ctx context.Context, event types.DomainEventI) error
	SaveAll(ctx context.Context, events []types.DomainEventI) error
}
