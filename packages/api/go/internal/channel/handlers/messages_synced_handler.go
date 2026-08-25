package handlers

import (
	"context"
	"log/slog"

	ctxevents "template/api-go/internal/channel/events"
	"template/contracts-go/wire"
	"template/core-go/services/mediator"
	"template/core-go/types"
)

// MessagesSyncedIntegrationHandler republishes channel.messages_synced as an
// integration event so cross-service consumers (TS backend via Kafka, frontend
// via SSE) can invalidate message projections after a HistorySync batch.
type MessagesSyncedIntegrationHandler struct {
	externalMediator mediator.ExternalMediator
}

func NewMessagesSyncedIntegrationHandler(ext mediator.ExternalMediator) *MessagesSyncedIntegrationHandler {
	return &MessagesSyncedIntegrationHandler{externalMediator: ext}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*MessagesSyncedIntegrationHandler)(nil)

func (h *MessagesSyncedIntegrationHandler) EventName() string {
	return ctxevents.MessagesSyncedEventName
}

func (h *MessagesSyncedIntegrationHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelMessagesSyncedPayload](event)
	if err != nil {
		return err
	}
	integrationEvent := types.NewIntegrationEvent(wire.ChannelMessagesSyncedEventName, e.OwnerID, e.Payload)
	if err := h.externalMediator.Publish(ctx, integrationEvent); err != nil {
		slog.Error("failed to publish messages_synced integration event",
			"error", err,
			"channelId", e.Payload.ChannelID,
			"total", e.Payload.Total,
		)
		return err
	}
	return nil
}
