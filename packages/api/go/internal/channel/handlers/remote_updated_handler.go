package handlers

import (
	"context"
	"log/slog"

	ctxevents "template/api-go/internal/channel/events"
	"template/core-go/services/mediator"
	"template/core-go/types"
)

// RemoteUpdatedHandler fans out the observation event to integration consumers
// so they can update their local read models with the latest user/broadcast
// profile snapshot without re-scanning the platform contact store.
type RemoteUpdatedHandler struct {
	externalMediator mediator.ExternalMediator
}

func NewRemoteUpdatedHandler(ext mediator.ExternalMediator) *RemoteUpdatedHandler {
	return &RemoteUpdatedHandler{externalMediator: ext}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*RemoteUpdatedHandler)(nil)

func (h *RemoteUpdatedHandler) EventName() string {
	return ctxevents.RemoteUpdatedEventName
}

func (h *RemoteUpdatedHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelRemoteUpdatedPayload](event)
	if err != nil {
		return err
	}

	integrationEvent := ctxevents.NewChannelRemoteUpdatedEvent(e.OwnerID, e.Payload)
	if err := h.externalMediator.Publish(ctx, integrationEvent); err != nil {
		slog.Error("failed to publish remote updated integration event",
			"error", err,
			"channelId", e.Payload.ChannelID,
			"remoteId", e.Payload.RemoteID,
		)
		return err
	}
	return nil
}
