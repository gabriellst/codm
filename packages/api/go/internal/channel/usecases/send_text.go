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

type SendTextInput struct {
	ChannelID       string `validate:"required,uuid"`
	RemoteID        string `validate:"required"`
	Text            string `validate:"required,min=1"`
	QuotedMessageID string `validate:"omitempty"`
}

type SendTextOutput struct {
	MessageID string `json:"messageId" example:"3EB0B430A6B7FBEC1200"`
	Timestamp int64  `json:"timestamp" example:"1710000000"`
}

type SendTextHandler struct {
	integrationRepo channelrepo.ChannelRepository
	registry        registry.ChannelRegistry
}

func NewSendTextHandler(
	integrationRepo channelrepo.ChannelRepository,
	registry registry.ChannelRegistry,
) *SendTextHandler {
	return &SendTextHandler{
		integrationRepo: integrationRepo,
		registry:        registry,
	}
}

func (h *SendTextHandler) Name() string { return "send_text" }

func (h *SendTextHandler) Execute(ctx context.Context, input SendTextInput) (SendTextOutput, error) {
	channel, err := h.integrationRepo.Find(ctx, input.ChannelID)
	if err != nil {
		return SendTextOutput{}, err
	}
	if channel == nil {
		return SendTextOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotFound, "channel not found")
	}
	if channel.Status != msgenums.ChannelStatusConnected {
		return SendTextOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel is not connected")
	}

	ch, ok := h.registry.Get(channel.ID.UUID())
	if !ok {
		return SendTextOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel not available")
	}

	content := gateway.SendTextContent{Text: input.Text, QuotedMessageID: input.QuotedMessageID}

	result, err := ch.SendMessage(ctx, gateway.SendMessageParams{
		To:          input.RemoteID,
		MessageType: msgenums.MessageTypeText,
		Content:     content,
	})
	if err != nil {
		if errorsStd.Is(err, whatsapp.ErrInvalidRemoteID) {
			return SendTextOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeInvalidRemoteID, "invalid remote identifier", err)
		}
		return SendTextOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeMessageSendFailed, "failed to send text message", err)
	}

	if result.Timestamp == 0 {
		result.Timestamp = time.Now().Unix()
	}

	return SendTextOutput{
		MessageID: result.MessageID,
		Timestamp: result.Timestamp,
	}, nil
}
