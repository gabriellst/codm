package usecases

import (
	"context"
	msgenums "template/api-go/internal/channel/enums"
	channelerrors "template/api-go/internal/channel/errors"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	"template/api-go/internal/channel/services/registry"
	"template/api-go/internal/shared/errors"
)

type SendChatPresenceInput struct {
	ChannelID string                    `validate:"required,uuid"`
	RemoteID  string                    `validate:"required"`
	Presence  msgenums.ChatPresenceType `validate:"required,oneof=composing recording paused"`
}

type SendChatPresenceOutput struct {
	Success bool `json:"success" example:"true"`
}

type SendChatPresenceHandler struct {
	integrationRepo channelrepo.ChannelRepository
	registry        registry.ChannelRegistry
}

func NewSendChatPresenceHandler(
	integrationRepo channelrepo.ChannelRepository,
	registry registry.ChannelRegistry,
) *SendChatPresenceHandler {
	return &SendChatPresenceHandler{
		integrationRepo: integrationRepo,
		registry:        registry,
	}
}

func (h *SendChatPresenceHandler) Name() string { return "SendChatPresence" }

func (h *SendChatPresenceHandler) Execute(ctx context.Context, input SendChatPresenceInput) (SendChatPresenceOutput, error) {
	instance, err := h.integrationRepo.Find(ctx, input.ChannelID)
	if err != nil {
		return SendChatPresenceOutput{}, err
	}
	if instance == nil {
		return SendChatPresenceOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotFound, "instance not found")
	}
	if instance.Status != msgenums.ChannelStatusConnected {
		return SendChatPresenceOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "instance is not connected")
	}

	ch, ok := h.registry.Get(instance.ID.UUID())
	if !ok {
		return SendChatPresenceOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "instance channel not available")
	}

	err = ch.SendChatPresence(ctx, input.RemoteID, input.Presence)
	if err != nil {
		return SendChatPresenceOutput{}, err
	}

	return SendChatPresenceOutput{
		Success: true,
	}, nil
}
