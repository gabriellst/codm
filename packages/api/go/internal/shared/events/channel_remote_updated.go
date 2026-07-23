// BLOCKED — flat-events migration (do NOT swap onto the wire binding yet).
//
// Blocking enum: RemoteType {USER, GROUP, BROADCAST} (internal/channel/enums)
// vs contracts ContactKind {CONTACT, GROUP, BROADCAST} — today's wire publishes
// "USER" and the keys `type`/`name`; the binding declares ContactKind and the
// keys `contactKind`/`displayName`. A swap would corrupt the wire (value + key
// changes). Unblocks in: schema-handoff enum harmonization
// (RemoteType→ContactKind, USER→CONTACT — channel-wire-classification.md §C.1/§G.3).
package events

import (
	channelevents "template/api-go/internal/channel/events"
	"template/core-go/types"
)

const ChannelRemoteUpdatedEventName = "integration.channel.remote_updated"

type ChannelRemoteUpdatedEvent = types.IntegrationEvent[channelevents.ChannelRemoteUpdatedPayload]

func NewChannelRemoteUpdatedEvent(ownerID string, payload channelevents.ChannelRemoteUpdatedPayload) ChannelRemoteUpdatedEvent {
	return types.NewIntegrationEvent(ChannelRemoteUpdatedEventName, ownerID, payload)
}
