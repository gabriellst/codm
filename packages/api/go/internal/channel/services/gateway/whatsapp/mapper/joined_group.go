package mapper

import (
	"time"

	"github.com/google/uuid"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/types/events"

	channelenums "template/api-go/internal/channel/enums"
	ctxevents "template/api-go/internal/channel/events"
	remoteevents "template/api-go/internal/channel/events"
	"template/api-go/internal/shared/types"
)

func mapJoinedGroup(instanceID uuid.UUID, ownerID string, device *store.Device, v *events.JoinedGroup) []types.DomainEventI {
	now := time.Now().UTC()
	groupID := v.JID.String()
	subject := v.GroupName.Name
	out := []types.DomainEventI{
		remoteevents.NewRemoteUpdatedEvent(instanceID, ownerID, remoteevents.ChannelRemoteUpdatedPayload{
			ChannelID:  instanceID,
			RemoteID:   groupID,
			Type:       channelenums.RemoteTypeGroup,
			Name:       subject,
			ObservedAt: now,
			OwnerID:    ownerID,
		}),
	}
	// Emit a granular MembershipAddedEvent for the bot's own JID (self-join).
	if device != nil && device.ID != nil {
		selfJID := resolvePN(device, *device.ID).ToNonAD().String()
		if selfJID != "" {
			out = append(out, ctxevents.NewMembershipAddedEvent(instanceID, ownerID, ctxevents.ChannelMembershipAddedPayload{
				ChannelID: instanceID,
				GroupID:   groupID,
				MemberID:  selfJID,
				IsAdmin:   false,
				JoinedAt:  now,
				OwnerID:   ownerID,
			}))
		}
	}
	return out
}
