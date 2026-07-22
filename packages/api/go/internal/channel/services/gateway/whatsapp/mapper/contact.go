package mapper

import (
	"time"

	"github.com/google/uuid"
	"go.mau.fi/whatsmeow/store"
	waMeowTypes "go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"

	channelenums "template/api-go/internal/channel/enums"
	remoteevents "template/api-go/internal/channel/events"
	"template/api-go/internal/shared/types"
)

func mapContact(instanceID uuid.UUID, ownerID string, device *store.Device, v *events.Contact) []types.DomainEventI {
	name := ""
	if v.Action != nil {
		if v.Action.FullName != nil && *v.Action.FullName != "" {
			name = *v.Action.FullName
		} else if v.Action.FirstName != nil {
			name = *v.Action.FirstName
		}
	}
	if name == "" {
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
			Name:       name,
			ObservedAt: time.Now().UTC(),
			OwnerID:    ownerID,
		}),
	}
}
