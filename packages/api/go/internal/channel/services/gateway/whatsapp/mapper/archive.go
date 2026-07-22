package mapper

import (
	"time"

	"github.com/google/uuid"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/types/events"

	remoteevents "template/api-go/internal/channel/events"
	"template/api-go/internal/shared/types"
)

// mapArchive translates an events.Archive (from AppState sync) into the
// `channel.remote_archived` / `channel.remote_unarchived` domain events.
func mapArchive(instanceID uuid.UUID, ownerID string, device *store.Device, v *events.Archive) types.DomainEventI {
	if v == nil || v.Action == nil || v.Action.Archived == nil {
		return nil
	}
	remoteJID := resolvePN(device, v.JID)
	remoteID := stripDeviceSuffix(remoteJID.String())
	ts := v.Timestamp
	if ts.IsZero() {
		ts = time.Now().UTC()
	}
	if *v.Action.Archived {
		return remoteevents.NewRemoteArchivedEvent(instanceID, ownerID, remoteevents.ChannelRemoteArchivedPayload{
			ChannelID: instanceID,
			RemoteID:  remoteID,
			At:        ts,
			OwnerID:   ownerID,
		})
	}
	return remoteevents.NewRemoteUnarchivedEvent(instanceID, ownerID, remoteevents.ChannelRemoteUnarchivedPayload{
		ChannelID: instanceID,
		RemoteID:  remoteID,
		At:        ts,
		OwnerID:   ownerID,
	})
}
