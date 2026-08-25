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

type SendStatusInput struct {
	ChannelID       string               `validate:"required,uuid"`
	StatusType      msgenums.MessageType `validate:"required,oneof=TEXT IMAGE VIDEO AUDIO"`
	Content         string               `validate:"required"`
	Caption         string               `validate:"omitempty,max=1024"`
	BackgroundColor string               `validate:"omitempty"`
	Font            string               `validate:"omitempty"`
}

type SendStatusOutput struct {
	MessageID string `json:"messageId" example:"3EB0B430A6B7FBEC1200"`
	Timestamp int64  `json:"timestamp" example:"1710000000"`
}

type SendStatusHandler struct {
	integrationRepo channelrepo.ChannelRepository
	pool            pool.ChannelPool
}

func NewSendStatusHandler(
	integrationRepo channelrepo.ChannelRepository,
	pool pool.ChannelPool,
) *SendStatusHandler {
	return &SendStatusHandler{
		integrationRepo: integrationRepo,
		pool:            pool,
	}
}

func (h *SendStatusHandler) Name() string { return "send_status" }

func (h *SendStatusHandler) Execute(ctx context.Context, input SendStatusInput) (SendStatusOutput, error) {
	channel, err := h.integrationRepo.Find(ctx, input.ChannelID)
	if err != nil {
		return SendStatusOutput{}, err
	}
	if channel == nil {
		return SendStatusOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotFound, "channel not found")
	}
	if channel.Status != msgenums.ChannelStatusConnected {
		return SendStatusOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel is not connected")
	}

	ch, ok := h.pool.Get(channel.ID.UUID())
	if !ok {
		return SendStatusOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel not available")
	}

	content := gateway.SendStatusContent{
		Type: string(input.StatusType), Content: input.Content,
		Caption: input.Caption, BackgroundColor: input.BackgroundColor, Font: input.Font,
	}

	result, err := ch.SendMessage(ctx, gateway.SendMessageParams{
		To:          "status@broadcast",
		MessageType: msgenums.MessageTypeStatus,
		Content:     content,
	})
	if err != nil {
		if errorsStd.Is(err, whatsapp.ErrInvalidRemoteID) {
			return SendStatusOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeInvalidRemoteID, "invalid remote identifier", err)
		}
		return SendStatusOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeMessageSendFailed, "failed to send status message", err)
	}

	if result.Timestamp == 0 {
		result.Timestamp = time.Now().Unix()
	}

	return SendStatusOutput{
		MessageID: result.MessageID,
		Timestamp: result.Timestamp,
	}, nil
}
