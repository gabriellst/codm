package usecases

import (
	"context"
	errorsStd "errors"
	msgenums "template/api-go/internal/channel/enums"
	channelerrors "template/api-go/internal/channel/errors"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	"template/api-go/internal/channel/services/gateway"
	"template/api-go/internal/channel/services/gateway/whatsapp"
	"template/api-go/internal/channel/services/pool"
	"template/core-go/errors"
	"time"
)

type SendMediaInput struct {
	ChannelID string               `validate:"required,uuid"`
	RemoteID  string               `validate:"required"`
	MediaType msgenums.MessageType `validate:"required,oneof=IMAGE VIDEO DOCUMENT"`
	MediaURL  string               `validate:"required_without=MediaPath,excluded_with=MediaPath,omitempty,url"`
	MediaPath string               `validate:"required_without=MediaURL,excluded_with=MediaURL"`
	Caption   string               `validate:"omitempty,max=1024"`
	FileName  string               `validate:"omitempty,max=255"`
}

type SendMediaOutput struct {
	MessageID string `json:"messageId" example:"3EB0B430A6B7FBEC1200"`
	Timestamp int64  `json:"timestamp" example:"1710000000"`
}

type SendMediaHandler struct {
	integrationRepo channelrepo.ChannelRepository
	pool            pool.ChannelPool
}

func NewSendMediaHandler(
	integrationRepo channelrepo.ChannelRepository,
	pool pool.ChannelPool,
) *SendMediaHandler {
	return &SendMediaHandler{
		integrationRepo: integrationRepo,
		pool:            pool,
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

	ch, ok := h.pool.Get(channel.ID.UUID())
	if !ok {
		return SendMediaOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel not available")
	}

	sendContent := gateway.SendMediaContent{MediaURL: input.MediaURL, MediaPath: input.MediaPath, Caption: input.Caption, FileName: input.FileName}

	result, err := ch.SendMessage(ctx, gateway.SendMessageParams{
		To:          input.RemoteID,
		MessageType: input.MediaType,
		Content:     sendContent,
	})
	if err != nil {
		if errorsStd.Is(err, whatsapp.ErrInvalidRemoteID) {
			return SendMediaOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeInvalidRemoteID, "invalid remote identifier", err)
		}
		if errorsStd.Is(err, whatsapp.ErrMediaPathNotAllowed) {
			return SendMediaOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeMediaPathNotAllowed, "media path not allowed", err)
		}
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
