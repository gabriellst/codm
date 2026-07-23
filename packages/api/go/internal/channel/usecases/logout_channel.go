package usecases

import (
	"context"

	"template/api-go/internal/channel/enums"
	ctxerrors "template/api-go/internal/channel/errors"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	"template/api-go/internal/channel/services/registry"
	"template/api-go/internal/shared/errors"

	"github.com/google/uuid"
)

type LogoutChannelInput struct {
	ID string `validate:"required,uuid"`
}

type LogoutChannelOutput struct {
	ID    string `json:"id" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	State string `json:"state" example:"CLOSE"`
}

type LogoutChannelHandler struct {
	repo     channelrepo.ChannelRepository
	registry registry.ChannelRegistry
}

func NewLogoutChannelHandler(
	repo channelrepo.ChannelRepository,
	registry registry.ChannelRegistry,
) *LogoutChannelHandler {
	return &LogoutChannelHandler{repo: repo, registry: registry}
}

func (h *LogoutChannelHandler) Name() string { return "logout_channel" }

func (h *LogoutChannelHandler) Execute(ctx context.Context, input LogoutChannelInput) (LogoutChannelOutput, error) {
	channel, err := h.repo.Find(ctx, input.ID)
	if err != nil {
		return LogoutChannelOutput{}, err
	}
	if channel == nil {
		return LogoutChannelOutput{}, errors.NewBaseError(ctxerrors.CodeChannelNotFound, "channel not found")
	}

	channelUUID, _ := uuid.Parse(input.ID)

	// Get channel from registry
	ch, ok := h.registry.Get(channelUUID)
	if !ok {
		return LogoutChannelOutput{}, errors.NewBaseError(ctxerrors.CodeChannelNotConnected, "channel is not connected")
	}

	// Logout from WhatsApp (clears session)
	if err := ch.Logout(ctx); err != nil {
		return LogoutChannelOutput{}, err
	}

	// Remove from registry
	h.registry.Remove(channelUUID)

	return LogoutChannelOutput{
		ID:    input.ID,
		State: string(enums.ChannelStatusDisconnected),
	}, nil
}
