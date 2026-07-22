package mapper

import (
	"github.com/google/uuid"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/types/events"

	ctxevents "template/api-go/internal/channel/events"
	"template/api-go/internal/shared/types"
)

func mapPicture(instanceID uuid.UUID, ownerID string, device *store.Device, v *events.Picture) []types.DomainEventI {
	if v.JID.IsEmpty() {
		return nil
	}
	remoteID := stripDeviceSuffix(resolvePN(device, v.JID).String())
	return []types.DomainEventI{
		ctxevents.NewGatewayPictureChangedEvent(instanceID, ownerID, ctxevents.GatewayPictureChangedPayload{
			ChannelID: instanceID,
			RemoteID:  remoteID,
			OwnerID:   ownerID,
		}),
	}
}
