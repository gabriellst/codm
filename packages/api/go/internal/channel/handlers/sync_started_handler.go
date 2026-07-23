package handlers

import (
	"context"
	"log/slog"

	ctxevents "template/api-go/internal/channel/events"
	sharedevents "template/api-go/internal/shared/events"
	"template/core-go/services/mediator"
	"template/core-go/types"
)

// SyncStartedIntegrationHandler republishes channel.sync_started as an
// integration event so cross-service consumers (TS backend via Kafka, frontend
// via SSE) can react to sync lifecycle changes.
type SyncStartedIntegrationHandler struct {
	externalMediator mediator.ExternalMediator
}

func NewSyncStartedIntegrationHandler(ext mediator.ExternalMediator) *SyncStartedIntegrationHandler {
	return &SyncStartedIntegrationHandler{externalMediator: ext}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*SyncStartedIntegrationHandler)(nil)

func (h *SyncStartedIntegrationHandler) EventName() string {
	return ctxevents.SyncStartedEventName
}

func (h *SyncStartedIntegrationHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelSyncStartedPayload](event)
	if err != nil {
		return err
	}
	integration := sharedevents.NewChannelSyncStartedEvent(e.OwnerID, e.Payload)
	if err := h.externalMediator.Publish(ctx, integration); err != nil {
		slog.Error("failed to publish sync_started integration event",
			"channelId", e.Payload.ChannelID, "error", err)
		return err
	}
	return nil
}
