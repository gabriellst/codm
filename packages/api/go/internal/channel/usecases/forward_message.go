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
	"time"
)

type ForwardMessageInput struct {
	ChannelID      string `validate:"required,uuid"`
	RemoteID       string `validate:"required"`
	SourceRemoteID string `validate:"required"`
	MessageID      string `validate:"required"`
}

type ForwardMessageOutput struct {
	MessageID string `json:"messageId" example:"3EB0B430A6B7FBEC1200"`
	Timestamp int64  `json:"timestamp" example:"1710000000"`
}

type ForwardMessageHandler struct {
	integrationRepo channelrepo.ChannelRepository
	registry        registry.ChannelRegistry
}

func NewForwardMessageHandler(
	integrationRepo channelrepo.ChannelRepository,
	registry registry.ChannelRegistry,
) *ForwardMessageHandler {
	return &ForwardMessageHandler{
		integrationRepo: integrationRepo,
		registry:        registry,
	}
}

func (h *ForwardMessageHandler) Name() string { return "ForwardMessage" }

func (h *ForwardMessageHandler) Execute(ctx context.Context, input ForwardMessageInput) (ForwardMessageOutput, error) {
	instance, err := h.integrationRepo.Find(ctx, input.ChannelID)
	if err != nil {
		return ForwardMessageOutput{}, err
	}
	if instance == nil {
		return ForwardMessageOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotFound, "instance not found")
	}
	if instance.Status != msgenums.ChannelStatusConnected {
		return ForwardMessageOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "instance is not connected")
	}

	ch, ok := h.registry.Get(instance.ID.UUID())
	if !ok {
		return ForwardMessageOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "instance channel not available")
	}

	content := gateway.SendForwardContent{RemoteID: input.SourceRemoteID, MessageID: input.MessageID}

	result, err := ch.SendMessage(ctx, gateway.SendMessageParams{
		To:          input.RemoteID,
		MessageType: msgenums.MessageTypeText,
		Content:     content,
	})
	if err != nil {
		if errorsStd.Is(err, whatsapp.ErrInvalidRemoteID) {
			return ForwardMessageOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeInvalidRemoteID, "invalid remote identifier", err)
		}
		return ForwardMessageOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeMessageSendFailed, "failed to forward message", err)
	}

	if result.Timestamp == 0 {
		result.Timestamp = time.Now().Unix()
	}

	return ForwardMessageOutput{
		MessageID: result.MessageID,
		Timestamp: result.Timestamp,
	}, nil
}
