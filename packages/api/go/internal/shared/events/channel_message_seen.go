package events

import (
	channelevents "template/api-go/internal/channel/events"
	"template/api-go/internal/shared/types"
)

const ChannelMessageSeenEventName = "integration.channel_message.seen"

type ChannelMessageSeenEvent = types.IntegrationEvent[channelevents.ChannelMessageSeenPayload]

func NewChannelMessageSeenEvent(ownerID string, payload channelevents.ChannelMessageSeenPayload) ChannelMessageSeenEvent {
	return types.NewIntegrationEvent(ChannelMessageSeenEventName, ownerID, payload)
}
