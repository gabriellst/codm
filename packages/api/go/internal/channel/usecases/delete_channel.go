package usecases

import (
	"context"
	ctxerrors "template/api-go/internal/channel/errors"
	ctxevents "template/api-go/internal/channel/events"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	"template/api-go/internal/channel/services/registry"
	"template/api-go/internal/shared/errors"

	"github.com/google/uuid"
)

type DeleteChannelInput struct {
	ID string `validate:"required,uuid"`
}

type DeleteChannelOutput struct {
	ID string `json:"id" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
}

type DeleteChannelHandler struct {
	repo     channelrepo.ChannelRepository
	registry registry.ChannelRegistry
}

func NewDeleteChannelHandler(
	repo channelrepo.ChannelRepository,
	registry registry.ChannelRegistry,
) *DeleteChannelHandler {
	return &DeleteChannelHandler{repo: repo, registry: registry}
}

func (h *DeleteChannelHandler) Name() string { return "DeleteInstance" }

func (h *DeleteChannelHandler) Execute(ctx context.Context, input DeleteChannelInput) (DeleteChannelOutput, error) {
	instance, err := h.repo.Find(ctx, input.ID)
	if err != nil {
		return DeleteChannelOutput{}, err
	}
	if instance == nil {
		return DeleteChannelOutput{}, errors.NewBaseError(ctxerrors.CodeChannelNotFound, "instance not found")
	}

	// Remove from registry (disconnects if connected)
	instanceUUID, _ := uuid.Parse(input.ID)
	h.registry.Remove(instanceUUID)

	// Raise the ChannelDeletedEvent so ChannelDeletedHandler fires via outbox.
	// Save must happen BEFORE the physical DELETE so the event log is written
	// while the projection row still exists.
	instance.AddDomainEvent(ctxevents.NewChannelDeletedEvent(
		instance.ID.UUID(),
		instance.OwnerID,
		ctxevents.ChannelDeletedPayload{
			ChannelID: instance.ID.UUID(),
			OwnerID:   instance.OwnerID,
		},
	))
	if err := h.repo.Save(ctx, instance); err != nil {
		return DeleteChannelOutput{}, err
	}

	// Physically remove the projection row after the event is persisted.
	if err := h.repo.Delete(ctx, input.ID); err != nil {
		return DeleteChannelOutput{}, err
	}

	return DeleteChannelOutput{
		ID: input.ID,
	}, nil
}
