package events

import (
	"time"

	"template/api-go/internal/shared/types"

	"github.com/google/uuid"
)

// ChannelMembershipAddedPayload is fired when a participant joins a group.
type ChannelMembershipAddedPayload struct {
	ChannelID uuid.UUID `json:"channelId" validate:"required"`
	GroupID   string    `json:"groupId"   validate:"required"`
	MemberID  string    `json:"memberId"  validate:"required"`
	IsAdmin   bool      `json:"isAdmin"`
	JoinedAt  time.Time `json:"joinedAt"  validate:"required"`
	OwnerID   string    `json:"ownerId"   validate:"required"`
}

const MembershipAddedEventName = "channel.membership_added"

type MembershipAddedEvent = types.DomainEvent[ChannelMembershipAddedPayload]

func NewMembershipAddedEvent(entityID uuid.UUID, ownerID string, payload ChannelMembershipAddedPayload) MembershipAddedEvent {
	return types.NewDomainEvent(MembershipAddedEventName, entityID, ownerID, payload)
}
