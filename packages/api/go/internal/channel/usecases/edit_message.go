package usecases

import (
	"context"
	"template/api-go/internal/channel/enums"
	channelerrors "template/api-go/internal/channel/errors"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	"template/api-go/internal/channel/services/registry"
	"template/core-go/errors"
)

type EditMessageInput struct {
	ChannelID string `validate:"required,uuid"`
	RemoteID  string `validate:"required"`
	MessageID string `validate:"required"`
	Text      string `validate:"required,min=1"`
}

type EditMessageOutput struct {
	Success bool `json:"success" example:"true"`
}

type EditMessageHandler struct {
	integrationRepo channelrepo.ChannelRepository
	registry        registry.ChannelRegistry
}

func NewEditMessageHandler(
	integrationRepo channelrepo.ChannelRepository,
	registry registry.ChannelRegistry,
) *EditMessageHandler {
	return &EditMessageHandler{
		integrationRepo: integrationRepo,
		registry:        registry,
	}
}

func (h *EditMessageHandler) Name() string { return "edit_message" }

func (h *EditMessageHandler) Execute(ctx context.Context, input EditMessageInput) (EditMessageOutput, error) {
	channel, err := h.integrationRepo.Find(ctx, input.ChannelID)
	if err != nil {
		return EditMessageOutput{}, err
	}
	if channel == nil {
		return EditMessageOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotFound, "channel not found")
	}
	if channel.Status != enums.ChannelStatusConnected {
		return EditMessageOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel is not connected")
	}

	ch, ok := h.registry.Get(channel.ID.UUID())
	if !ok {
		return EditMessageOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel not available")
	}

	err = ch.EditMessage(ctx, input.RemoteID, input.MessageID, input.Text)
	if err != nil {
		return EditMessageOutput{}, err
	}

	return EditMessageOutput{
		Success: true,
	}, nil
}
