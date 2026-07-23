package channel

import (
	"context"

	"template/api-go/internal/channel/entities"
)

// ChannelRepository is the read/write contract for the Channel aggregate.
//
// The production implementation is PgChannelRepository (T6), which reads and
// writes directly to the `channels` projection table. Domain events are still
// appended to shared.events via DomainEventRepository inside Save so the audit
// log remains intact.
//
// Not-found semantics: Find, FindByName, and FindByOwnerAndPlatform return
// (nil, nil) when the target channel does not exist — strict 404, no replay.
type ChannelRepository interface {
	Find(ctx context.Context, id string) (*entities.Channel, error)
	FindByName(ctx context.Context, name string) (*entities.Channel, error)
	FindByOwnerAndPlatform(ctx context.Context, ownerID string, platform string) (*entities.Channel, error)
	FindAll(ctx context.Context, ownerID string, limit, offset int) ([]*entities.Channel, int, error)
	// FindAllActive returns every non-deleted channel that has a stored session
	// (owner_remote_id is set). Used on startup to reconnect live sessions.
	FindAllActive(ctx context.Context) ([]*entities.Channel, error)
	Save(ctx context.Context, entity *entities.Channel) error
	Delete(ctx context.Context, id string) error
}
