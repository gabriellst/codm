package events

import (
	channelevents "template/api-go/internal/channel/events"
	"template/core-go/types"
)

const ChannelMembershipRemovedEventName = "integration.channel.membership_removed"

type ChannelMembershipRemovedEvent = types.IntegrationEvent[channelevents.ChannelMembershipRemovedPayload]

func NewChannelMembershipRemovedEvent(ownerID string, payload channelevents.ChannelMembershipRemovedPayload) ChannelMembershipRemovedEvent {
	return types.NewIntegrationEvent(ChannelMembershipRemovedEventName, ownerID, payload)
}
