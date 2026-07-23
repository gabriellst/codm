package handlers

import (
	"context"
	"log/slog"

	ctxevents "template/api-go/internal/channel/events"
	sharedevents "template/api-go/internal/shared/events"
	"template/api-go/internal/shared/services/mediator"
	"template/api-go/internal/shared/types"
)

type GatewayPlatformEventHandler struct{ ext mediator.ExternalMediator }

func NewGatewayPlatformEventHandler(ext mediator.ExternalMediator) *GatewayPlatformEventHandler {
	return &GatewayPlatformEventHandler{ext: ext}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*GatewayPlatformEventHandler)(nil)

func (h *GatewayPlatformEventHandler) EventName() string {
	return ctxevents.GatewayPlatformEventName
}

func (h *GatewayPlatformEventHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelSpecialPlatformEventPayload](event)
	if err != nil {
		return err
	}
	integrationEvent := sharedevents.NewChannelSpecialPlatformEvent(e.OwnerID, e.Payload)
	if err := h.ext.Publish(ctx, integrationEvent); err != nil {
		slog.Error("failed to publish platform event integration event", "eventType", e.Payload.EventType, "error", err)
		return err
	}
	return nil
}
