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
	"template/api-go/internal/shared/errors"

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

func (h *RestartChannelHandler) Name() string { return "RestartChannel" }

func (h *RestartChannelHandler) Execute(ctx context.Context, input RestartChannelInput) (RestartChannelOutput, error) {
	instance, err := h.repo.Find(ctx, input.ID)
	if err != nil {
		return RestartChannelOutput{}, err
	}
	if instance == nil {
		return RestartChannelOutput{}, errors.NewBaseError(ctxerrors.CodeChannelNotFound, "instance not found")
	}

	instanceUUID, _ := uuid.Parse(input.ID)

	// Remove existing connection
	h.registry.Remove(instanceUUID)

	// Re-register and connect
	ch, err := h.registry.Register(ctx, instanceUUID, gateway.ChannelConfig{
		OwnerID:       instance.OwnerID,
		OwnerRemoteID: instance.OwnerRemoteID,
	})
	if err != nil {
		return RestartChannelOutput{}, err
	}

	if err := ch.Connect(ctx); err != nil {
		return RestartChannelOutput{}, err
	}

	h.persistConnecting(ctx, instance)

	return RestartChannelOutput{
		ID:    input.ID,
		State: string(enums.ChannelStatusConnecting),
	}, nil
}

// persistConnecting marks the entity as CONNECTING and upserts it. Errors are
// non-fatal — the gateway is already connecting regardless of projection state.
func (h *RestartChannelHandler) persistConnecting(ctx context.Context, instance *entities.Channel) {
	instance.SetConnecting()
	if err := h.repo.Save(ctx, instance); err != nil {
		slog.Warn("failed to persist CONNECTING status", "channelId", instance.ID.String(), "error", err)
	}
}
