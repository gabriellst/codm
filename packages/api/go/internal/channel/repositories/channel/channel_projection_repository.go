package instance

import (
	"context"

	"template/api-go/internal/channel/projections"
)

// ChannelProjectionRepository is the read side + projection writes for the
// Channel aggregate. Returns *projections.Channel records (not entities).
// Writes happen via projectors reacting to channel lifecycle events.
//
// Not-found semantics: Find returns (nil, nil) when the channel is absent.
type ChannelProjectionRepository interface {
	Find(ctx context.Context, channelID string) (*projections.Channel, error)
	ListByOwner(ctx context.Context, ownerID string) ([]*projections.Channel, error)
	Save(ctx context.Context, channel *projections.Channel) error
}
