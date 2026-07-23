package handlers

import (
	"context"
	"log/slog"

	ctxevents "template/api-go/internal/channel/events"
	sharedevents "template/api-go/internal/shared/events"
	"template/api-go/internal/shared/services/mediator"
	"template/api-go/internal/shared/types"
)

// RemoteDeletedIntegrationHandler republishes channel.remote_deleted as an
// integration event so cross-service consumers (TS backend via Kafka, frontend
// via SSE) can react when a remote is soft-deleted from a channel.
type RemoteDeletedIntegrationHandler struct {
	externalMediator mediator.ExternalMediator
}

func NewRemoteDeletedIntegrationHandler(ext mediator.ExternalMediator) *RemoteDeletedIntegrationHandler {
	return &RemoteDeletedIntegrationHandler{externalMediator: ext}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*RemoteDeletedIntegrationHandler)(nil)

func (h *RemoteDeletedIntegrationHandler) EventName() string {
	return ctxevents.RemoteDeletedEventName
}

func (h *RemoteDeletedIntegrationHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelRemoteDeletedPayload](event)
	if err != nil {
		return err
	}
	integrationEvent := sharedevents.NewChannelRemoteDeletedEvent(e.OwnerID, e.Payload)
	if err := h.externalMediator.Publish(ctx, integrationEvent); err != nil {
		slog.Error("failed to publish remote_deleted integration event",
			"error", err,
			"channelId", e.Payload.ChannelID,
			"remoteId", e.Payload.RemoteID,
		)
		return err
	}
	return nil
}
