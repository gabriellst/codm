package handlers

import (
	"context"
	"log/slog"

	ctxevents "template/api-go/internal/channel/events"
	sharedevents "template/api-go/internal/shared/events"
	"template/core-go/services/mediator"
	"template/core-go/types"
)

// MessageSeenHandler republishes channel.message_seen as an integration
// event (Kafka) so downstream services can react.
type MessageSeenHandler struct {
	externalMediator mediator.ExternalMediator
}

func NewMessageSeenHandler(ext mediator.ExternalMediator) *MessageSeenHandler {
	return &MessageSeenHandler{externalMediator: ext}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*MessageSeenHandler)(nil)

func (h *MessageSeenHandler) EventName() string {
	return ctxevents.MessageSeenEventName
}

func (h *MessageSeenHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelMessageSeenPayload](event)
	if err != nil {
		return err
	}

	integrationEvent := sharedevents.NewChannelMessageSeenEvent(e.OwnerID, e.Payload)
	if err := h.externalMediator.Publish(ctx, integrationEvent); err != nil {
		slog.Error("failed to publish message seen integration event", "error", err)
		return err
	}
	return nil
}
