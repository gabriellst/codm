package events

import (
	channelevents "template/api-go/internal/channel/events"
	"template/api-go/internal/shared/types"
)

const ChannelMessageDeliveredEventName = "integration.channel_message.delivered"

type ChannelMessageDeliveredEvent = types.IntegrationEvent[channelevents.ChannelMessageDeliveredPayload]

func NewChannelMessageDeliveredEvent(ownerID string, payload channelevents.ChannelMessageDeliveredPayload) ChannelMessageDeliveredEvent {
	return types.NewIntegrationEvent(ChannelMessageDeliveredEventName, ownerID, payload)
}
