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

func mapGroupInfo(instanceID uuid.UUID, ownerID string, device *store.Device, v *events.GroupInfo) []types.DomainEventI {
	out := []types.DomainEventI{}
	now := time.Now().UTC()
	groupID := v.JID.String()

	// Attribute delta — emit remote_updated (type=group) only when Name is set.
	// Topic-only changes (description without a subject rename) are skipped here;
	// the bootstrap scan will pick up the full snapshot via remote_synced.
	if v.Name != nil {
		name := v.Name.Name
		var descriptionPtr *string
		if v.Topic != nil {
			d := v.Topic.Topic
			descriptionPtr = &d
		}
		out = append(out, remoteevents.NewRemoteUpdatedEvent(instanceID, ownerID, remoteevents.ChannelRemoteUpdatedPayload{
			ChannelID:   instanceID,
			RemoteID:    groupID,
			Type:        channelenums.RemoteTypeGroup,
			Name:        name,
			Description: descriptionPtr,
			ObservedAt:  now,
			OwnerID:     ownerID,
		}))
	}

	// Membership deltas — one granular event per JID per action.
	// Join → MembershipAddedEvent (isAdmin=false).
	for _, j := range v.Join {
		memberID := stripDeviceSuffix(resolvePN(device, j).String())
		out = append(out, ctxevents.NewMembershipAddedEvent(instanceID, ownerID, ctxevents.ChannelMembershipAddedPayload{
			ChannelID: instanceID,
			GroupID:   groupID,
			MemberID:  memberID,
			IsAdmin:   false,
			JoinedAt:  now,
			OwnerID:   ownerID,
		}))
	}

	// Leave → MembershipRemovedEvent.
	for _, j := range v.Leave {
		memberID := stripDeviceSuffix(resolvePN(device, j).String())
		out = append(out, ctxevents.NewMembershipRemovedEvent(instanceID, ownerID, ctxevents.ChannelMembershipRemovedPayload{
			ChannelID: instanceID,
			GroupID:   groupID,
			MemberID:  memberID,
			RemovedAt: now,
			OwnerID:   ownerID,
		}))
	}

	// Promote → MembershipAddedEvent (isAdmin=true) — upserts the member with admin role.
	for _, j := range v.Promote {
		memberID := stripDeviceSuffix(resolvePN(device, j).String())
		out = append(out, ctxevents.NewMembershipAddedEvent(instanceID, ownerID, ctxevents.ChannelMembershipAddedPayload{
			ChannelID: instanceID,
			GroupID:   groupID,
			MemberID:  memberID,
			IsAdmin:   true,
			JoinedAt:  now,
			OwnerID:   ownerID,
		}))
	}

	// Demote → MembershipAddedEvent (isAdmin=false) — upserts the member with member role.
	for _, j := range v.Demote {
		memberID := stripDeviceSuffix(resolvePN(device, j).String())
		out = append(out, ctxevents.NewMembershipAddedEvent(instanceID, ownerID, ctxevents.ChannelMembershipAddedPayload{
			ChannelID: instanceID,
			GroupID:   groupID,
			MemberID:  memberID,
			IsAdmin:   false,
			JoinedAt:  now,
			OwnerID:   ownerID,
		}))
	}

	if len(out) == 0 {
		return nil
	}
	return out
}
