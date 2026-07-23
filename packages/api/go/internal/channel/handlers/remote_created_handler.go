package handlers

import (
	"context"
	"log/slog"

	ctxevents "template/api-go/internal/channel/events"
	sharedevents "template/api-go/internal/shared/events"
	"template/api-go/internal/shared/services/mediator"
	"template/core-go/types"
)

// RemoteCreatedIntegrationHandler republishes channel.remote_created as an
// integration event so cross-service consumers (TS backend via Kafka, frontend
// via SSE) can react when a new remote is added to a channel.
type RemoteCreatedIntegrationHandler struct {
	externalMediator mediator.ExternalMediator
}

func NewRemoteCreatedIntegrationHandler(ext mediator.ExternalMediator) *RemoteCreatedIntegrationHandler {
	return &RemoteCreatedIntegrationHandler{externalMediator: ext}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*RemoteCreatedIntegrationHandler)(nil)

func (h *RemoteCreatedIntegrationHandler) EventName() string {
	return ctxevents.RemoteCreatedEventName
}

func (h *RemoteCreatedIntegrationHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelRemoteCreatedPayload](event)
	if err != nil {
		return err
	}
	integrationEvent := sharedevents.NewChannelRemoteCreatedEvent(e.OwnerID, e.Payload)
	if err := h.externalMediator.Publish(ctx, integrationEvent); err != nil {
		slog.Error("failed to publish remote_created integration event",
			"error", err,
			"channelId", e.Payload.ChannelID,
			"remoteId", e.Payload.RemoteID,
		)
		return err
	}
	return nil
}
