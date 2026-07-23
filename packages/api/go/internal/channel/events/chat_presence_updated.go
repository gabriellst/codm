package events

import (
	"template/contracts-go/wire"
	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelChatPresenceUpdatedPayload is retargeted onto the frozen contracts
// wire binding (packages/contracts/generated/go/wire/events.go) — flat-events
// swap: the payload DECLARATION is single-sourced from
// `packages/contracts/wire/events/channel-chat-presence-updated.tsp`.
//
// Semantics (unchanged): a typing/recording indicator inside a specific chat.
// Fires when whatsmeow emits *events.ChatPresence. `State` keeps its enum
// type: ChatPresenceType is already the exact-match wire alias.
type ChannelChatPresenceUpdatedPayload = wire.ChannelChatPresenceUpdatedPayload

const ChatPresenceUpdatedEventName = "channel.chat_presence_updated"

type ChatPresenceUpdatedEvent = types.DomainEvent[ChannelChatPresenceUpdatedPayload]

func NewChatPresenceUpdatedEvent(entityID uuid.UUID, ownerID string, payload ChannelChatPresenceUpdatedPayload) ChatPresenceUpdatedEvent {
	return types.NewDomainEvent(ChatPresenceUpdatedEventName, entityID, ownerID, payload)
}
