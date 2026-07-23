package handlers

import (
	"context"
	"log/slog"

	ctxevents "template/api-go/internal/channel/events"
	sharedevents "template/api-go/internal/shared/events"
	"template/core-go/services/mediator"
	"template/core-go/types"
)

// SyncCompletedIntegrationHandler republishes channel.sync_completed as an
// integration event so cross-service consumers know when history sync has finished.
type SyncCompletedIntegrationHandler struct {
	externalMediator mediator.ExternalMediator
}

func NewSyncCompletedIntegrationHandler(ext mediator.ExternalMediator) *SyncCompletedIntegrationHandler {
	return &SyncCompletedIntegrationHandler{externalMediator: ext}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*SyncCompletedIntegrationHandler)(nil)

func (h *SyncCompletedIntegrationHandler) EventName() string {
	return ctxevents.SyncCompletedEventName
}

func (h *SyncCompletedIntegrationHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelSyncCompletedPayload](event)
	if err != nil {
		return err
	}
	integration := sharedevents.NewChannelSyncCompletedEvent(e.OwnerID, e.Payload)
	if err := h.externalMediator.Publish(ctx, integration); err != nil {
		slog.Error("failed to publish sync_completed integration event",
			"channelId", e.Payload.ChannelID, "error", err)
		return err
	}
	return nil
}
