package handlers

import (
	"context"
	"log/slog"

	ctxevents "template/api-go/internal/channel/events"
	sharedevents "template/api-go/internal/shared/events"
	"template/core-go/services/mediator"
	"template/core-go/types"
)

// MembershipRemovedIntegrationHandler republishes channel.membership_removed as
// an integration event so cross-service consumers (TS backend via Kafka, frontend
// via SSE) can react when a participant leaves a group.
type MembershipRemovedIntegrationHandler struct {
	externalMediator mediator.ExternalMediator
}

func NewMembershipRemovedIntegrationHandler(ext mediator.ExternalMediator) *MembershipRemovedIntegrationHandler {
	return &MembershipRemovedIntegrationHandler{externalMediator: ext}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*MembershipRemovedIntegrationHandler)(nil)

func (h *MembershipRemovedIntegrationHandler) EventName() string {
	return ctxevents.MembershipRemovedEventName
}

func (h *MembershipRemovedIntegrationHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelMembershipRemovedPayload](event)
	if err != nil {
		return err
	}
	integrationEvent := sharedevents.NewChannelMembershipRemovedEvent(e.OwnerID, e.Payload)
	if err := h.externalMediator.Publish(ctx, integrationEvent); err != nil {
		slog.Error("failed to publish membership_removed integration event",
			"error", err,
			"channelId", e.Payload.ChannelID,
			"groupId", e.Payload.GroupID,
			"memberId", e.Payload.MemberID,
		)
		return err
	}
	return nil
}
