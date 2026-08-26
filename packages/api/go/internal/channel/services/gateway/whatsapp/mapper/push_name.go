package mapper

import (
	"time"

	"github.com/google/uuid"
	"go.mau.fi/whatsmeow/store"
	waMeowTypes "go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"

	channelenums "template/api-go/internal/channel/enums"
	remoteevents "template/api-go/internal/channel/events"
	"template/core-go/types"
)

func mapPushName(instanceID uuid.UUID, ownerID string, device *store.Device, v *events.PushName) []types.DomainEventI {
	if v.NewPushName == "" {
		return nil
	}
	remoteJID := resolvePN(device, v.JID).ToNonAD()
	if remoteJID.Server != waMeowTypes.DefaultUserServer && remoteJID.Server != waMeowTypes.HiddenUserServer {
		return nil
	}
	return []types.DomainEventI{
		remoteevents.NewRemoteUpdatedEvent(instanceID, ownerID, remoteevents.ChannelRemoteUpdatedPayload{
			ChannelID:  instanceID,
			RemoteID:   remoteJID.String(),
			Type:       channelenums.RemoteTypeUser,
			Name:       v.NewPushName,
			ObservedAt: time.Now().UTC(),
			OwnerID:    ownerID,
		}),
	}
}
