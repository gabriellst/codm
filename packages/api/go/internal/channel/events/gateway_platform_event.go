package events

import (
	"template/contracts-go/wire"
	"template/core-go/types"

	"github.com/google/uuid"
)

// ChannelSpecialPlatformEventType is retargeted onto the frozen contracts wire
// enum `wire.SpecialPlatformEventType` (exact value-set match: qr_code_updated).
type ChannelSpecialPlatformEventType = wire.SpecialPlatformEventType

const (
	PlatformEventQRCodeUpdated = wire.SpecialPlatformEventTypeqr_code_updated
)

// ChannelSpecialPlatformEventPayload is retargeted onto the frozen contracts
// wire binding (packages/contracts/generated/go/wire/events.go,
// `wire.ChannelSpecialPlatformEventReceivedPayload`) — flat-events swap: the
// payload DECLARATION (fields + the stamped `// @union` / `// @variant`
// annotations the pkg/openapi scanner reads) is single-sourced from
// `packages/contracts/wire/events/channel-special-platform-event-received.tsp`.
// The union variant SHAPE (WhatsAppQRCodeUpdated) stays in this workspace
// (owner `apiGo`, services/gateway/whatsapp/events).
//
// Disclosed type adaptation: the binding types `Platform` as the wire `string`
// (verbatim gateway Platform; ChannelKind reconciliation deferred to the
// enum-harmonization handoff) — publishers cast `string(enums.Platform*)`.
type ChannelSpecialPlatformEventPayload = wire.ChannelSpecialPlatformEventReceivedPayload

const GatewayPlatformEventName = "channel.gateway_platform_event"

type GatewayPlatformEvent = types.DomainEvent[ChannelSpecialPlatformEventPayload]

func NewGatewayPlatformEvent(entityID uuid.UUID, ownerID string, payload ChannelSpecialPlatformEventPayload) GatewayPlatformEvent {
	return types.NewDomainEvent(GatewayPlatformEventName, entityID, ownerID, payload)
}
