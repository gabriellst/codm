package handlers

import (
	"context"
	"log/slog"

	ctxevents "template/api-go/internal/channel/events"
	"template/api-go/internal/channel/services/registry"
	sharedevents "template/api-go/internal/shared/events"
	"template/core-go/services/mediator"
	"template/core-go/types"
)

// MessageReceivedHandler republishes channel.message_received as an
// integration event so the TS backend picks it up via Kafka.
type MessageReceivedHandler struct {
	externalMediator mediator.ExternalMediator
	registry         registry.ChannelRegistry
}

func NewMessageReceivedHandler(ext mediator.ExternalMediator, reg registry.ChannelRegistry) *MessageReceivedHandler {
	return &MessageReceivedHandler{externalMediator: ext, registry: reg}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*MessageReceivedHandler)(nil)

func (h *MessageReceivedHandler) EventName() string {
	return ctxevents.MessageReceivedEventName
}

func (h *MessageReceivedHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelMessageReceivedPayload](event)
	if err != nil {
		return err
	}

	payload := e.Payload
	if ch, ok := h.registry.Get(payload.ChannelID); ok {
		payload.IsGroup = ch.IsGroupJID(payload.RemoteID)
	} else {
		slog.Warn("message_received: channel not in registry, IsGroup may be inaccurate",
			"channelId", payload.ChannelID,
		)
	}

	integrationEvent := sharedevents.NewChannelMessageReceivedEvent(e.OwnerID, payload)
	if err := h.externalMediator.Publish(ctx, integrationEvent); err != nil {
		slog.Error("failed to publish message received integration event",
			"error", err,
			"channelId", payload.ChannelID,
			"messageId", payload.MessageID,
		)
		return err
	}

	return nil
}
