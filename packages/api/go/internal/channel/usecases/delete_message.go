package usecases

import (
	"context"
	"template/api-go/internal/channel/enums"
	channelerrors "template/api-go/internal/channel/errors"
	channelevents "template/api-go/internal/channel/events"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	"template/api-go/internal/channel/services/registry"
	"template/api-go/internal/shared/errors"
	"template/api-go/internal/shared/repositories"
	"template/api-go/internal/shared/services/unitofwork"
)

type DeleteMessageInput struct {
	ChannelID string `validate:"required,uuid"`
	RemoteID  string `validate:"required"`
	MessageID string `validate:"required"`
}

type DeleteMessageOutput struct {
	Success bool `json:"success" example:"true"`
}

type DeleteMessageHandler struct {
	integrationRepo channelrepo.ChannelRepository
	registry        registry.ChannelRegistry
	domainEventRepo repositories.DomainEventRepository
	uow             unitofwork.UnitOfWork
}

func NewDeleteMessageHandler(
	integrationRepo channelrepo.ChannelRepository,
	registry registry.ChannelRegistry,
	domainEventRepo repositories.DomainEventRepository,
	uow unitofwork.UnitOfWork,
) *DeleteMessageHandler {
	return &DeleteMessageHandler{
		integrationRepo: integrationRepo,
		registry:        registry,
		domainEventRepo: domainEventRepo,
		uow:             uow,
	}
}

func (h *DeleteMessageHandler) Name() string { return "DeleteMessage" }

func (h *DeleteMessageHandler) Execute(ctx context.Context, input DeleteMessageInput) (DeleteMessageOutput, error) {
	instance, err := h.integrationRepo.Find(ctx, input.ChannelID)
	if err != nil {
		return DeleteMessageOutput{}, err
	}
	if instance == nil {
		return DeleteMessageOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotFound, "instance not found")
	}
	if instance.Status != enums.ChannelStatusConnected {
		return DeleteMessageOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "instance is not connected")
	}

	ch, ok := h.registry.Get(instance.ID.UUID())
	if !ok {
		return DeleteMessageOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "instance channel not available")
	}

	if err := ch.DeleteMessage(ctx, input.RemoteID, input.MessageID); err != nil {
		return DeleteMessageOutput{}, err
	}

	// Tombstone event — the read model hides any MessageID that has
	// at least one channel.message_deleted row.
	evt := channelevents.NewMessageDeletedEvent(
		instance.ID.UUID(),
		instance.OwnerID,
		channelevents.ChannelMessageDeletedPayload{
			ChannelID: instance.ID.UUID(),
			MessageID: input.MessageID,
			RemoteID:  input.RemoteID,
			Platform:  instance.Platform,
			OwnerID:   instance.OwnerID,
		},
	)
	if err := h.uow.Execute(ctx, func(txCtx context.Context) error {
		return h.domainEventRepo.Save(txCtx, evt)
	}); err != nil {
		return DeleteMessageOutput{}, err
	}

	return DeleteMessageOutput{Success: true}, nil
}
