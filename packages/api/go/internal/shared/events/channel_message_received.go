package events

import (
	channelevents "template/api-go/internal/channel/events"
	"template/core-go/types"
)

const ChannelMessageReceivedEventName = "integration.channel_message.received"

type ChannelMessageReceivedEvent = types.IntegrationEvent[channelevents.ChannelMessageReceivedPayload]

func NewChannelMessageReceivedEvent(ownerID string, payload channelevents.ChannelMessageReceivedPayload) ChannelMessageReceivedEvent {
	return types.NewIntegrationEvent(ChannelMessageReceivedEventName, ownerID, payload)
}
