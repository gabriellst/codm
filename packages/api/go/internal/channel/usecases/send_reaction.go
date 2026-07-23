package usecases

import (
	"context"
	errorsStd "errors"
	msgenums "template/api-go/internal/channel/enums"
	channelerrors "template/api-go/internal/channel/errors"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	"template/api-go/internal/channel/services/gateway"
	"template/api-go/internal/channel/services/gateway/whatsapp"
	"template/api-go/internal/channel/services/registry"
	"template/api-go/internal/shared/errors"
)

type SendReactionInput struct {
	ChannelID string `validate:"required,uuid"`
	RemoteID  string `validate:"required"`
	MessageID string `validate:"required"`
	FromMe    bool
	Reaction  string `validate:"required"`
}

type SendReactionOutput struct {
	Success bool `json:"success" example:"true"`
}

type SendReactionHandler struct {
	integrationRepo channelrepo.ChannelRepository
	registry        registry.ChannelRegistry
}

func NewSendReactionHandler(
	integrationRepo channelrepo.ChannelRepository,
	registry registry.ChannelRegistry,
) *SendReactionHandler {
	return &SendReactionHandler{
		integrationRepo: integrationRepo,
		registry:        registry,
	}
}

func (h *SendReactionHandler) Name() string { return "send_reaction" }

func (h *SendReactionHandler) Execute(ctx context.Context, input SendReactionInput) (SendReactionOutput, error) {
	channel, err := h.integrationRepo.Find(ctx, input.ChannelID)
	if err != nil {
		return SendReactionOutput{}, err
	}
	if channel == nil {
		return SendReactionOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotFound, "channel not found")
	}
	if channel.Status != msgenums.ChannelStatusConnected {
		return SendReactionOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel is not connected")
	}

	ch, ok := h.registry.Get(channel.ID.UUID())
	if !ok {
		return SendReactionOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel not available")
	}

	content := gateway.SendReactionContent{
		Key:      gateway.SendReactionKey{RemoteID: input.RemoteID, FromMe: input.FromMe, ID: input.MessageID},
		Reaction: input.Reaction,
	}

	_, err = ch.SendMessage(ctx, gateway.SendMessageParams{
		To:          input.RemoteID,
		MessageType: msgenums.MessageTypeReaction,
		Content:     content,
	})
	if err != nil {
		if errorsStd.Is(err, whatsapp.ErrInvalidRemoteID) {
			return SendReactionOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeInvalidRemoteID, "invalid remote identifier", err)
		}
		return SendReactionOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeMessageSendFailed, "failed to send reaction message", err)
	}

	return SendReactionOutput{
		Success: true,
	}, nil
}
