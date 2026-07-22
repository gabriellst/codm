// Package events holds the channel gateway's DOMAIN events (this context only).
//
// These are the write-side facts the whatsmeow adapter/mapper raise when
// something happens on a platform session. They are persisted via the
// DomainEventRepository (dual-write to shared.events + shared.outbox) and
// dispatched in-process by the OutboxDispatcher → InternalMediator. The
// context's egress handlers translate each domain fact into the FROZEN
// cross-boundary integration event (template/contracts-go/wire) and publish it
// on the ExternalMediator (Redis Streams). Nothing here crosses a service
// boundary directly — the wire contract is the only thing that does.
//
// Naming: domain events use the bare `channel.*` prefix; the integration events
// they map to use `integration.channel*` (the frozen wire names). They never
// collide.
package events

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"

	"template/contracts-go/wire"
	"template/core-go/types"
)

// Event name constants (domain, this context).
const (
	MessageReceivedEventName    = "channel.message_received"
	ConnectedEventName          = "channel.connected"
	DisconnectedEventName       = "channel.disconnected"
	PairingQRUpdatedEventName   = "channel.pairing_qr_updated"
	OutboundDeliveredEventName  = "channel.outbound_delivered"
)

// ── message_received ──────────────────────────────────────────────────────────

// MessageReceivedPayload is the normalized inbound message the gateway observed.
// contact* fields describe the conversation counterparty (a person or a group);
// sender* is the individual author (differs from contact in a group).
type MessageReceivedPayload struct {
	ChannelID   uuid.UUID        `json:"channelId"`
	MessageID   string           `json:"messageId"`
	ContactID   string           `json:"contactId"`   // external id of the chat (counterparty)
	DisplayName string           `json:"displayName"` // best-known contact display name
	SenderID    string           `json:"senderId"`    // external id of the individual author
	IsGroup     bool             `json:"isGroup"`
	Text        string           `json:"text"`
	QuotedID    string           `json:"quotedId,omitempty"`
	Kind        wire.ChannelKind `json:"kind"`
	ReceivedAt  time.Time        `json:"receivedAt"`
	OwnerID     string           `json:"ownerId"`

	// Read-model fields — drive the gateway.messages + gateway.remotes
	// projections (message row insert + unread/preview fold). They are carried on
	// the same fact the egress bridges to wire; the wire event stays lean.
	// RemoteID is the canonical counterparty id (== ContactID); InternalMessageID
	// is the projection row's UUID; Content is the opaque JSONB message body.
	InternalMessageID uuid.UUID       `json:"internalMessageId"`
	RemoteID          string          `json:"remoteId"`
	Content           json.RawMessage `json:"content,omitempty"`
	ObservedAt        time.Time       `json:"observedAt"`
}

type MessageReceivedEvent = types.DomainEvent[MessageReceivedPayload]

func NewMessageReceivedEvent(channelID uuid.UUID, ownerID string, p MessageReceivedPayload) MessageReceivedEvent {
	return types.NewDomainEvent(MessageReceivedEventName, channelID, ownerID, p)
}

// ── connected ─────────────────────────────────────────────────────────────────

// ConnectedPayload — a session finished pairing and is reachable.
// AccountDetail is the logged-in account's canonical remote id (phone JID).
type ConnectedPayload struct {
	ChannelID     uuid.UUID       `json:"channelId"`
	Kind          wire.ChannelKind `json:"kind"`
	AccountDetail string          `json:"accountDetail"`
	PairedAt      time.Time       `json:"pairedAt"`
	OwnerID       string          `json:"ownerId"`
}

type ConnectedEvent = types.DomainEvent[ConnectedPayload]

func NewConnectedEvent(channelID uuid.UUID, ownerID string, p ConnectedPayload) ConnectedEvent {
	return types.NewDomainEvent(ConnectedEventName, channelID, ownerID, p)
}

// ── disconnected ──────────────────────────────────────────────────────────────

// DisconnectedPayload — a session was torn down. The gateway does not know which
// threads are affected (that is BC4's read model); AffectedThreadIds is left for
// the core to resolve by channelId.
type DisconnectedPayload struct {
	ChannelID uuid.UUID       `json:"channelId"`
	Kind      wire.ChannelKind `json:"kind"`
	OwnerID   string          `json:"ownerId"`
}

type DisconnectedEvent = types.DomainEvent[DisconnectedPayload]

func NewDisconnectedEvent(channelID uuid.UUID, ownerID string, p DisconnectedPayload) DisconnectedEvent {
	return types.NewDomainEvent(DisconnectedEventName, channelID, ownerID, p)
}

// ── pairing_qr_updated ──────────────────────────────────────────────────────────

// PairingQRUpdatedPayload — a fresh pairing QR/token was produced (rotates ~30s).
type PairingQRUpdatedPayload struct {
	ChannelID   uuid.UUID       `json:"channelId"`
	Kind        wire.ChannelKind `json:"kind"`
	QRPayload   string          `json:"qrPayload"`
	QRExpiresAt time.Time       `json:"qrExpiresAt"`
	OwnerID     string          `json:"ownerId"`
}

type PairingQRUpdatedEvent = types.DomainEvent[PairingQRUpdatedPayload]

func NewPairingQRUpdatedEvent(channelID uuid.UUID, ownerID string, p PairingQRUpdatedPayload) PairingQRUpdatedEvent {
	return types.NewDomainEvent(PairingQRUpdatedEventName, channelID, ownerID, p)
}

// ── outbound_delivered ──────────────────────────────────────────────────────────

// OutboundDeliveredPayload — an outbound message was handed to the platform
// (optimistic emit right after the send call returns).
type OutboundDeliveredPayload struct {
	ChannelID      uuid.UUID           `json:"channelId"`
	ContactID      string              `json:"contactId"`
	DisplayName    string              `json:"displayName"`
	IsGroup        bool                `json:"isGroup"`
	SenderIdentity wire.SenderIdentity `json:"senderIdentity"`
	LabelIssueKey  string              `json:"labelIssueKey,omitempty"`
	LabelThreadID  string              `json:"labelThreadId,omitempty"`
	DeliveredAt    time.Time           `json:"deliveredAt"`
	OwnerID        string              `json:"ownerId"`
}

type OutboundDeliveredEvent = types.DomainEvent[OutboundDeliveredPayload]

func NewOutboundDeliveredEvent(channelID uuid.UUID, ownerID string, p OutboundDeliveredPayload) OutboundDeliveredEvent {
	return types.NewDomainEvent(OutboundDeliveredEventName, channelID, ownerID, p)
}
