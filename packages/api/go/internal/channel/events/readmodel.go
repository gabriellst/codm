// readmodel.go holds the channel gateway's read-model DOMAIN events — the facts
// the whatsmeow adapter/mapper raise beyond the lean lifecycle set in events.go.
//
// They descend the medscall channel domain events (port phase 2), driving the
// gateway.remotes / gateway.remote_memberships / gateway.messages projections via
// the projectors, and are bridged to the FROZEN wire integration events by the
// egress handlers. Domain names use the bare `channel.*` / `channel_message.*`
// prefix; the integration events they map to use `integration.channel*`.
package events

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"

	"template/contracts-go/wire"
	"template/core-go/types"
)

// Event name constants (domain, read-model set).
const (
	MessageSentEventName      = "channel_message.sent"
	MessageEditedEventName    = "channel_message.edited"
	MessageDeletedEventName   = "channel_message.deleted"
	MessageDeliveredEventName = "channel_message.delivered"
	MessageSeenEventName      = "channel_message.seen"

	RemoteCreatedEventName = "channel.remote_created"
	RemoteUpdatedEventName = "channel.remote_updated"
	RemoteDeletedEventName = "channel.remote_deleted"

	MembershipAddedEventName   = "channel.membership_added"
	MembershipRemovedEventName = "channel.membership_removed"

	PresenceUpdatedEventName     = "channel.presence_updated"
	ChatPresenceUpdatedEventName = "channel.chat_presence_updated"

	ContactsSyncedEventName = "channel.contacts_synced"
	MessagesSyncedEventName = "channel.messages_synced"
)

// ── message_sent ────────────────────────────────────────────────────────────────

// MessageSentPayload — an outbound message left the gateway. Drives the
// gateway.messages read model (raw projection) and bridges to
// integration.channel_message.sent. Content is the opaque JSONB body.
type MessageSentPayload struct {
	ChannelID         uuid.UUID        `json:"channelId"`
	MessageID         string           `json:"messageId"` // platform id
	InternalMessageID uuid.UUID        `json:"internalMessageId"`
	RemoteID          string           `json:"remoteId"`
	SenderID          string           `json:"senderId"`
	IsGroup           bool             `json:"isGroup"`
	Timestamp         int64            `json:"timestamp"`
	OccurredAt        time.Time        `json:"occurredAt"`
	ObservedAt        time.Time        `json:"observedAt"`
	MessageType       wire.MessageType `json:"messageType"`
	Content           json.RawMessage  `json:"content,omitempty"`
	Platform          wire.ChannelKind `json:"platform"`
	OwnerID           string           `json:"ownerId"`
}

type MessageSentEvent = types.DomainEvent[MessageSentPayload]

func NewMessageSentEvent(channelID uuid.UUID, ownerID string, p MessageSentPayload) MessageSentEvent {
	return types.NewDomainEvent(MessageSentEventName, channelID, ownerID, p)
}

// ── message_edited ──────────────────────────────────────────────────────────────

// MessageEditedPayload — a previously sent/received message's content was revised.
type MessageEditedPayload struct {
	ChannelID   uuid.UUID        `json:"channelId"`
	MessageID   string           `json:"messageId"` // platform id
	RemoteID    string           `json:"remoteId"`
	SenderID    string           `json:"senderId"`
	Timestamp   int64            `json:"timestamp"`
	MessageType wire.MessageType `json:"messageType"`
	Content     json.RawMessage  `json:"content,omitempty"`
	Platform    wire.ChannelKind `json:"platform"`
	OwnerID     string           `json:"ownerId"`
}

type MessageEditedEvent = types.DomainEvent[MessageEditedPayload]

func NewMessageEditedEvent(channelID uuid.UUID, ownerID string, p MessageEditedPayload) MessageEditedEvent {
	return types.NewDomainEvent(MessageEditedEventName, channelID, ownerID, p)
}

// ── message_deleted ─────────────────────────────────────────────────────────────

// MessageDeletedPayload — a tombstone for a previously sent/received message.
type MessageDeletedPayload struct {
	ChannelID uuid.UUID        `json:"channelId"`
	MessageID string           `json:"messageId"` // platform id
	RemoteID  string           `json:"remoteId"`
	Platform  wire.ChannelKind `json:"platform"`
	OwnerID   string           `json:"ownerId"`
}

type MessageDeletedEvent = types.DomainEvent[MessageDeletedPayload]

func NewMessageDeletedEvent(channelID uuid.UUID, ownerID string, p MessageDeletedPayload) MessageDeletedEvent {
	return types.NewDomainEvent(MessageDeletedEventName, channelID, ownerID, p)
}

