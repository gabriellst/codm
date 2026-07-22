package usecases

import (
	"context"
	"time"

	"github.com/google/uuid"

	chanevents "template/api-go/internal/channel/events"
	"template/api-go/internal/channel/services/registry"
	"template/contracts-go/wire"
	"template/core-go/errors"
	"template/core-go/repositories"
)

// SendMessageInput is an operator-initiated direct send (senderIdentity OPERATOR).
// Agent replies arrive over the wire as integration.channel.delivery_requested
// and are handled by DeliveryRequestedHandler, not here.
type SendMessageInput struct {
	ChannelID string
	To        string
	Text      string
}

type SendMessageOutput struct {
	MessageID string `json:"messageId"`
}

type SendMessageHandler struct {
	registry        registry.ChannelRegistry
	domainEventRepo repositories.DomainEventRepository
}

func NewSendMessageHandler(
	reg registry.ChannelRegistry,
	repo repositories.DomainEventRepository,
) *SendMessageHandler {
	return &SendMessageHandler{registry: reg, domainEventRepo: repo}
}

func (h *SendMessageHandler) Name() string { return "SendMessage" }

func (h *SendMessageHandler) Execute(ctx context.Context, input SendMessageInput) (SendMessageOutput, error) {
	channelID, err := uuid.Parse(input.ChannelID)
	if err != nil {
		return SendMessageOutput{}, errors.NewBaseError(errors.CodeBadRequest, "invalid channelId")
	}

	ch, ok := h.registry.Get(channelID)
	if !ok {
		return SendMessageOutput{}, errors.NewBaseError(errors.CodeNotFound, "channel not connected")
	}

	res, err := ch.SendText(ctx, input.To, input.Text)
	if err != nil {
		return SendMessageOutput{}, errors.NewBaseError(errors.CodeExternalService, err.Error())
	}

	delivered := chanevents.NewOutboundDeliveredEvent(channelID, OperatorID, chanevents.OutboundDeliveredPayload{
		ChannelID:      channelID,
		ContactID:      input.To,
		IsGroup:        ch.IsGroupJID(input.To),
		SenderIdentity: wire.SenderIdentityOPERATOR,
		DeliveredAt:    time.Now().UTC(),
		OwnerID:        OperatorID,
	})
	_ = h.domainEventRepo.Save(ctx, delivered)

	return SendMessageOutput{MessageID: res.MessageID}, nil
}
