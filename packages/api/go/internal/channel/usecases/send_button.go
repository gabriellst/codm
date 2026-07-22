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

type ButtonItem struct {
	ButtonID    string `json:"buttonId"    validate:"required" example:"btn-1"`
	DisplayText string `json:"displayText" validate:"required" example:"Yes"`
}

type SendButtonInput struct {
	ChannelID   string       `validate:"required,uuid"`
	RemoteID    string       `validate:"required"`
	Title       string       `validate:"required,max=255"`
	Description string       `validate:"required,max=1024"`
	Footer      string       `validate:"omitempty,max=60"`
	Buttons     []ButtonItem `validate:"required,max=3,dive"`
}

type SendButtonOutput struct {
	MessageID string `json:"messageId" example:"3EB0B430A6B7FBEC1200"`
	Timestamp int64  `json:"timestamp" example:"1710000000"`
}

type SendButtonHandler struct {
	integrationRepo channelrepo.ChannelRepository
	registry        registry.ChannelRegistry
}

func NewSendButtonHandler(
	integrationRepo channelrepo.ChannelRepository,
	registry registry.ChannelRegistry,
) *SendButtonHandler {
	return &SendButtonHandler{
		integrationRepo: integrationRepo,
		registry:        registry,
	}
}

func (h *SendButtonHandler) Name() string { return "SendButton" }

func (h *SendButtonHandler) Execute(ctx context.Context, input SendButtonInput) (SendButtonOutput, error) {
	if len(input.Buttons) > 3 {
		return SendButtonOutput{}, errors.NewBaseError(channelerrors.CodeTooManyButtons, "buttons cannot exceed 3 items")
	}

	instance, err := h.integrationRepo.Find(ctx, input.ChannelID)
	if err != nil {
		return SendButtonOutput{}, err
	}
	if instance == nil {
		return SendButtonOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotFound, "instance not found")
	}
	if instance.Status != msgenums.ChannelStatusConnected {
		return SendButtonOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "instance is not connected")
	}

	ch, ok := h.registry.Get(instance.ID.UUID())
	if !ok {
		return SendButtonOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "instance channel not available")
	}

	buttons := make([]gateway.SendButtonItem, len(input.Buttons))
	for i, b := range input.Buttons {
		buttons[i] = gateway.SendButtonItem{ButtonID: b.ButtonID, DisplayText: b.DisplayText}
	}
	content := gateway.SendButtonContent{
		Title: input.Title, Description: input.Description,
		Footer: input.Footer, Buttons: buttons,
	}

	result, err := ch.SendMessage(ctx, gateway.SendMessageParams{
		To:          input.RemoteID,
		MessageType: msgenums.MessageTypeButton,
		Content:     content,
	})
	if err != nil {
		if errorsStd.Is(err, whatsapp.ErrInvalidRemoteID) {
			return SendButtonOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeInvalidRemoteID, "invalid remote identifier", err)
		}
		return SendButtonOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeMessageSendFailed, "failed to send button message", err)
	}

	if result.Timestamp == 0 {
		result.Timestamp = time.Now().Unix()
	}

	return SendButtonOutput{
		MessageID: result.MessageID,
		Timestamp: result.Timestamp,
	}, nil
}
