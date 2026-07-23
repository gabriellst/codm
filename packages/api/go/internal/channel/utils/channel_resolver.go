// Package utils holds context-level helpers shared across layers
// (use cases, handlers, controllers).
package utils

import (
	"context"

	"github.com/google/uuid"

	channelerrors "template/api-go/internal/channel/errors"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	"template/api-go/internal/channel/services/gateway"
	"template/api-go/internal/channel/services/registry"
	"template/core-go/errors"
)

// ResolveActiveChannel looks up a connected channel by ID.
// Returns the parsed UUID, the live gateway.Channel, and the ownerID.
func ResolveActiveChannel(
	ctx context.Context,
	channelID string,
	repo channelrepo.ChannelRepository,
	reg registry.ChannelRegistry,
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
	live, ok := reg.Get(id)
	if !ok || live.Status() != gateway.ConnectionStatusConnected {
		return uuid.Nil, nil, "", errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel is not connected")
	}
	return id, live, ch.OwnerID, nil
}
