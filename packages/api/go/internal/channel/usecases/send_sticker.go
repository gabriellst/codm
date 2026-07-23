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

type SendStickerInput struct {
	ChannelID  string `validate:"required,uuid"`
	RemoteID   string `validate:"required"`
	StickerURL string `validate:"required,url"`
}

type SendStickerOutput struct {
	MessageID string `json:"messageId" example:"3EB0B430A6B7FBEC1200"`
	Timestamp int64  `json:"timestamp" example:"1710000000"`
}

type SendStickerHandler struct {
	integrationRepo channelrepo.ChannelRepository
	registry        registry.ChannelRegistry
}

func NewSendStickerHandler(
	integrationRepo channelrepo.ChannelRepository,
	registry registry.ChannelRegistry,
) *SendStickerHandler {
	return &SendStickerHandler{
		integrationRepo: integrationRepo,
		registry:        registry,
	}
}

func (h *SendStickerHandler) Name() string { return "send_sticker" }

func (h *SendStickerHandler) Execute(ctx context.Context, input SendStickerInput) (SendStickerOutput, error) {
	channel, err := h.integrationRepo.Find(ctx, input.ChannelID)
	if err != nil {
		return SendStickerOutput{}, err
	}
	if channel == nil {
		return SendStickerOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotFound, "channel not found")
	}
	if channel.Status != msgenums.ChannelStatusConnected {
		return SendStickerOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel is not connected")
	}

	ch, ok := h.registry.Get(channel.ID.UUID())
	if !ok {
		return SendStickerOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel not available")
	}

	sendContent := gateway.SendStickerContent{MediaURL: input.StickerURL}

	result, err := ch.SendMessage(ctx, gateway.SendMessageParams{
		To:          input.RemoteID,
		MessageType: msgenums.MessageTypeSticker,
		Content:     sendContent,
	})
	if err != nil {
		if errorsStd.Is(err, whatsapp.ErrInvalidRemoteID) {
			return SendStickerOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeInvalidRemoteID, "invalid remote identifier", err)
		}
		return SendStickerOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeMessageSendFailed, "failed to send sticker message", err)
	}

	if result.Timestamp == 0 {
		result.Timestamp = time.Now().Unix()
	}

	return SendStickerOutput{
		MessageID: result.MessageID,
		Timestamp: result.Timestamp,
	}, nil
}
