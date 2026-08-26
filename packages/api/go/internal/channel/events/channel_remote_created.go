// BLOCKED — flat-events migration (do NOT swap onto the wire binding yet).
//
// Blocking enum: RemoteType {USER, GROUP, BROADCAST} (internal/channel/enums)
// vs contracts ContactKind {CONTACT, GROUP, BROADCAST} — today's wire publishes
// "USER" and the key `remoteType`; the binding declares ContactKind and the key
// `contactKind`. A swap would corrupt the wire (value + key change).
// Unblocks in: schema-handoff enum harmonization (RemoteType→ContactKind,
// USER→CONTACT — channel-wire-classification.md §C.1/§G.3).
package events

import (
	"template/core-go/types"
)

const ChannelRemoteCreatedEventName = "integration.channel.remote_created"

type ChannelRemoteCreatedEvent = types.IntegrationEvent[ChannelRemoteCreatedPayload]

func NewChannelRemoteCreatedEvent(ownerID string, payload ChannelRemoteCreatedPayload) ChannelRemoteCreatedEvent {
	return types.NewIntegrationEvent(ChannelRemoteCreatedEventName, ownerID, payload)
}
