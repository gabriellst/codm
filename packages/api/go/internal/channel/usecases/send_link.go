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

type SendLinkInput struct {
	ChannelID    string `validate:"required,uuid"`
	RemoteID     string `validate:"required"`
	URL          string `validate:"required,url"`
	Title        string `validate:"omitempty,max=255"`
	Description  string `validate:"omitempty,max=1024"`
	ThumbnailURL string `validate:"omitempty,url"`
}

type SendLinkOutput struct {
	MessageID string `json:"messageId" example:"3EB0B430A6B7FBEC1200"`
	Timestamp int64  `json:"timestamp" example:"1710000000"`
}

type SendLinkHandler struct {
	integrationRepo channelrepo.ChannelRepository
	registry        registry.ChannelRegistry
}

func NewSendLinkHandler(
	integrationRepo channelrepo.ChannelRepository,
	registry registry.ChannelRegistry,
) *SendLinkHandler {
	return &SendLinkHandler{
		integrationRepo: integrationRepo,
		registry:        registry,
	}
}

func (h *SendLinkHandler) Name() string { return "send_link" }

func (h *SendLinkHandler) Execute(ctx context.Context, input SendLinkInput) (SendLinkOutput, error) {
	channel, err := h.integrationRepo.Find(ctx, input.ChannelID)
	if err != nil {
		return SendLinkOutput{}, err
	}
	if channel == nil {
		return SendLinkOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotFound, "channel not found")
	}
	if channel.Status != msgenums.ChannelStatusConnected {
		return SendLinkOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel is not connected")
	}

	ch, ok := h.registry.Get(channel.ID.UUID())
	if !ok {
		return SendLinkOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel not available")
	}

	content := gateway.SendTextContent{
		Text: input.URL, LinkPreview: true,
		Title: input.Title, Description: input.Description, ThumbnailURL: input.ThumbnailURL,
	}

	result, err := ch.SendMessage(ctx, gateway.SendMessageParams{
		To:          input.RemoteID,
		MessageType: msgenums.MessageTypeText,
		Content:     content,
	})
	if err != nil {
		if errorsStd.Is(err, whatsapp.ErrInvalidRemoteID) {
			return SendLinkOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeInvalidRemoteID, "invalid remote identifier", err)
		}
		return SendLinkOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeMessageSendFailed, "failed to send link message", err)
	}

	if result.Timestamp == 0 {
		result.Timestamp = time.Now().Unix()
	}

	return SendLinkOutput{
		MessageID: result.MessageID,
		Timestamp: result.Timestamp,
	}, nil
}
