package events

import (
	"encoding/json"

	"template/api-go/internal/channel/enums"
	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelSpecialPlatformEventType is the discriminator for platform-specific events.
type ChannelSpecialPlatformEventType string

const (
	PlatformEventQRCodeUpdated ChannelSpecialPlatformEventType = "qr_code_updated"
)

// ChannelSpecialPlatformEventPayload is the data carried by special platform events.
// Owned by the channel domain; shared/events imports this type for the
// integration wrapper.
// @union field=Payload discriminatedBy=Platform,EventType
// @variant Platform=WHATSAPP EventType=qr_code_updated type=WhatsAppQRCodeUpdated
type ChannelSpecialPlatformEventPayload struct {
	ChannelID uuid.UUID                       `json:"channelId" validate:"required"`
	EventName string                          `json:"eventName" validate:"required"`
	EventType ChannelSpecialPlatformEventType `json:"eventType" validate:"required"`
	Platform  enums.Platform                  `json:"platform" validate:"required"`
	Payload   json.RawMessage                 `json:"payload" validate:"required"`
	OwnerID   string                          `json:"ownerId" validate:"required"`
}

const GatewayPlatformEventName = "channel.gateway_platform_event"

type GatewayPlatformEvent = types.DomainEvent[ChannelSpecialPlatformEventPayload]

func NewGatewayPlatformEvent(entityID uuid.UUID, ownerID string, payload ChannelSpecialPlatformEventPayload) GatewayPlatformEvent {
	return types.NewDomainEvent(GatewayPlatformEventName, entityID, ownerID, payload)
}
