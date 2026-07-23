package events

import (
	"template/contracts-go/wire"
	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelRemoteDeletedPayload is retargeted onto the frozen contracts wire binding
// (packages/contracts/generated/go/wire/events.go) — flat-events swap: the
// payload DECLARATION is single-sourced from
// `packages/contracts/wire/events/channel-remote-deleted.tsp`.
//
// Semantics (unchanged): raised when a Remote aggregate is soft-deleted; the
// read model stamps deleted_at without removing the row.
type ChannelRemoteDeletedPayload = wire.ChannelRemoteDeletedPayload

// RemoteDeletedEventName is the in-process domain event name raised when a
// Remote aggregate is soft-deleted.
const RemoteDeletedEventName = "channel.remote_deleted"

type RemoteDeletedEvent = types.DomainEvent[ChannelRemoteDeletedPayload]

func NewRemoteDeletedEvent(entityID uuid.UUID, ownerID string, payload ChannelRemoteDeletedPayload) RemoteDeletedEvent {
	return types.NewDomainEvent(RemoteDeletedEventName, entityID, ownerID, payload)
}
