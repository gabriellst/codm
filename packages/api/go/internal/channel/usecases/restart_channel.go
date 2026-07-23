package usecases

import (
	"context"
	"log/slog"

	"template/api-go/internal/channel/entities"
	"template/api-go/internal/channel/enums"
	ctxerrors "template/api-go/internal/channel/errors"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	"template/api-go/internal/channel/services/gateway"
	"template/api-go/internal/channel/services/registry"
	"template/core-go/errors"

	"github.com/google/uuid"
)

type RestartChannelInput struct {
	ID string `validate:"required,uuid"`
}

type RestartChannelOutput struct {
	ID    string `json:"id" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	State string `json:"state" example:"CONNECTING"`
}

type RestartChannelHandler struct {
	repo     channelrepo.ChannelRepository
	registry registry.ChannelRegistry
}

func NewRestartChannelHandler(
	repo channelrepo.ChannelRepository,
	registry registry.ChannelRegistry,
) *RestartChannelHandler {
	return &RestartChannelHandler{repo: repo, registry: registry}
}

func (h *RestartChannelHandler) Name() string { return "restart_channel" }

func (h *RestartChannelHandler) Execute(ctx context.Context, input RestartChannelInput) (RestartChannelOutput, error) {
	channel, err := h.repo.Find(ctx, input.ID)
	if err != nil {
		return RestartChannelOutput{}, err
	}
	if channel == nil {
		return RestartChannelOutput{}, errors.NewBaseError(ctxerrors.CodeChannelNotFound, "channel not found")
	}

	channelUUID, err := uuid.Parse(input.ID)
	if err != nil {
		return RestartChannelOutput{}, errors.NewBaseError(errors.CodeValidationFailed, "invalid channel id: "+input.ID)
	}

	// Remove existing connection
	h.registry.Remove(channelUUID)

	// Re-register and connect
	ch, err := h.registry.Register(ctx, channelUUID, gateway.ChannelConfig{
		OwnerID:       channel.OwnerID,
		OwnerRemoteID: channel.OwnerRemoteID,
	})
	if err != nil {
		return RestartChannelOutput{}, err
	}

	if err := ch.Connect(ctx); err != nil {
		return RestartChannelOutput{}, err
	}

	h.persistConnecting(ctx, channel)

	return RestartChannelOutput{
		ID:    input.ID,
		State: string(enums.ChannelStatusConnecting),
	}, nil
}

// persistConnecting marks the entity as CONNECTING and upserts it. Errors are
// non-fatal — the gateway is already connecting regardless of projection state.
func (h *RestartChannelHandler) persistConnecting(ctx context.Context, channel *entities.Channel) {
	channel.SetConnecting()
	if err := h.repo.Save(ctx, channel); err != nil {
		slog.Warn("failed to persist CONNECTING status", "channelId", channel.ID.String(), "error", err)
	}
}
