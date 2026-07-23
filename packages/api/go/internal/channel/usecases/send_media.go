package usecases

import (
	"context"
	msgenums "template/api-go/internal/channel/enums"
	channelerrors "template/api-go/internal/channel/errors"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	"template/api-go/internal/channel/services/gateway"
	"template/api-go/internal/channel/services/registry"
	"template/api-go/internal/shared/errors"
	"time"
)

type SendMediaInput struct {
	ChannelID string               `validate:"required,uuid"`
	RemoteID  string               `validate:"required"`
	MediaType msgenums.MessageType `validate:"required,oneof=IMAGE VIDEO DOCUMENT"`
	MediaURL  string               `validate:"required,url"`
	Caption   string               `validate:"omitempty,max=1024"`
	FileName  string               `validate:"omitempty,max=255"`
}

type SendMediaOutput struct {
	MessageID string `json:"messageId" example:"3EB0B430A6B7FBEC1200"`
	Timestamp int64  `json:"timestamp" example:"1710000000"`
}

type SendMediaHandler struct {
	integrationRepo channelrepo.ChannelRepository
	registry        registry.ChannelRegistry
}

func NewSendMediaHandler(
	integrationRepo channelrepo.ChannelRepository,
	registry registry.ChannelRegistry,
) *SendMediaHandler {
	return &SendMediaHandler{
		integrationRepo: integrationRepo,
		registry:        registry,
	}
}

func (h *SendMediaHandler) Name() string { return "send_media" }

func (h *SendMediaHandler) Execute(ctx context.Context, input SendMediaInput) (SendMediaOutput, error) {
	channel, err := h.integrationRepo.Find(ctx, input.ChannelID)
	if err != nil {
		return SendMediaOutput{}, err
	}
	if channel == nil {
		return SendMediaOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotFound, "channel not found")
	}
	if channel.Status != msgenums.ChannelStatusConnected {
		return SendMediaOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel is not connected")
	}

	ch, ok := h.registry.Get(channel.ID.UUID())
	if !ok {
		return SendMediaOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel not available")
	}

	sendContent := gateway.SendMediaContent{MediaURL: input.MediaURL, Caption: input.Caption, FileName: input.FileName}

	result, err := ch.SendMessage(ctx, gateway.SendMessageParams{
		To:          input.RemoteID,
		MessageType: input.MediaType,
		Content:     sendContent,
	})
	if err != nil {
		return SendMediaOutput{}, err
	}

	if result.Timestamp == 0 {
		result.Timestamp = time.Now().Unix()
	}

	return SendMediaOutput{
		MessageID: result.MessageID,
		Timestamp: result.Timestamp,
	}, nil
}
