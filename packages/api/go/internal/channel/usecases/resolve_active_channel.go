// This helper lives in `usecases` because that is who uses it — measured, not assumed: all eight
// call sites are use cases in this package (archive/unarchive, pin/unpin, mute/unmute,
// mark-as-seen/mark-as-unread), and there are no others.
//
// It used to live in `internal/channel/utils`, a package whose doc comment described it as holding
// "context-level helpers shared across layers (use cases, handlers, controllers)". No handler and no
// controller ever called it. `utils` is the folder a function lands in when nobody decides where it
// belongs, and the cost is not aesthetic: a helper filed under a layer-neutral name stops being
// reviewed as part of any layer, and its stated audience drifts from its real one with nothing to
// catch the divergence.
//
// Placed here it is a plain unexported-by-convention sibling of its callers — same package, no import,
// and the next reader finds it beside the eight functions that call it.
package usecases

import (
	"context"

	"github.com/google/uuid"

	channelerrors "template/api-go/internal/channel/errors"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	"template/api-go/internal/channel/services/gateway"
	"template/api-go/internal/channel/services/pool"
	"template/core-go/errors"
)

// ResolveActiveChannel looks up a connected channel by ID.
// Returns the parsed UUID, the live gateway.Channel, and the ownerID.
func ResolveActiveChannel(
	ctx context.Context,
	channelID string,
	repo channelrepo.ChannelRepository,
	pool pool.ChannelPool,
) (uuid.UUID, gateway.Channel, string, error) {
	id, err := uuid.Parse(channelID)
	if err != nil {
		return uuid.Nil, nil, "", errors.NewBaseError(channelerrors.CodeRemoteInvalidParams, "invalid channel id")
	}
	ch, err := repo.Find(ctx, channelID)
	if err != nil {
		return uuid.Nil, nil, "", err
	}
	if ch == nil {
		return uuid.Nil, nil, "", errors.NewBaseError(channelerrors.CodeChannelNotFound, "channel not found")
	}
	live, ok := pool.Get(id)
	if !ok || live.Status() != gateway.ConnectionStatusConnected {
		return uuid.Nil, nil, "", errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel is not connected")
	}
	return id, live, ch.OwnerID, nil
}
