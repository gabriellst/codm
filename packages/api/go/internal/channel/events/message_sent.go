package events

import (
	"encoding/json"
	"time"

	msgenums "template/api-go/internal/channel/enums"
	sharedenums "template/api-go/internal/shared/enums"
	"template/api-go/internal/shared/types"

	"github.com/google/uuid"
)

// @union field=PlatformData discriminatedBy=Platform
// @variant Platform=WHATSAPP type=WhatsAppChannelMessageSentPlatformData
// @variant Platform=INTERNAL type=InternalChannelMessageSentPlatformData
// @union field=Content discriminatedBy=Platform,MessageType
// @variant Platform=WHATSAPP MessageType=TEXT type=WhatsAppTextContent
// @variant Platform=WHATSAPP MessageType=IMAGE type=WhatsAppImageContent
// @variant Platform=WHATSAPP MessageType=VIDEO type=WhatsAppVideoContent
// @variant Platform=WHATSAPP MessageType=AUDIO type=WhatsAppAudioContent
// @variant Platform=WHATSAPP MessageType=DOCUMENT type=WhatsAppDocumentContent
// @variant Platform=WHATSAPP MessageType=STICKER type=WhatsAppStickerContent
// @variant Platform=WHATSAPP MessageType=LOCATION type=WhatsAppLocationContent
// @variant Platform=WHATSAPP MessageType=CONTACT type=WhatsAppContactContent
// @variant Platform=WHATSAPP MessageType=POLL type=WhatsAppPollContent
// @variant Platform=WHATSAPP MessageType=REACTION type=WhatsAppReactionContent
// @variant Platform=INTERNAL MessageType=TEXT type=InternalTextContent
type ChannelMessageSentPayload struct {
	ChannelID         uuid.UUID            `json:"channelId" validate:"required"`
	MessageID         string               `json:"messageId" validate:"required"`
	InternalMessageID uuid.UUID            `json:"internalMessageId" validate:"required"`
	RemoteID          string               `json:"remoteId" validate:"required"`
	SenderID     string               `json:"senderId" validate:"required"` // always the owner
	IsGroup      bool                 `json:"isGroup"`
	Timestamp    int64                `json:"timestamp" validate:"required"`
	OccurredAt   time.Time            `json:"occurredAt" validate:"required"` // when WhatsApp says the message was sent
	ObservedAt   time.Time            `json:"observedAt" validate:"required"` // when our server learned about it
	MessageType  msgenums.MessageType `json:"messageType" validate:"required"`
	Content      json.RawMessage      `json:"content,omitempty"`
	Platform     sharedenums.Platform `json:"platform" validate:"required"`
	PlatformData json.RawMessage      `json:"platformData,omitempty"`
	OwnerID      string               `json:"ownerId" validate:"required"`
}

// WhatsAppChannelMessageSentPlatformData holds WhatsApp-specific fields for outgoing messages.
type WhatsAppChannelMessageSentPlatformData struct {
	IsGroup bool `json:"isGroup" validate:"required"`
}

// InternalChannelMessageSentPlatformData holds Web-specific fields for outgoing messages.
type InternalChannelMessageSentPlatformData struct {
	Metadata map[string]any `json:"metadata" validate:"required"`
}

const MessageSentEventName = "channel.message_sent"

type MessageSentEvent = types.DomainEvent[ChannelMessageSentPayload]

func NewMessageSentEvent(entityID uuid.UUID, ownerID string, payload ChannelMessageSentPayload) MessageSentEvent {
	return types.NewDomainEvent(MessageSentEventName, entityID, ownerID, payload)
}