// ── message_delivered ───────────────────────────────────────────────────────────

// MessageDeliveredPayload — a recipient device received one or more messages.
// Timestamp is a watermark; MessageIDs carries the explicit platform ids.
type MessageDeliveredPayload struct {
	ChannelID  uuid.UUID        `json:"channelId"`
	RemoteID   string           `json:"remoteId"`
	SenderID   string           `json:"senderId"`
	MessageIDs []string         `json:"messageIds"`
	Timestamp  int64            `json:"timestamp"`
	Platform   wire.ChannelKind `json:"platform"`
	OwnerID    string           `json:"ownerId"`
}

type MessageDeliveredEvent = types.DomainEvent[MessageDeliveredPayload]

func NewMessageDeliveredEvent(channelID uuid.UUID, ownerID string, p MessageDeliveredPayload) MessageDeliveredEvent {
	return types.NewDomainEvent(MessageDeliveredEventName, channelID, ownerID, p)
}

// ── message_seen ────────────────────────────────────────────────────────────────

// MessageSeenPayload — messages in a chat were read/played. Self=true rows drive
// multi-device chat-seen sync.
type MessageSeenPayload struct {
	ChannelID  uuid.UUID        `json:"channelId"`
	RemoteID   string           `json:"remoteId"`
	SenderID   string           `json:"senderId"`
	MessageIDs []string         `json:"messageIds"`
	Timestamp  int64            `json:"timestamp"`
	Self       bool             `json:"self"`
	Platform   wire.ChannelKind `json:"platform"`
	OwnerID    string           `json:"ownerId"`
}

type MessageSeenEvent = types.DomainEvent[MessageSeenPayload]

func NewMessageSeenEvent(channelID uuid.UUID, ownerID string, p MessageSeenPayload) MessageSeenEvent {
	return types.NewDomainEvent(MessageSeenEventName, channelID, ownerID, p)
}

// ── remote_created ──────────────────────────────────────────────────────────────

// RemoteCreatedPayload — a Remote (contact/group/broadcast) was first observed.
// ContactKind is the harmonized type (USER->CONTACT).
type RemoteCreatedPayload struct {
	ChannelID   uuid.UUID        `json:"channelId"`
	RemoteID    string           `json:"remoteId"`
	ContactKind wire.ContactKind `json:"contactKind"`
	Platform    wire.ChannelKind `json:"platform"`
	OwnerID     string           `json:"ownerId"`
}

type RemoteCreatedEvent = types.DomainEvent[RemoteCreatedPayload]

func NewRemoteCreatedEvent(channelID uuid.UUID, ownerID string, p RemoteCreatedPayload) RemoteCreatedEvent {
	return types.NewDomainEvent(RemoteCreatedEventName, channelID, ownerID, p)
}

// ── remote_updated ──────────────────────────────────────────────────────────────

// RemoteUpdatedPayload — a remote's profile snapshot changed (rename, subject).
type RemoteUpdatedPayload struct {
	ChannelID   uuid.UUID        `json:"channelId"`
	RemoteID    string           `json:"remoteId"`
	ContactKind wire.ContactKind `json:"contactKind"`
	DisplayName string           `json:"displayName"`
	Description *string          `json:"description,omitempty"`
	ObservedAt  time.Time        `json:"observedAt"`
	OwnerID     string           `json:"ownerId"`
}

type RemoteUpdatedEvent = types.DomainEvent[RemoteUpdatedPayload]

func NewRemoteUpdatedEvent(channelID uuid.UUID, ownerID string, p RemoteUpdatedPayload) RemoteUpdatedEvent {
	return types.NewDomainEvent(RemoteUpdatedEventName, channelID, ownerID, p)
}

// ── remote_deleted ──────────────────────────────────────────────────────────────

// RemoteDeletedPayload — a remote was soft-deleted (contact removed / left).
type RemoteDeletedPayload struct {
	ChannelID uuid.UUID `json:"channelId"`
	RemoteID  string    `json:"remoteId"`
	DeletedAt time.Time `json:"deletedAt"`
	OwnerID   string    `json:"ownerId"`
}

type RemoteDeletedEvent = types.DomainEvent[RemoteDeletedPayload]

func NewRemoteDeletedEvent(channelID uuid.UUID, ownerID string, p RemoteDeletedPayload) RemoteDeletedEvent {
	return types.NewDomainEvent(RemoteDeletedEventName, channelID, ownerID, p)
}

// ── membership_added ────────────────────────────────────────────────────────────

