// CONTEXT-ORIGIN: medscall/software/monorepo/packages/channel@ff66dbb1ee0fcd6212e5bf68879fa1d5a0a9cd1b (2026-07-20)
// Source path: packages/channel/internal/channel/handlers/message_received_handler.go
// Harvested verbatim for the handler skill exemplar set — do not edit; re-harvest instead.
package handlers

import (
	"context"
	"log/slog"

	ctxevents "monorepo/api/internal/channel/events"
	"monorepo/api/internal/channel/services/registry"
	sharedevents "monorepo/api/internal/shared/events"
	"monorepo/api/internal/shared/services/mediator"
	"monorepo/api/internal/shared/types"
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
