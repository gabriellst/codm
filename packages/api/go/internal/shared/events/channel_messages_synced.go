package events

import (
	channelevents "template/api-go/internal/channel/events"
	"template/core-go/types"
)

const ChannelMessagesSyncedEventName = "integration.channel.messages_synced"

type ChannelMessagesSyncedEvent = types.IntegrationEvent[channelevents.ChannelMessagesSyncedPayload]

func NewChannelMessagesSyncedEvent(ownerID string, payload channelevents.ChannelMessagesSyncedPayload) ChannelMessagesSyncedEvent {
	return types.NewIntegrationEvent(ChannelMessagesSyncedEventName, ownerID, payload)
}
