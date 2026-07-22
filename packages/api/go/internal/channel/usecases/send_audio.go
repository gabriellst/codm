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

type SendAudioInput struct {
	ChannelID string `validate:"required,uuid"`
	RemoteID  string `validate:"required"`
	AudioURL  string `validate:"required,url"`
}

type SendAudioOutput struct {
	MessageID string `json:"messageId" example:"3EB0B430A6B7FBEC1200"`
	Timestamp int64  `json:"timestamp" example:"1710000000"`
}

type SendAudioHandler struct {
	integrationRepo channelrepo.ChannelRepository
	registry        registry.ChannelRegistry
}

func NewSendAudioHandler(
	integrationRepo channelrepo.ChannelRepository,
	registry registry.ChannelRegistry,
) *SendAudioHandler {
	return &SendAudioHandler{
		integrationRepo: integrationRepo,
		registry:        registry,
	}
}

func (h *SendAudioHandler) Name() string { return "SendAudio" }

func (h *SendAudioHandler) Execute(ctx context.Context, input SendAudioInput) (SendAudioOutput, error) {
	instance, err := h.integrationRepo.Find(ctx, input.ChannelID)
	if err != nil {
		return SendAudioOutput{}, err
	}
	if instance == nil {
		return SendAudioOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotFound, "instance not found")
	}
	if instance.Status != msgenums.ChannelStatusConnected {
		return SendAudioOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "instance is not connected")
	}

	ch, ok := h.registry.Get(instance.ID.UUID())
	if !ok {
		return SendAudioOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "instance channel not available")
	}

	sendContent := gateway.SendAudioContent{MediaURL: input.AudioURL}

	result, err := ch.SendMessage(ctx, gateway.SendMessageParams{
		To:          input.RemoteID,
		MessageType: msgenums.MessageTypeAudio,
		Content:     sendContent,
	})
	if err != nil {
		if errorsStd.Is(err, whatsapp.ErrInvalidRemoteID) {
			return SendAudioOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeInvalidRemoteID, "invalid remote identifier", err)
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
