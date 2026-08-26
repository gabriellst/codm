package events

import (
	"template/contracts-go/wire"
	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelMessagesSyncedPayload is retargeted onto the frozen contracts wire binding
// (packages/contracts/generated/go/wire/events.go) — flat-events swap: the
// payload DECLARATION is single-sourced from
// `packages/contracts/src/wire/events/channel-messages-synced.tsp`.
//
// Semantics (unchanged): one HistorySync batch finished inserting message
// rows. Summary counts only (int32 in the binding).
type ChannelMessagesSyncedPayload = wire.ChannelMessagesSyncedPayload

const MessagesSyncedEventName = "channel.messages_synced"

type MessagesSyncedEvent = types.DomainEvent[ChannelMessagesSyncedPayload]

func NewMessagesSyncedEvent(entityID uuid.UUID, ownerID string, payload ChannelMessagesSyncedPayload) MessagesSyncedEvent {
	return types.NewDomainEvent(MessagesSyncedEventName, entityID, ownerID, payload)
}
