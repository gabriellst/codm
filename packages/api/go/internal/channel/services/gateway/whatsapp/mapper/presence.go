package mapper

import (
	"time"

	"github.com/google/uuid"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/types/events"

	ctxevents "template/api-go/internal/channel/events"
	"template/core-go/types"
)

func mapPresence(instanceID uuid.UUID, ownerID string, device *store.Device, v *events.Presence) []types.DomainEventI {
	if v.From.IsEmpty() {
		return nil
	}
	remoteID := stripDeviceSuffix(resolvePN(device, v.From).String())
	var lastSeen *int64
	if !v.LastSeen.IsZero() {
		ls := v.LastSeen.Unix()
		lastSeen = &ls
	}
	return []types.DomainEventI{
		ctxevents.NewPresenceUpdatedEvent(instanceID, ownerID, ctxevents.ChannelPresenceUpdatedPayload{
			ChannelID:   instanceID,
			RemoteID:    remoteID,
			Unavailable: v.Unavailable,
			LastSeen:    lastSeen,
			ObservedAt:  time.Now().UTC(),
			OwnerID:     ownerID,
		}),
	}
}
