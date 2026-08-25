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

type SendFileInput struct {
	ChannelID string `validate:"required,uuid"`
	RemoteID  string `validate:"required"`
	MediaURL  string `validate:"required_without=MediaPath,excluded_with=MediaPath,omitempty,url"`
	MediaPath string `validate:"required_without=MediaURL,excluded_with=MediaURL"`
	FileName  string `validate:"omitempty,max=255"`
	MimeType  string `validate:"omitempty,max=127"`
}

type SendFileOutput struct {
	MessageID string `json:"messageId" example:"3EB0B430A6B7FBEC1200"`
	Timestamp int64  `json:"timestamp" example:"1710000000"`
}

type SendFileHandler struct {
	integrationRepo channelrepo.ChannelRepository
	pool            pool.ChannelPool
}

func NewSendFileHandler(
	integrationRepo channelrepo.ChannelRepository,
	pool pool.ChannelPool,
) *SendFileHandler {
	return &SendFileHandler{
		integrationRepo: integrationRepo,
		pool:            pool,
	}
}

func (h *SendFileHandler) Name() string { return "send_file" }

func (h *SendFileHandler) Execute(ctx context.Context, input SendFileInput) (SendFileOutput, error) {
	channel, err := h.integrationRepo.Find(ctx, input.ChannelID)
	if err != nil {
		return SendFileOutput{}, err
	}
	if channel == nil {
		return SendFileOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotFound, "channel not found")
	}
	if channel.Status != msgenums.ChannelStatusConnected {
		return SendFileOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel is not connected")
	}

	ch, ok := h.pool.Get(channel.ID.UUID())
	if !ok {
		return SendFileOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel not available")
	}

	sendContent := gateway.SendDocumentContent{MediaURL: input.MediaURL, MediaPath: input.MediaPath, FileName: input.FileName, Mimetype: input.MimeType}

	result, err := ch.SendMessage(ctx, gateway.SendMessageParams{
		To:          input.RemoteID,
		MessageType: msgenums.MessageTypeDocument,
		Content:     sendContent,
	})
	if err != nil {
		if errorsStd.Is(err, whatsapp.ErrInvalidRemoteID) {
			return SendFileOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeInvalidRemoteID, "invalid remote identifier", err)
		}
		if errorsStd.Is(err, whatsapp.ErrMediaPathNotAllowed) {
			return SendFileOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeMediaPathNotAllowed, "media path not allowed", err)
		}
		return SendFileOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeMessageSendFailed, "failed to send file message", err)
	}

	if result.Timestamp == 0 {
		result.Timestamp = time.Now().Unix()
	}

	return SendFileOutput{
		MessageID: result.MessageID,
		Timestamp: result.Timestamp,
	}, nil
}
