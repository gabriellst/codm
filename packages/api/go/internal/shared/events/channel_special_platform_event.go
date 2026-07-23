package events

import (
	channelevents "template/api-go/internal/channel/events"
	"template/core-go/types"
)

const ChannelSpecialPlatformEventName = "integration.channel_special_platform_event.received"

type ChannelSpecialPlatformEvent = types.IntegrationEvent[channelevents.ChannelSpecialPlatformEventPayload]

func NewChannelSpecialPlatformEvent(ownerID string, payload channelevents.ChannelSpecialPlatformEventPayload) ChannelSpecialPlatformEvent {
	return types.NewIntegrationEvent(ChannelSpecialPlatformEventName, ownerID, payload)
}
