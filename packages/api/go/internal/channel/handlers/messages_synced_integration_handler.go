package handlers

import (
	"context"
	"log/slog"

	ctxevents "template/api-go/internal/channel/events"
	sharedevents "template/api-go/internal/shared/events"
	"template/api-go/internal/shared/services/mediator"
	"template/api-go/internal/shared/types"
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

func (h *MessagesSyncedIntegrationHandler) EventName() string {
	return ctxevents.MessagesSyncedEventName
}

func (h *MessagesSyncedIntegrationHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelMessagesSyncedPayload](event)
	if err != nil {
		return err
	}
	integrationEvent := sharedevents.NewChannelMessagesSyncedEvent(e.OwnerID, e.Payload)
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
