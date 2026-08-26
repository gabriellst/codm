package events

import (
	"template/contracts-go/wire"
	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelMessageDeliveredPayload is retargeted onto the frozen contracts wire
// binding (packages/contracts/generated/go/wire/events.go) — flat-events swap:
// the payload DECLARATION is single-sourced from
// `packages/contracts/src/wire/events/channel-message-delivered.tsp`.
//
// Semantics (unchanged): a recipient's device received one or more of the
// owner's messages in the given chat. Timestamp is a watermark — every owner
// message in the chat with message_timestamp <= Timestamp is considered
// delivered to SenderID. MessageIDs may be empty (bare online-ack), single, or
// batched; the read model only uses (RemoteID, SenderID, Timestamp).
//
// Disclosed type adaptation: the binding types `Platform` as the wire `string`
// (verbatim gateway Platform; ChannelKind reconciliation deferred to the
// enum-harmonization handoff) — publishers cast `string(enums.Platform*)`.
type ChannelMessageDeliveredPayload = wire.ChannelMessageDeliveredPayload

const MessageDeliveredEventName = "channel.message_delivered"

type MessageDeliveredEvent = types.DomainEvent[ChannelMessageDeliveredPayload]

func NewMessageDeliveredEvent(entityID uuid.UUID, ownerID string, payload ChannelMessageDeliveredPayload) MessageDeliveredEvent {
	return types.NewDomainEvent(MessageDeliveredEventName, entityID, ownerID, payload)
}
