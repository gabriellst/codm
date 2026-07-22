// CONTEXT-ORIGIN: medscall/software/monorepo/packages/channel@ff66dbb1ee0fcd6212e5bf68879fa1d5a0a9cd1b (2026-07-20)
// Source path: packages/channel/internal/shared/events/channel_message_received.go
// Harvested verbatim for the event skill exemplar set — do not edit; re-harvest instead.
package events

import (
	channelevents "monorepo/api/internal/channel/events"
	"monorepo/api/internal/shared/types"
)

const ChannelMessageReceivedEventName = "integration.channel_message.received"

type ChannelMessageReceivedEvent = types.IntegrationEvent[channelevents.ChannelMessageReceivedPayload]

func NewChannelMessageReceivedEvent(ownerID string, payload channelevents.ChannelMessageReceivedPayload) ChannelMessageReceivedEvent {
	return types.NewIntegrationEvent(ChannelMessageReceivedEventName, ownerID, payload)
}
