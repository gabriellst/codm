package events

import (
	"encoding/json"
	"time"

	msgenums "template/api-go/internal/channel/enums"
	sharedenums "template/api-go/internal/shared/enums"
	"template/api-go/internal/shared/types"

	"github.com/google/uuid"
)

// ChannelMessageReceivedPayload is the data carried by the message-received events.
// Owned by the channel domain; shared/events imports this type for the
// integration wrapper.
// @union field=PlatformData discriminatedBy=Platform
// @variant Platform=WHATSAPP type=WhatsAppChannelMessageReceivedPlatformData
// @variant Platform=INTERNAL type=InternalChannelMessageReceivedPlatformData
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
type ChannelMessageReceivedPayload struct {
	ChannelID         uuid.UUID            `json:"channelId" validate:"required"`
	MessageID         string               `json:"messageId" validate:"required"`
	InternalMessageID uuid.UUID            `json:"internalMessageId" validate:"required"`
	RemoteID          string               `json:"remoteId" validate:"required"`
	SenderID     string               `json:"senderId" validate:"required"`
	FromMe       bool                 `json:"fromMe" validate:"required"`
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
