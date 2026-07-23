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

type ContactInfo struct {
	FullName     string `json:"fullName"     validate:"required" example:"John Doe"`
	PhoneNumber  string `json:"phoneNumber"  validate:"required" example:"5511999999999"`
	Organization string `json:"organization" validate:"omitempty" example:"Acme Corp"`
	Email        string `json:"email"        validate:"omitempty,email" example:"john@example.com"`
}

type SendContactInput struct {
	ChannelID string        `validate:"required,uuid"`
	RemoteID  string        `validate:"required"`
	Contacts  []ContactInfo `validate:"required,dive"`
}

type SendContactOutput struct {
	MessageID string `json:"messageId" example:"3EB0B430A6B7FBEC1200"`
	Timestamp int64  `json:"timestamp" example:"1710000000"`
}

type SendContactHandler struct {
	integrationRepo channelrepo.ChannelRepository
	registry        registry.ChannelRegistry
}

func NewSendContactHandler(
	integrationRepo channelrepo.ChannelRepository,
	registry registry.ChannelRegistry,
) *SendContactHandler {
	return &SendContactHandler{
		integrationRepo: integrationRepo,
		registry:        registry,
	}
}

func (h *SendContactHandler) Name() string { return "send_contact" }

func (h *SendContactHandler) Execute(ctx context.Context, input SendContactInput) (SendContactOutput, error) {
	if len(input.Contacts) == 0 {
		return SendContactOutput{}, errors.NewBaseError(channelerrors.CodeEmptyContactList, "contacts list cannot be empty")
	}

	channel, err := h.integrationRepo.Find(ctx, input.ChannelID)
	if err != nil {
		return SendContactOutput{}, err
	}
	if channel == nil {
		return SendContactOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotFound, "channel not found")
	}
	if channel.Status != msgenums.ChannelStatusConnected {
		return SendContactOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel is not connected")
	}

	ch, ok := h.registry.Get(channel.ID.UUID())
	if !ok {
		return SendContactOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel not available")
	}

	contacts := make([]gateway.SendContactInfo, len(input.Contacts))
	for i, c := range input.Contacts {
		contacts[i] = gateway.SendContactInfo{
			FullName: c.FullName, PhoneNumber: c.PhoneNumber,
			Organization: c.Organization, Email: c.Email,
		}
	}
	content := gateway.SendContactContent{Contacts: contacts}

	result, err := ch.SendMessage(ctx, gateway.SendMessageParams{
		To:          input.RemoteID,
		MessageType: msgenums.MessageTypeContact,
		Content:     content,
	})
	if err != nil {
		if errorsStd.Is(err, whatsapp.ErrInvalidRemoteID) {
			return SendContactOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeInvalidRemoteID, "invalid remote identifier", err)
		}
		return SendContactOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeMessageSendFailed, "failed to send contact message", err)
	}

	if result.Timestamp == 0 {
		result.Timestamp = time.Now().Unix()
	}

	return SendContactOutput{
		MessageID: result.MessageID,
		Timestamp: result.Timestamp,
	}, nil
}
