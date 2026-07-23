package events

import (
	"template/contracts-go/wire"
	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelMembershipAddedPayload is retargeted onto the frozen contracts wire binding
// (packages/contracts/generated/go/wire/events.go) — flat-events swap: the
// payload DECLARATION is single-sourced from
// `packages/contracts/wire/events/channel-membership-added.tsp`.
//
// Semantics (unchanged): a participant joined a group; writes a
// remote_memberships row. IsAdmin captures the join-time role.
type ChannelMembershipAddedPayload = wire.ChannelMembershipAddedPayload

const MembershipAddedEventName = "channel.membership_added"

type MembershipAddedEvent = types.DomainEvent[ChannelMembershipAddedPayload]

func NewMembershipAddedEvent(entityID uuid.UUID, ownerID string, payload ChannelMembershipAddedPayload) MembershipAddedEvent {
	return types.NewDomainEvent(MembershipAddedEventName, entityID, ownerID, payload)
}
