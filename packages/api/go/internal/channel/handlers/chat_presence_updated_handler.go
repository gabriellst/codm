package handlers

import (
	"context"
	"log/slog"

	ctxevents "template/api-go/internal/channel/events"
	sharedevents "template/api-go/internal/shared/events"
	"template/api-go/internal/shared/services/mediator"
	"template/core-go/types"
)

type ChatPresenceUpdatedIntegrationHandler struct {
	ext mediator.ExternalMediator
}

func NewChatPresenceUpdatedIntegrationHandler(ext mediator.ExternalMediator) *ChatPresenceUpdatedIntegrationHandler {
	return &ChatPresenceUpdatedIntegrationHandler{ext: ext}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*ChatPresenceUpdatedIntegrationHandler)(nil)

func (h *ChatPresenceUpdatedIntegrationHandler) EventName() string {
	return ctxevents.ChatPresenceUpdatedEventName
}

func (h *ChatPresenceUpdatedIntegrationHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelChatPresenceUpdatedPayload](event)
	if err != nil {
		return err
	}
	if err := h.ext.Publish(ctx, sharedevents.NewChannelChatPresenceUpdatedEvent(e.OwnerID, e.Payload)); err != nil {
		slog.Error("failed to publish chat_presence_updated integration event",
			"channelId", e.Payload.ChannelID, "chatId", e.Payload.ChatID, "error", err)
		return err
	}
	return nil
}
