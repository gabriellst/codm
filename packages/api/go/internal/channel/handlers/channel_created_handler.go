package handlers

import (
	"context"
	"log/slog"
	ctxevents "template/api-go/internal/channel/events"
	"template/api-go/internal/shared/services/mediator"
	"template/core-go/types"
)

type ChannelCreatedHandler struct{}

func NewChannelCreatedHandler() *ChannelCreatedHandler {
	return &ChannelCreatedHandler{}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*ChannelCreatedHandler)(nil)

func (h *ChannelCreatedHandler) EventName() string {
	return ctxevents.ChannelCreatedEventName
}

func (h *ChannelCreatedHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelCreatedPayload](event)
	if err != nil {
		return err
	}

	slog.Info("instance created",
		"event", e.Name,
		"instanceId", e.Payload.ChannelID,
		"name", e.Payload.Name,
		"platform", e.Payload.Platform,
	)

	return nil
}
