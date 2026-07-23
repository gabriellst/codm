package events

import (
	channelevents "template/api-go/internal/channel/events"
	"template/core-go/types"
)

const ChannelDisconnectedEventName = "integration.channel.disconnected"

type ChannelDisconnectedEvent = types.IntegrationEvent[channelevents.GatewayDisconnectedPayload]

func NewChannelDisconnectedEvent(ownerID string, payload channelevents.GatewayDisconnectedPayload) ChannelDisconnectedEvent {
	return types.NewIntegrationEvent(ChannelDisconnectedEventName, ownerID, payload)
}
