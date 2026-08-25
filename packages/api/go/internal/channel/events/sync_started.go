package events

import (
	"template/contracts-go/wire"
	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelSyncStartedPayload is retargeted onto the frozen contracts wire binding
// (packages/contracts/generated/go/wire/events.go) — flat-events swap: the
// payload DECLARATION is single-sourced from
// `packages/contracts/src/wire/events/channel-sync-started.tsp`.
//
// Semantics (unchanged): a sync session has begun.
type ChannelSyncStartedPayload = wire.ChannelSyncStartedPayload

const SyncStartedEventName = "channel.sync_started"

type SyncStartedEvent = types.DomainEvent[ChannelSyncStartedPayload]

func NewSyncStartedEvent(entityID uuid.UUID, ownerID string, payload ChannelSyncStartedPayload) SyncStartedEvent {
	return types.NewDomainEvent(SyncStartedEventName, entityID, ownerID, payload)
}
