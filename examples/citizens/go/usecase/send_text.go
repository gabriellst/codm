// CONTEXT-ORIGIN: medscall/software/monorepo/packages/channel@ff66dbb1ee0fcd6212e5bf68879fa1d5a0a9cd1b (2026-07-20)
// Source path: packages/channel/internal/channel/usecases/send_text.go
// Harvested verbatim for the usecase skill exemplar set — do not edit; re-harvest instead.
package usecases

import (
	"context"
	errorsStd "errors"
	msgenums "monorepo/api/internal/channel/enums"
	channelerrors "monorepo/api/internal/channel/errors"
	channelrepo "monorepo/api/internal/channel/repositories/channel"
	"monorepo/api/internal/channel/services/gateway"
	"monorepo/api/internal/channel/services/gateway/whatsapp"
	"monorepo/api/internal/channel/services/registry"
	"monorepo/api/internal/shared/errors"
	"time"
)

type SendTextInput struct {
	ChannelID       string `validate:"required,uuid"`
	RemoteID        string `validate:"required"`
	Text            string `validate:"required,min=1"`
	QuotedMessageID string `validate:"omitempty"`
}

type SendTextOutput struct {
	MessageID string `json:"messageId" example:"3EB0B430A6B7FBEC1200"`
	Timestamp int64  `json:"timestamp" example:"1710000000"`
}

type SendTextHandler struct {
	integrationRepo channelrepo.ChannelRepository
	registry        registry.ChannelRegistry
}

func NewSendTextHandler(
	integrationRepo channelrepo.ChannelRepository,
	registry registry.ChannelRegistry,
) *SendTextHandler {
	return &SendTextHandler{
		integrationRepo: integrationRepo,
		registry:        registry,
	}
}

func (h *SendTextHandler) Name() string { return "SendText" }

func (h *SendTextHandler) Execute(ctx context.Context, input SendTextInput) (SendTextOutput, error) {
	instance, err := h.integrationRepo.Find(ctx, input.ChannelID)
	if err != nil {
		return SendTextOutput{}, err
	}
	if instance == nil {
		return SendTextOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotFound, "instance not found")
	}
	if instance.Status != msgenums.ChannelStatusConnected {
		return SendTextOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "instance is not connected")
	}

	ch, ok := h.registry.Get(instance.ID.UUID())
	if !ok {
		return SendTextOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "instance channel not available")
	}

	content := gateway.SendTextContent{Text: input.Text, QuotedMessageID: input.QuotedMessageID}

	result, err := ch.SendMessage(ctx, gateway.SendMessageParams{
		To:          input.RemoteID,
		MessageType: msgenums.MessageTypeText,
		Content:     content,
	})
	if err != nil {
		if errorsStd.Is(err, whatsapp.ErrInvalidRemoteID) {
			return SendTextOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeInvalidRemoteID, "invalid remote identifier", err)
		}
		return SendTextOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeMessageSendFailed, "failed to send text message", err)
	}

	if result.Timestamp == 0 {
		result.Timestamp = time.Now().Unix()
	}

	return SendTextOutput{
		MessageID: result.MessageID,
		Timestamp: result.Timestamp,
	}, nil
}
