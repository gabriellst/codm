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

type SendVideoInput struct {
	ChannelID string `validate:"required,uuid"`
	RemoteID  string `validate:"required"`
	MediaURL  string `validate:"required,url"`
	Caption   string `validate:"omitempty,max=1024"`
}

type SendVideoOutput struct {
	MessageID string `json:"messageId" example:"3EB0B430A6B7FBEC1200"`
	Timestamp int64  `json:"timestamp" example:"1710000000"`
}

type SendVideoHandler struct {
	integrationRepo channelrepo.ChannelRepository
	registry        registry.ChannelRegistry
}

func NewSendVideoHandler(
	integrationRepo channelrepo.ChannelRepository,
	registry registry.ChannelRegistry,
) *SendVideoHandler {
	return &SendVideoHandler{
		integrationRepo: integrationRepo,
		registry:        registry,
	}
}

func (h *SendVideoHandler) Name() string { return "SendVideo" }

func (h *SendVideoHandler) Execute(ctx context.Context, input SendVideoInput) (SendVideoOutput, error) {
	instance, err := h.integrationRepo.Find(ctx, input.ChannelID)
	if err != nil {
		return SendVideoOutput{}, err
	}
	if instance == nil {
		return SendVideoOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotFound, "instance not found")
	}
	if instance.Status != msgenums.ChannelStatusConnected {
		return SendVideoOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "instance is not connected")
	}

	ch, ok := h.registry.Get(instance.ID.UUID())
	if !ok {
		return SendVideoOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "instance channel not available")
	}

	sendContent := gateway.SendVideoContent{MediaURL: input.MediaURL, Caption: input.Caption}

	result, err := ch.SendMessage(ctx, gateway.SendMessageParams{
		To:          input.RemoteID,
		MessageType: msgenums.MessageTypeVideo,
		Content:     sendContent,
	})
	if err != nil {
		if errorsStd.Is(err, whatsapp.ErrInvalidRemoteID) {
			return SendVideoOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeInvalidRemoteID, "invalid remote identifier", err)
		}
		return SendVideoOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeMessageSendFailed, "failed to send video message", err)
	}

	if result.Timestamp == 0 {
		result.Timestamp = time.Now().Unix()
	}

	return SendVideoOutput{
		MessageID: result.MessageID,
		Timestamp: result.Timestamp,
	}, nil
}
