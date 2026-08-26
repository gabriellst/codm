package handlers

import (
	"context"
	"log/slog"

	ctxevents "template/api-go/internal/channel/events"
	"template/api-go/internal/channel/services/pool"
	"template/contracts-go/wire"
	"template/core-go/services/mediator"
	"template/core-go/types"
)

// MessageReceivedHandler republishes channel.message_received as an
// integration event so the TS backend picks it up via Kafka.
type MessageReceivedHandler struct {
	externalMediator mediator.ExternalMediator
	pool             pool.ChannelPool
}

func NewMessageReceivedHandler(ext mediator.ExternalMediator, pool pool.ChannelPool) *MessageReceivedHandler {
	return &MessageReceivedHandler{externalMediator: ext, pool: pool}
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
	if ch, ok := h.pool.Get(payload.ChannelID); ok {
		payload.IsGroup = ch.IsGroupJID(payload.RemoteID)
	} else {
		slog.Warn("message_received: channel not in pool, IsGroup may be inaccurate",
			"channelId", payload.ChannelID,
		)
	}

	integrationEvent := types.NewIntegrationEvent(wire.ChannelMessageReceivedEventName, e.OwnerID, payload)
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
