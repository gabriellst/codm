package handlers

import (
	"context"
	"log/slog"

	ctxevents "template/api-go/internal/channel/events"
	sharedevents "template/api-go/internal/shared/events"
	"template/api-go/internal/shared/services/mediator"
	"template/core-go/types"
)

type PresenceUpdatedIntegrationHandler struct {
	ext mediator.ExternalMediator
}

func NewPresenceUpdatedIntegrationHandler(ext mediator.ExternalMediator) *PresenceUpdatedIntegrationHandler {
	return &PresenceUpdatedIntegrationHandler{ext: ext}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*PresenceUpdatedIntegrationHandler)(nil)

func (h *PresenceUpdatedIntegrationHandler) EventName() string {
	return ctxevents.PresenceUpdatedEventName
}

func (h *PresenceUpdatedIntegrationHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelPresenceUpdatedPayload](event)
	if err != nil {
		return err
	}
	if err := h.ext.Publish(ctx, sharedevents.NewChannelPresenceUpdatedEvent(e.OwnerID, e.Payload)); err != nil {
		slog.Error("failed to publish presence_updated integration event",
			"channelId", e.Payload.ChannelID, "remoteId", e.Payload.RemoteID, "error", err)
		return err
	}
	return nil
}
