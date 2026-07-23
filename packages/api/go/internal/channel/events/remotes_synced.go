package events

import (
	"template/contracts-go/wire"
	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelRemotesSyncedPayload is retargeted onto the frozen contracts wire binding
// (packages/contracts/generated/go/wire/events.go) — flat-events swap: the
// payload DECLARATION is single-sourced from
// `packages/contracts/wire/events/channel-remotes-synced.tsp`.
//
// Semantics (unchanged): fired once per bootstrap contact sync pass to let
// consumers invalidate the sidebar. Summary counts only (int32 in the binding).
type ChannelRemotesSyncedPayload = wire.ChannelRemotesSyncedPayload

const RemotesSyncedEventName = "channel.remotes_synced"

type RemotesSyncedEvent = types.DomainEvent[ChannelRemotesSyncedPayload]

func NewRemotesSyncedEvent(entityID uuid.UUID, ownerID string, payload ChannelRemotesSyncedPayload) RemotesSyncedEvent {
	return types.NewDomainEvent(RemotesSyncedEventName, entityID, ownerID, payload)
}
