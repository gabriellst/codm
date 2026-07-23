package events

import (
	channelevents "template/api-go/internal/channel/events"
	"template/core-go/types"
)

const ChannelConnectedEventName = "integration.channel.connected"

type ChannelConnectedEvent = types.IntegrationEvent[channelevents.GatewayConnectedPayload]

func NewChannelConnectedEvent(ownerID string, payload channelevents.GatewayConnectedPayload) ChannelConnectedEvent {
	return types.NewIntegrationEvent(ChannelConnectedEventName, ownerID, payload)
}
