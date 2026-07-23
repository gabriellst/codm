package handlers

import (
	"context"
	"log/slog"

	ctxevents "template/api-go/internal/channel/events"
	sharedevents "template/api-go/internal/shared/events"
	"template/api-go/internal/shared/services/mediator"
	"template/api-go/internal/shared/types"
)

// MessageDeliveredHandler republishes channel.message_delivered as an
// integration event (Kafka) so downstream services can react.
type MessageDeliveredHandler struct {
	externalMediator mediator.ExternalMediator
}

func NewMessageDeliveredHandler(ext mediator.ExternalMediator) *MessageDeliveredHandler {
	return &MessageDeliveredHandler{externalMediator: ext}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*MessageDeliveredHandler)(nil)

func (h *MessageDeliveredHandler) EventName() string {
	return ctxevents.MessageDeliveredEventName
}

func (h *MessageDeliveredHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelMessageDeliveredPayload](event)
	if err != nil {
		return err
	}

	integrationEvent := sharedevents.NewChannelMessageDeliveredEvent(e.OwnerID, e.Payload)
	if err := h.externalMediator.Publish(ctx, integrationEvent); err != nil {
		slog.Error("failed to publish message delivered integration event", "error", err)
		return err
	}
	return nil
}
