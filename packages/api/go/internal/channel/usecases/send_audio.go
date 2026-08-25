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

type SendAudioInput struct {
	ChannelID string `validate:"required,uuid"`
	RemoteID  string `validate:"required"`
	AudioURL  string `validate:"required_without=MediaPath,excluded_with=MediaPath,omitempty,url"`
	MediaPath string `validate:"required_without=AudioURL,excluded_with=AudioURL"`
}

type SendAudioOutput struct {
	MessageID string `json:"messageId" example:"3EB0B430A6B7FBEC1200"`
	Timestamp int64  `json:"timestamp" example:"1710000000"`
}

type SendAudioHandler struct {
	integrationRepo channelrepo.ChannelRepository
	pool            pool.ChannelPool
}

func NewSendAudioHandler(
	integrationRepo channelrepo.ChannelRepository,
	pool pool.ChannelPool,
) *SendAudioHandler {
	return &SendAudioHandler{
		integrationRepo: integrationRepo,
		pool:            pool,
	}
}

func (h *SendAudioHandler) Name() string { return "send_audio" }

func (h *SendAudioHandler) Execute(ctx context.Context, input SendAudioInput) (SendAudioOutput, error) {
	channel, err := h.integrationRepo.Find(ctx, input.ChannelID)
	if err != nil {
		return SendAudioOutput{}, err
	}
	if channel == nil {
		return SendAudioOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotFound, "channel not found")
	}
	if channel.Status != msgenums.ChannelStatusConnected {
		return SendAudioOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel is not connected")
	}

	ch, ok := h.pool.Get(channel.ID.UUID())
	if !ok {
		return SendAudioOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel not available")
	}

	sendContent := gateway.SendAudioContent{MediaURL: input.AudioURL, MediaPath: input.MediaPath}

	result, err := ch.SendMessage(ctx, gateway.SendMessageParams{
		To:          input.RemoteID,
		MessageType: msgenums.MessageTypeAudio,
		Content:     sendContent,
	})
	if err != nil {
		if errorsStd.Is(err, whatsapp.ErrInvalidRemoteID) {
			return SendAudioOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeInvalidRemoteID, "invalid remote identifier", err)
		}
		if errorsStd.Is(err, whatsapp.ErrMediaPathNotAllowed) {
			return SendAudioOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeMediaPathNotAllowed, "media path not allowed", err)
		}
		return SendAudioOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeMessageSendFailed, "failed to send audio message", err)
	}

	if result.Timestamp == 0 {
		result.Timestamp = time.Now().Unix()
	}

	return SendAudioOutput{
		MessageID: result.MessageID,
		Timestamp: result.Timestamp,
	}, nil
}
