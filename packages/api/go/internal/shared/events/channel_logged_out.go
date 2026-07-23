package events

import (
	channelevents "template/api-go/internal/channel/events"
	"template/core-go/types"
)

const ChannelLoggedOutEventName = "integration.channel.logged_out"

type ChannelLoggedOutEvent = types.IntegrationEvent[channelevents.ChannelLoggedOutPayload]

func NewChannelLoggedOutEvent(ownerID string, payload channelevents.ChannelLoggedOutPayload) ChannelLoggedOutEvent {
	return types.NewIntegrationEvent(ChannelLoggedOutEventName, ownerID, payload)
}
