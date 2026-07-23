package events

import (
	"template/contracts-go/wire"
	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelMessageSeenPayload is retargeted onto the frozen contracts wire
// binding (packages/contracts/generated/go/wire/events.go) — flat-events swap:
// the payload DECLARATION is single-sourced from
// `packages/contracts/wire/events/channel-message-seen.tsp`.
//
// Semantics (unchanged): messages in a chat were read or played. Covers three
// whatsmeow receipt types that all mean "consumed":
//
//   - read              → counterparty opened the chat / message
//   - played            → counterparty played a voice/video note
//   - read-self (Self=true) → owner read the thread on another device
//
// Status aggregation (per-message ✓✓ blue) uses SenderID != owner rows.
// Remote chat_seen sync (multi-device) uses Self=true rows. Timestamp is a
// watermark — every owner message with message_timestamp <= Timestamp is seen.
//
// Disclosed type adaptation: the binding types `Platform` as the wire `string`
// (verbatim gateway Platform; ChannelKind reconciliation deferred to the
// enum-harmonization handoff) — publishers cast `string(enums.Platform*)`.
type ChannelMessageSeenPayload = wire.ChannelMessageSeenPayload

const MessageSeenEventName = "channel.message_seen"

type MessageSeenEvent = types.DomainEvent[ChannelMessageSeenPayload]

func NewMessageSeenEvent(entityID uuid.UUID, ownerID string, payload ChannelMessageSeenPayload) MessageSeenEvent {
	return types.NewDomainEvent(MessageSeenEventName, entityID, ownerID, payload)
}