// MembershipAddedPayload — a participant joined a group.
type MembershipAddedPayload struct {
	ChannelID uuid.UUID `json:"channelId"`
	GroupID   string    `json:"groupId"`
	MemberID  string    `json:"memberId"`
	IsAdmin   bool      `json:"isAdmin"`
	JoinedAt  time.Time `json:"joinedAt"`
	OwnerID   string    `json:"ownerId"`
}

type MembershipAddedEvent = types.DomainEvent[MembershipAddedPayload]

func NewMembershipAddedEvent(channelID uuid.UUID, ownerID string, p MembershipAddedPayload) MembershipAddedEvent {
	return types.NewDomainEvent(MembershipAddedEventName, channelID, ownerID, p)
}

// ── membership_removed ──────────────────────────────────────────────────────────

// MembershipRemovedPayload — a participant left (or was removed from) a group.
type MembershipRemovedPayload struct {
	ChannelID uuid.UUID `json:"channelId"`
	GroupID   string    `json:"groupId"`
	MemberID  string    `json:"memberId"`
	RemovedAt time.Time `json:"removedAt"`
	OwnerID   string    `json:"ownerId"`
}

type MembershipRemovedEvent = types.DomainEvent[MembershipRemovedPayload]

func NewMembershipRemovedEvent(channelID uuid.UUID, ownerID string, p MembershipRemovedPayload) MembershipRemovedEvent {
	return types.NewDomainEvent(MembershipRemovedEventName, channelID, ownerID, p)
}

// ── presence_updated ────────────────────────────────────────────────────────────

// PresenceUpdatedPayload — a contact's overall availability changed. Egress-only
// (no read-model table); bridges to integration.channel.presence_updated.
type PresenceUpdatedPayload struct {
	ChannelID   uuid.UUID `json:"channelId"`
	RemoteID    string    `json:"remoteId"`
	Unavailable bool      `json:"unavailable"`
	LastSeen    *int64    `json:"lastSeen,omitempty"`
	ObservedAt  time.Time `json:"observedAt"`
	OwnerID     string    `json:"ownerId"`
}

type PresenceUpdatedEvent = types.DomainEvent[PresenceUpdatedPayload]

func NewPresenceUpdatedEvent(channelID uuid.UUID, ownerID string, p PresenceUpdatedPayload) PresenceUpdatedEvent {
	return types.NewDomainEvent(PresenceUpdatedEventName, channelID, ownerID, p)
}

// ── chat_presence_updated ───────────────────────────────────────────────────────

// ChatPresenceUpdatedPayload — a typing/recording indicator inside a chat.
type ChatPresenceUpdatedPayload struct {
	ChannelID  uuid.UUID             `json:"channelId"`
	ChatID     string                `json:"chatId"`
	SenderID   string                `json:"senderId"`
	State      wire.ChatPresenceType `json:"state"`
	ObservedAt time.Time             `json:"observedAt"`
	OwnerID    string                `json:"ownerId"`
}

type ChatPresenceUpdatedEvent = types.DomainEvent[ChatPresenceUpdatedPayload]

func NewChatPresenceUpdatedEvent(channelID uuid.UUID, ownerID string, p ChatPresenceUpdatedPayload) ChatPresenceUpdatedEvent {
	return types.NewDomainEvent(ChatPresenceUpdatedEventName, channelID, ownerID, p)
}

// ── contacts_synced ─────────────────────────────────────────────────────────────

// ContactsSyncedPayload — one bootstrap contact-sync pass finished. Egress-only
// summary; bridges to integration.channel.remotes_synced.
type ContactsSyncedPayload struct {
	ChannelID uuid.UUID `json:"channelId"`
	Total     int32     `json:"total"`
	Inserted  int32     `json:"inserted"`
	OwnerID   string    `json:"ownerId"`
}

type ContactsSyncedEvent = types.DomainEvent[ContactsSyncedPayload]

func NewContactsSyncedEvent(channelID uuid.UUID, ownerID string, p ContactsSyncedPayload) ContactsSyncedEvent {
	return types.NewDomainEvent(ContactsSyncedEventName, channelID, ownerID, p)
}

// ── messages_synced ─────────────────────────────────────────────────────────────

// MessagesSyncedPayload — one HistorySync batch finished inserting message rows.
type MessagesSyncedPayload struct {
	ChannelID uuid.UUID `json:"channelId"`
	Total     int32     `json:"total"`
	Inserted  int32     `json:"inserted"`
	OwnerID   string    `json:"ownerId"`
}

type MessagesSyncedEvent = types.DomainEvent[MessagesSyncedPayload]

func NewMessagesSyncedEvent(channelID uuid.UUID, ownerID string, p MessagesSyncedPayload) MessagesSyncedEvent {
	return types.NewDomainEvent(MessagesSyncedEventName, channelID, ownerID, p)
}
