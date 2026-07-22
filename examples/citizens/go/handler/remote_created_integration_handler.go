// CONTEXT-ORIGIN: medscall/software/monorepo/packages/channel@ff66dbb1ee0fcd6212e5bf68879fa1d5a0a9cd1b (2026-07-20)
// Source path: packages/channel/internal/channel/handlers/remote_created_integration_handler.go
// Harvested verbatim for the handler skill exemplar set — do not edit; re-harvest instead.
package handlers

import (
	"context"
	"log/slog"

	ctxevents "monorepo/api/internal/channel/events"
	sharedevents "monorepo/api/internal/shared/events"
	"monorepo/api/internal/shared/services/mediator"
	"monorepo/api/internal/shared/types"
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
