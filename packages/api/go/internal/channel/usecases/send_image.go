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
	"template/core-go/errors"
	"time"
)

type SendImageInput struct {
	ChannelID string   `validate:"required,uuid"`
	RemoteID  string   `validate:"required"`
	MediaURL  string   `validate:"required,url"`
	Caption   string   `validate:"omitempty,max=1024"`
	Mentioned []string `validate:"omitempty"`
}

type SendImageOutput struct {
	MessageID string `json:"messageId" example:"3EB0B430A6B7FBEC1200"`
	Timestamp int64  `json:"timestamp" example:"1710000000"`
}

type SendImageHandler struct {
	integrationRepo channelrepo.ChannelRepository
	registry        registry.ChannelRegistry
}

func NewSendImageHandler(
	integrationRepo channelrepo.ChannelRepository,
	registry registry.ChannelRegistry,
) *SendImageHandler {
	return &SendImageHandler{
		integrationRepo: integrationRepo,
		registry:        registry,
	}
}

func (h *SendImageHandler) Name() string { return "send_image" }

func (h *SendImageHandler) Execute(ctx context.Context, input SendImageInput) (SendImageOutput, error) {
	channel, err := h.integrationRepo.Find(ctx, input.ChannelID)
	if err != nil {
		return SendImageOutput{}, err
	}
	if channel == nil {
		return SendImageOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotFound, "channel not found")
	}
	if channel.Status != msgenums.ChannelStatusConnected {
		return SendImageOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel is not connected")
	}

	ch, ok := h.registry.Get(channel.ID.UUID())
	if !ok {
		return SendImageOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel not available")
	}

	sendContent := gateway.SendImageContent{MediaURL: input.MediaURL, Caption: input.Caption, Mentioned: input.Mentioned}

	result, err := ch.SendMessage(ctx, gateway.SendMessageParams{
		To:          input.RemoteID,
		MessageType: msgenums.MessageTypeImage,
		Content:     sendContent,
	})
	if err != nil {
		if errorsStd.Is(err, whatsapp.ErrInvalidRemoteID) {
			return SendImageOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeInvalidRemoteID, "invalid remote identifier", err)
		}
		return SendImageOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeMessageSendFailed, "failed to send image message", err)
	}

	if result.Timestamp == 0 {
		result.Timestamp = time.Now().Unix()
	}

	return SendImageOutput{
		MessageID: result.MessageID,
		Timestamp: result.Timestamp,
	}, nil
}
