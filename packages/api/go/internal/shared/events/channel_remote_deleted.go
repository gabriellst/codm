package events

import (
	channelevents "template/api-go/internal/channel/events"
	"template/core-go/types"
)

const ChannelRemoteDeletedEventName = "integration.channel.remote_deleted"

type ChannelRemoteDeletedEvent = types.IntegrationEvent[channelevents.ChannelRemoteDeletedPayload]

func NewChannelRemoteDeletedEvent(ownerID string, payload channelevents.ChannelRemoteDeletedPayload) ChannelRemoteDeletedEvent {
	return types.NewIntegrationEvent(ChannelRemoteDeletedEventName, ownerID, payload)
}
