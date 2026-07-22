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

func (h *SendReactionHandler) Name() string { return "SendReaction" }

func (h *SendReactionHandler) Execute(ctx context.Context, input SendReactionInput) (SendReactionOutput, error) {
	instance, err := h.integrationRepo.Find(ctx, input.ChannelID)
	if err != nil {
		return SendReactionOutput{}, err
	}
	if instance == nil {
		return SendReactionOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotFound, "instance not found")
	}
	if instance.Status != msgenums.ChannelStatusConnected {
		return SendReactionOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "instance is not connected")
	}

	ch, ok := h.registry.Get(instance.ID.UUID())
	if !ok {
		return SendReactionOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "instance channel not available")
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
