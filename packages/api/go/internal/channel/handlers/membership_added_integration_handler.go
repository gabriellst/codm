package handlers

import (
	"context"
	"log/slog"

	ctxevents "template/api-go/internal/channel/events"
	sharedevents "template/api-go/internal/shared/events"
	"template/api-go/internal/shared/services/mediator"
	"template/api-go/internal/shared/types"
)

// MembershipAddedIntegrationHandler republishes channel.membership_added as an
// integration event so cross-service consumers (TS backend via Kafka, frontend
// via SSE) can react when a participant joins a group.
type MembershipAddedIntegrationHandler struct {
	externalMediator mediator.ExternalMediator
}

func NewMembershipAddedIntegrationHandler(ext mediator.ExternalMediator) *MembershipAddedIntegrationHandler {
	return &MembershipAddedIntegrationHandler{externalMediator: ext}
}

func (h *MembershipAddedIntegrationHandler) EventName() string {
	return ctxevents.MembershipAddedEventName
}

func (h *MembershipAddedIntegrationHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelMembershipAddedPayload](event)
	if err != nil {
		return err
	}
	integrationEvent := sharedevents.NewChannelMembershipAddedEvent(e.OwnerID, e.Payload)
	if err := h.externalMediator.Publish(ctx, integrationEvent); err != nil {
		slog.Error("failed to publish membership_added integration event",
			"error", err,
			"channelId", e.Payload.ChannelID,
			"groupId", e.Payload.GroupID,
			"memberId", e.Payload.MemberID,
		)
		return err
	}
	return nil
}
