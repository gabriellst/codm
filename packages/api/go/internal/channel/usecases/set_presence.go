package usecases

import (
	"context"
	"template/api-go/internal/channel/enums"
	ctxerrors "template/api-go/internal/channel/errors"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	"template/api-go/internal/channel/services/gateway"
	"template/api-go/internal/channel/services/registry"
	"template/api-go/internal/shared/errors"

	"github.com/google/uuid"
)

type SetPresenceInput struct {
	ID       string             `validate:"required,uuid"`
	Presence enums.PresenceType `validate:"required,oneof=AVAILABLE UNAVAILABLE COMPOSING RECORDING PAUSED"`
}

type SetPresenceOutput struct{}

type SetPresenceHandler struct {
	repo     channelrepo.ChannelRepository
	registry registry.ChannelRegistry
}

func NewSetPresenceHandler(
	repo channelrepo.ChannelRepository,
	registry registry.ChannelRegistry,
) *SetPresenceHandler {
	return &SetPresenceHandler{repo: repo, registry: registry}
}

func (h *SetPresenceHandler) Name() string { return "set_presence" }

func (h *SetPresenceHandler) Execute(ctx context.Context, input SetPresenceInput) (SetPresenceOutput, error) {
	channel, err := h.repo.Find(ctx, input.ID)
	if err != nil {
		return SetPresenceOutput{}, err
	}
	if channel == nil {
		return SetPresenceOutput{}, errors.NewBaseError(ctxerrors.CodeChannelNotFound, "channel not found")
	}

	channelUUID, err := uuid.Parse(input.ID)
	if err != nil {
		return SetPresenceOutput{}, errors.NewBaseError(errors.CodeValidationFailed, "invalid channel id: "+input.ID)
	}

	ch, ok := h.registry.Get(channelUUID)
	if !ok || ch.Status() != gateway.ConnectionStatusConnected {
		return SetPresenceOutput{}, errors.NewBaseError(ctxerrors.CodeChannelNotConnected, "channel is not connected")
	}

	if err := ch.SetPresence(ctx, input.Presence); err != nil {
		return SetPresenceOutput{}, err
	}

	return SetPresenceOutput{}, nil
}
