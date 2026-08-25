package handlers

import (
	"context"
	"log/slog"
	ctxevents "template/api-go/internal/channel/events"
	"template/core-go/services/mediator"
	"template/core-go/types"
)

type ChannelDeletedHandler struct{}

func NewChannelDeletedHandler() *ChannelDeletedHandler {
	return &ChannelDeletedHandler{}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*ChannelDeletedHandler)(nil)

func (h *ChannelDeletedHandler) EventName() string {
	return ctxevents.ChannelDeletedEventName
}

func (h *ChannelDeletedHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelDeletedPayload](event)
	if err != nil {
		return err
	}

	slog.Info("instance deleted",
		"event", e.Name,
		"instanceId", e.Payload.ChannelID,
	)

	return nil
}
