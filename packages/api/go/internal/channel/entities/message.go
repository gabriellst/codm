package entities

import (
	"encoding/json"
	"time"

	channelenums "template/api-go/internal/channel/enums"
	ctxerrors "template/api-go/internal/channel/errors"
	ctxevents "template/api-go/internal/channel/events"
	"template/core-go/entities"
	"template/core-go/errors"

	"github.com/google/uuid"
)

// Message is the aggregate root for a single message within a channel remote.
//
// The aggregate carries invariant-bearing fields plus the extra platform-specific
// fields (senderRemoteID, platform, messageType) needed so behavior methods can emit
// the existing gateway-level events (channel.message_edited, channel.message_deleted)
// with complete payloads. These extra fields are NOT invariants — they are carried
// only for event-payload composition.
type Message struct {
	entities.BaseEntity
	channelID         uuid.UUID
	remoteID          string
	platformMessageID string
	direction         channelenums.Direction
	content           json.RawMessage
	ownerID           string
	occurredAt        time.Time
	editedAt          *time.Time
	deletedAt         *time.Time
	// Extra fields for event-payload composition (not invariants).
	senderRemoteID string
	platform       channelenums.Platform
	messageType    channelenums.MessageType
}

// Accessors — exported read-only getters for repository hydration and use cases.

func (m *Message) ChannelID() uuid.UUID                  { return m.channelID }
func (m *Message) RemoteID() string                      { return m.remoteID }
func (m *Message) PlatformMessageID() string             { return m.platformMessageID }
func (m *Message) Direction() channelenums.Direction     { return m.direction }
func (m *Message) Content() json.RawMessage              { return m.content }
func (m *Message) OwnerID() string                       { return m.ownerID }
func (m *Message) OccurredAt() time.Time                 { return m.occurredAt }
func (m *Message) EditedAt() *time.Time                  { return m.editedAt }
func (m *Message) DeletedAt() *time.Time                 { return m.deletedAt }
func (m *Message) Platform() channelenums.Platform       { return m.platform }
func (m *Message) MessageType() channelenums.MessageType { return m.messageType }

// ---------------------------------------------------------------------------
// Reconstruction (no events, no validation)
// ---------------------------------------------------------------------------

// ReconstructMessageParams are the parameters for hydrating a Message from persistence.
type ReconstructMessageParams struct {
	ID                uuid.UUID
	ChannelID         uuid.UUID
	RemoteID          string
	PlatformMessageID string
	Direction         channelenums.Direction
	Content           json.RawMessage
	OwnerID           string
	OccurredAt        time.Time
	EditedAt          *time.Time
	DeletedAt         *time.Time
	CreatedAt         time.Time
	UpdatedAt         time.Time
	Version           int
	SenderRemoteID    string
	Platform          channelenums.Platform
	MessageType       channelenums.MessageType
}

// ReconstructMessage recreates a Message from persistence — no events, no validation.
func ReconstructMessage(params ReconstructMessageParams) *Message {
	return &Message{
		BaseEntity:        entities.ReconstructBaseEntity(entities.ReconstructBaseEntityParams{ID: params.ID, CreatedAt: params.CreatedAt, UpdatedAt: params.UpdatedAt, Version: params.Version}),
		channelID:         params.ChannelID,
		remoteID:          params.RemoteID,
		platformMessageID: params.PlatformMessageID,
		direction:         params.Direction,
		content:           params.Content,
		ownerID:           params.OwnerID,
		occurredAt:        params.OccurredAt,
		editedAt:          params.EditedAt,
		deletedAt:         params.DeletedAt,
		senderRemoteID:    params.SenderRemoteID,
		platform:          params.Platform,
		messageType:       params.MessageType,
	}
}

// ---------------------------------------------------------------------------
// Behavior methods
// ---------------------------------------------------------------------------

// Edit replaces the message content with newContent at the given time.
// Invariant: not deleted.
func (m *Message) Edit(newContent json.RawMessage, at time.Time) error {
	if m.deletedAt != nil {
		return errors.NewBaseError(ctxerrors.CodeMessageDeleted, "cannot edit a deleted message")
	}

	m.content = newContent
	m.editedAt = &at
	m.IncrementVersion()
	m.AddDomainEvent(ctxevents.NewMessageEditedEvent(
		m.ID.UUID(),
		m.ownerID,
		ctxevents.ChannelMessageEditedPayload{
			ChannelID:   m.channelID,
			MessageID:   m.platformMessageID,
			RemoteID:    m.remoteID,
			SenderID:    m.senderRemoteID,
			Timestamp:   at.Unix(),
			MessageType: m.messageType,
			Content:     newContent,
			Platform:    m.platform,
			OwnerID:     m.ownerID,
		},
	))
	return nil
}

// SoftDelete marks the message as deleted at the given time.
// Invariant: not already deleted.
func (m *Message) SoftDelete(at time.Time) error {
	if m.deletedAt != nil {
		return errors.NewBaseError(ctxerrors.CodeMessageAlreadyDeleted, "message is already deleted")
	}

	m.deletedAt = &at
	m.IncrementVersion()
	m.AddDomainEvent(ctxevents.NewMessageDeletedEvent(
		m.ID.UUID(),
		m.ownerID,
		ctxevents.ChannelMessageDeletedPayload{
			ChannelID: m.channelID,
			MessageID: m.platformMessageID,
			RemoteID:  m.remoteID,
			Platform:  m.platform,
			OwnerID:   m.ownerID,
		},
	))
	return nil
}
