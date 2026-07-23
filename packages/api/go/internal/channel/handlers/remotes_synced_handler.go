package handlers

import (
	"context"
	"log/slog"

	ctxevents "template/api-go/internal/channel/events"
	sharedevents "template/api-go/internal/shared/events"
	"template/api-go/internal/shared/services/mediator"
	"template/api-go/internal/shared/types"
)

// RemotesSyncedIntegrationHandler republishes channel.remotes_synced as an
// integration event so cross-service consumers (TS backend via Kafka, frontend
// via SSE) can invalidate remote projections after a bulk contact sync pass.
type RemotesSyncedIntegrationHandler struct {
	externalMediator mediator.ExternalMediator
}

func NewRemotesSyncedIntegrationHandler(ext mediator.ExternalMediator) *RemotesSyncedIntegrationHandler {
	return &RemotesSyncedIntegrationHandler{externalMediator: ext}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*RemotesSyncedIntegrationHandler)(nil)

func (h *RemotesSyncedIntegrationHandler) EventName() string {
	return ctxevents.RemotesSyncedEventName
}

func (h *RemotesSyncedIntegrationHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelRemotesSyncedPayload](event)
	if err != nil {
		return err
	}
	integrationEvent := sharedevents.NewChannelRemotesSyncedEvent(e.OwnerID, e.Payload)
	if err := h.externalMediator.Publish(ctx, integrationEvent); err != nil {
		slog.Error("failed to publish remotes_synced integration event",
			"error", err,
			"channelId", e.Payload.ChannelID,
			"total", e.Payload.Total,
		)
		return err
	}
	return nil
}
