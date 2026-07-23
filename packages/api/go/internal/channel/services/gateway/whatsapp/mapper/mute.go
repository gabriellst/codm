package mapper

import (
	"time"

	"github.com/google/uuid"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/types/events"

	remoteevents "template/api-go/internal/channel/events"
	"template/core-go/types"
)

// mapMute translates an events.Mute (from AppState sync) into the
// `channel.remote_muted` / `channel.remote_unmuted` domain events. When muted,
// propagates the absolute end timestamp (whatsmeow stores it as UnixMilli,
// -1 meaning forever).
func mapMute(instanceID uuid.UUID, ownerID string, device *store.Device, v *events.Mute) types.DomainEventI {
	if v == nil || v.Action == nil || v.Action.Muted == nil {
		return nil
	}
	remoteJID := resolvePN(device, v.JID)
	remoteID := stripDeviceSuffix(remoteJID.String())
	ts := v.Timestamp
	if ts.IsZero() {
		ts = time.Now().UTC()
	}
	if *v.Action.Muted {
		var mutedUntil *time.Time
		if end := v.Action.GetMuteEndTimestamp(); end > 0 {
			t := time.UnixMilli(end).UTC()
			mutedUntil = &t
		}
		// end < 0 = muted forever; leave mutedUntil nil so consumers treat as open-ended.
		return remoteevents.NewRemoteMutedEvent(instanceID, ownerID, remoteevents.ChannelRemoteMutedPayload{
			ChannelID:  instanceID,
			RemoteID:   remoteID,
			At:         ts,
			MutedUntil: mutedUntil,
			OwnerID:    ownerID,
		})
	}
	return remoteevents.NewRemoteUnmutedEvent(instanceID, ownerID, remoteevents.ChannelRemoteUnmutedPayload{
		ChannelID: instanceID,
		RemoteID:  remoteID,
		At:        ts,
		OwnerID:   ownerID,
	})
}
