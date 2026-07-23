package usecases

import (
	"context"
	ctxerrors "template/api-go/internal/channel/errors"
	ctxevents "template/api-go/internal/channel/events"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	"template/api-go/internal/channel/services/registry"
	"template/api-go/internal/shared/errors"
	"template/api-go/internal/shared/services/unitofwork"

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
	uow      unitofwork.UnitOfWork
}

func NewDeleteChannelHandler(
	repo channelrepo.ChannelRepository,
	registry registry.ChannelRegistry,
	uow unitofwork.UnitOfWork,
) *DeleteChannelHandler {
	return &DeleteChannelHandler{repo: repo, registry: registry, uow: uow}
}

func (h *DeleteChannelHandler) Name() string { return "delete_channel" }

func (h *DeleteChannelHandler) Execute(ctx context.Context, input DeleteChannelInput) (DeleteChannelOutput, error) {
	channel, err := h.repo.Find(ctx, input.ID)
	if err != nil {
		return DeleteChannelOutput{}, err
	}
	if channel == nil {
		return DeleteChannelOutput{}, errors.NewBaseError(ctxerrors.CodeChannelNotFound, "channel not found")
	}

	// Remove from registry (disconnects if connected)
	channelUUID, err := uuid.Parse(input.ID)
	if err != nil {
		return DeleteChannelOutput{}, errors.NewBaseError(errors.CodeValidationFailed, "invalid channel id: "+input.ID)
	}
	h.registry.Remove(channelUUID)

	// Raise the ChannelDeletedEvent so ChannelDeletedHandler fires via outbox.
	// Save must happen BEFORE the physical DELETE so the event log is written
	// while the projection row still exists.
	channel.AddDomainEvent(ctxevents.NewChannelDeletedEvent(
		channel.ID.UUID(),
		channel.OwnerID,
		ctxevents.ChannelDeletedPayload{
			ChannelID: channel.ID.UUID(),
			OwnerID:   channel.OwnerID,
		},
	))
	// Save + Delete are a genuine double-write: the repo contract requires a
	// UoW for strict atomicity (pg_channel_repository.go Save docs).
	err = h.uow.Execute(ctx, func(txCtx context.Context) error {
		if err := h.repo.Save(txCtx, channel); err != nil {
			return err
		}
		// Physically remove the projection row after the event is persisted.
		return h.repo.Delete(txCtx, input.ID)
	})
	if err != nil {
		return DeleteChannelOutput{}, err
	}

	return DeleteChannelOutput{
		ID: input.ID,
	}, nil
}
