package events

import (
	channelevents "template/api-go/internal/channel/events"
	"template/api-go/internal/shared/types"
)

const ChannelMembershipAddedEventName = "integration.channel.membership_added"

type ChannelMembershipAddedEvent = types.IntegrationEvent[channelevents.ChannelMembershipAddedPayload]

func NewChannelMembershipAddedEvent(ownerID string, payload channelevents.ChannelMembershipAddedPayload) ChannelMembershipAddedEvent {
	return types.NewIntegrationEvent(ChannelMembershipAddedEventName, ownerID, payload)
}
