package events

import (
	"time"

	"template/api-go/internal/shared/types"

	"github.com/google/uuid"
)

// ChannelMembershipRemovedPayload is fired when a participant leaves a group.
type ChannelMembershipRemovedPayload struct {
	ChannelID uuid.UUID `json:"channelId" validate:"required"`
	GroupID   string    `json:"groupId"   validate:"required"`
	MemberID  string    `json:"memberId"  validate:"required"`
	RemovedAt time.Time `json:"removedAt" validate:"required"`
	OwnerID   string    `json:"ownerId"   validate:"required"`
}

const MembershipRemovedEventName = "channel.membership_removed"

type MembershipRemovedEvent = types.DomainEvent[ChannelMembershipRemovedPayload]

func NewMembershipRemovedEvent(entityID uuid.UUID, ownerID string, payload ChannelMembershipRemovedPayload) MembershipRemovedEvent {
	return types.NewDomainEvent(MembershipRemovedEventName, entityID, ownerID, payload)
}
