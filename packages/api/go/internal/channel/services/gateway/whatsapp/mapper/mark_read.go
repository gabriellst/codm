package mapper

import (
	"time"

	"github.com/google/uuid"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/types/events"

	remoteevents "template/api-go/internal/channel/events"
	"template/core-go/types"
)

// mapMarkChatAsRead translates an events.MarkChatAsRead (from AppState
// sync) into the `channel.remote_chat_seen` (read=true) or
// `channel.remote_marked_as_unread` (read=false) domain events.
func mapMarkChatAsRead(instanceID uuid.UUID, ownerID string, device *store.Device, v *events.MarkChatAsRead) types.DomainEventI {
	if v == nil || v.Action == nil || v.Action.Read == nil {
		return nil
	}
	remoteJID := resolvePN(device, v.JID)
	remoteID := stripDeviceSuffix(remoteJID.String())
	ts := v.Timestamp
	if ts.IsZero() {
		ts = time.Now().UTC()
	}
	if *v.Action.Read {
		return remoteevents.NewRemoteChatSeenEvent(instanceID, ownerID, remoteevents.ChannelRemoteChatSeenPayload{
			ChannelID: instanceID,
			RemoteID:  remoteID,
			At:        ts,
			OwnerID:   ownerID,
		})
	}
	return remoteevents.NewRemoteMarkedAsUnreadEvent(instanceID, ownerID, remoteevents.ChannelRemoteMarkedAsUnreadPayload{
		ChannelID: instanceID,
		RemoteID:  remoteID,
		At:        ts,
		OwnerID:   ownerID,
	})
}
