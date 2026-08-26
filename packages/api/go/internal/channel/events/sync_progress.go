package events

import (
	"template/contracts-go/wire"
	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelSyncProgressPayload is retargeted onto the frozen contracts wire binding
// (packages/contracts/generated/go/wire/events.go) — flat-events swap: the
// payload DECLARATION is single-sourced from
// `packages/contracts/src/wire/events/channel-sync-progress.tsp`.
//
// Semantics (unchanged): progress metrics for an ongoing sync session.
// HistorySyncType keeps its enum type (exact-match wire alias); Percent is
// int32 in the binding (0-100).
type ChannelSyncProgressPayload = wire.ChannelSyncProgressPayload

const SyncProgressEventName = "channel.sync_progress"

type SyncProgressEvent = types.DomainEvent[ChannelSyncProgressPayload]

func NewSyncProgressEvent(entityID uuid.UUID, ownerID string, payload ChannelSyncProgressPayload) SyncProgressEvent {
	return types.NewDomainEvent(SyncProgressEventName, entityID, ownerID, payload)
}
