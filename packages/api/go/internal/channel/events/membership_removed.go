package events

import (
	"template/contracts-go/wire"
	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelMembershipRemovedPayload is retargeted onto the frozen contracts wire binding
// (packages/contracts/generated/go/wire/events.go) — flat-events swap: the
// payload DECLARATION is single-sourced from
// `packages/contracts/wire/events/channel-membership-removed.tsp`.
//
// Semantics (unchanged): a participant left (or was removed from) a group;
// deletes the matching remote_memberships row.
type ChannelMembershipRemovedPayload = wire.ChannelMembershipRemovedPayload

const MembershipRemovedEventName = "channel.membership_removed"

type MembershipRemovedEvent = types.DomainEvent[ChannelMembershipRemovedPayload]

func NewMembershipRemovedEvent(entityID uuid.UUID, ownerID string, payload ChannelMembershipRemovedPayload) MembershipRemovedEvent {
	return types.NewDomainEvent(MembershipRemovedEventName, entityID, ownerID, payload)
}
