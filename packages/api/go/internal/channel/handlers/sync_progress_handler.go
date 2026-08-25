package handlers

import (
	"context"
	"log/slog"

	ctxevents "template/api-go/internal/channel/events"
	"template/contracts-go/wire"
	"template/core-go/services/mediator"
	"template/core-go/types"
)

// SyncProgressIntegrationHandler republishes channel.sync_progress as an
// integration event so cross-service consumers can track incremental sync progress.
type SyncProgressIntegrationHandler struct {
	externalMediator mediator.ExternalMediator
}

func NewSyncProgressIntegrationHandler(ext mediator.ExternalMediator) *SyncProgressIntegrationHandler {
	return &SyncProgressIntegrationHandler{externalMediator: ext}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*SyncProgressIntegrationHandler)(nil)

func (h *SyncProgressIntegrationHandler) EventName() string {
	return ctxevents.SyncProgressEventName
}

func (h *SyncProgressIntegrationHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelSyncProgressPayload](event)
	if err != nil {
		return err
	}
	integration := types.NewIntegrationEvent(wire.ChannelSyncProgressEventName, e.OwnerID, e.Payload)
	if err := h.externalMediator.Publish(ctx, integration); err != nil {
		slog.Error("failed to publish sync_progress integration event",
			"channelId", e.Payload.ChannelID, "error", err)
		return err
	}
	return nil
}
