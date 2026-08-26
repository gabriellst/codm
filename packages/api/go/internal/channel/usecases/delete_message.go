package usecases

import (
	"context"
	"template/api-go/internal/channel/enums"
	channelerrors "template/api-go/internal/channel/errors"
	channelevents "template/api-go/internal/channel/events"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	"template/api-go/internal/channel/services/pool"
	"template/core-go/errors"
	"template/core-go/repositories"
	"template/core-go/services/unitofwork"
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
	pool            pool.ChannelPool
	domainEventRepo repositories.DomainEventRepository
	uow             unitofwork.UnitOfWork
}

func NewDeleteMessageHandler(
	integrationRepo channelrepo.ChannelRepository,
	pool pool.ChannelPool,
	domainEventRepo repositories.DomainEventRepository,
	uow unitofwork.UnitOfWork,
) *DeleteMessageHandler {
	return &DeleteMessageHandler{
		integrationRepo: integrationRepo,
		pool:            pool,
		domainEventRepo: domainEventRepo,
		uow:             uow,
	}
}

func (h *DeleteMessageHandler) Name() string { return "delete_message" }

func (h *DeleteMessageHandler) Execute(ctx context.Context, input DeleteMessageInput) (DeleteMessageOutput, error) {
	channel, err := h.integrationRepo.Find(ctx, input.ChannelID)
	if err != nil {
		return DeleteMessageOutput{}, err
	}
	if channel == nil {
		return DeleteMessageOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotFound, "channel not found")
	}
	if channel.Status != enums.ChannelStatusConnected {
		return DeleteMessageOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel is not connected")
	}

	ch, ok := h.pool.Get(channel.ID.UUID())
	if !ok {
		return DeleteMessageOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel not available")
	}

	if err := ch.DeleteMessage(ctx, input.RemoteID, input.MessageID); err != nil {
		return DeleteMessageOutput{}, err
	}

	// Tombstone event — the read model hides any MessageID that has
	// at least one channel.message_deleted row.
	evt := channelevents.NewMessageDeletedEvent(
		channel.ID.UUID(),
		channel.OwnerID,
		channelevents.ChannelMessageDeletedPayload{
			ChannelID: channel.ID.UUID(),
			MessageID: input.MessageID,
			RemoteID:  input.RemoteID,
			Platform:  channel.Platform,
			OwnerID:   channel.OwnerID,
		},
	)
	if err := h.uow.Execute(ctx, func(txCtx context.Context) error {
		return h.domainEventRepo.Save(txCtx, evt)
	}); err != nil {
		return DeleteMessageOutput{}, err
	}

	return DeleteMessageOutput{Success: true}, nil
}
