package events

import (
	"template/contracts-go/wire"
	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelSyncCompletedPayload is retargeted onto the frozen contracts wire binding
// (packages/contracts/generated/go/wire/events.go) — flat-events swap: the
// payload DECLARATION is single-sourced from
// `packages/contracts/src/wire/events/channel-sync-completed.tsp`.
//
// Semantics (unchanged): a sync session has finished.
type ChannelSyncCompletedPayload = wire.ChannelSyncCompletedPayload

const SyncCompletedEventName = "channel.sync_completed"

type SyncCompletedEvent = types.DomainEvent[ChannelSyncCompletedPayload]

func NewSyncCompletedEvent(entityID uuid.UUID, ownerID string, payload ChannelSyncCompletedPayload) SyncCompletedEvent {
	return types.NewDomainEvent(SyncCompletedEventName, entityID, ownerID, payload)
}
