package events

import (
	"template/contracts-go/wire"
	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelMessageReceivedPayload is retargeted onto the frozen contracts wire binding
// (packages/contracts/generated/go/wire/events.go) — the union-slots PILOT: the payload
// DECLARATION (fields + the stamped `// @union` / `// @variant` annotations the
// pkg/openapi scanner reads) now lives on the generated binding, single-sourced from
// `packages/contracts/src/wire/events/channel-message-received.tsp`. The union variant
// SHAPES stay in this workspace (owner `apiGo`): the WhatsApp*Content structs in
// services/gateway/whatsapp, InternalTextContent in services/gateway, and the
// *PlatformData structs below.
type ChannelMessageReceivedPayload = wire.ChannelMessageReceivedPayload

// WhatsAppChannelMessageReceivedPlatformData holds WhatsApp-specific fields for message received events.
type WhatsAppChannelMessageReceivedPlatformData struct {
	IsEphemeral bool   `json:"isEphemeral" validate:"required"`
	IsViewOnce  bool   `json:"isViewOnce" validate:"required"`
	IsGroup     bool   `json:"isGroup" validate:"required"`
	PushName    string `json:"pushName" validate:"required"`
}

// InternalChannelMessageReceivedPlatformData holds Web-specific fields for message received events.
type InternalChannelMessageReceivedPlatformData struct {
	Metadata map[string]any `json:"metadata" validate:"required"`
}

const MessageReceivedEventName = "channel.message_received"

type MessageReceivedEvent = types.DomainEvent[ChannelMessageReceivedPayload]

func NewMessageReceivedEvent(entityID uuid.UUID, ownerID string, payload ChannelMessageReceivedPayload) MessageReceivedEvent {
	return types.NewDomainEvent(MessageReceivedEventName, entityID, ownerID, payload)
}
