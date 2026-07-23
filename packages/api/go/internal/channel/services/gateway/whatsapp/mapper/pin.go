package mapper

import (
	"time"

	"github.com/google/uuid"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/types/events"

	remoteevents "template/api-go/internal/channel/events"
	"template/core-go/types"
)

// mapPin translates an events.Pin (from AppState sync) into the
// `channel.remote_pinned` / `channel.remote_unpinned` domain events so the
// downstream handler can translate into the matching integration event.
// Returns nil if the action payload is missing.
func mapPin(instanceID uuid.UUID, ownerID string, device *store.Device, v *events.Pin) types.DomainEventI {
	if v == nil || v.Action == nil || v.Action.Pinned == nil {
		return nil
	}
	remoteJID := resolvePN(device, v.JID)
	remoteID := stripDeviceSuffix(remoteJID.String())
	ts := v.Timestamp
	if ts.IsZero() {
		ts = time.Now().UTC()
	}
	if *v.Action.Pinned {
		return remoteevents.NewRemotePinnedEvent(instanceID, ownerID, remoteevents.ChannelRemotePinnedPayload{
			ChannelID: instanceID,
			RemoteID:  remoteID,
			At:        ts,
			OwnerID:   ownerID,
		})
	}
	return remoteevents.NewRemoteUnpinnedEvent(instanceID, ownerID, remoteevents.ChannelRemoteUnpinnedPayload{
		ChannelID: instanceID,
		RemoteID:  remoteID,
		At:        ts,
		OwnerID:   ownerID,
	})
}
