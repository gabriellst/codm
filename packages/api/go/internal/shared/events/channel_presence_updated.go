package events

import (
	channelevents "template/api-go/internal/channel/events"
	"template/core-go/types"
)

const ChannelPresenceUpdatedEventName = "integration.channel.presence_updated"

type ChannelPresenceUpdatedEvent = types.IntegrationEvent[channelevents.ChannelPresenceUpdatedPayload]

func NewChannelPresenceUpdatedEvent(ownerID string, payload channelevents.ChannelPresenceUpdatedPayload) ChannelPresenceUpdatedEvent {
	return types.NewIntegrationEvent(ChannelPresenceUpdatedEventName, ownerID, payload)
}
