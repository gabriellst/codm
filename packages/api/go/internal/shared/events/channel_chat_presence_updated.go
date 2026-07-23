package events

import (
	channelevents "template/api-go/internal/channel/events"
	"template/core-go/types"
)

const ChannelChatPresenceUpdatedEventName = "integration.channel.chat_presence_updated"

type ChannelChatPresenceUpdatedEvent = types.IntegrationEvent[channelevents.ChannelChatPresenceUpdatedPayload]

func NewChannelChatPresenceUpdatedEvent(ownerID string, payload channelevents.ChannelChatPresenceUpdatedPayload) ChannelChatPresenceUpdatedEvent {
	return types.NewIntegrationEvent(ChannelChatPresenceUpdatedEventName, ownerID, payload)
}
