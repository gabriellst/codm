// CONTEXT-ORIGIN: medscall/software/monorepo/packages/channel@ff66dbb1ee0fcd6212e5bf68879fa1d5a0a9cd1b (2026-07-20)
// Source path: packages/channel/internal/channel/projections/message.go
// Harvested verbatim for the projection skill exemplar set — do not edit; re-harvest instead.
package projections

import (
	"encoding/json"
	"time"

	sharedenums "monorepo/api/internal/shared/enums"
)

// Message is a pure read-model record that mirrors the messages
// projection table. It is written by the messageProjector and read directly
// by query handlers. No domain logic, no invariants, no events.
//
// Content is stored as JSONB in Postgres and represented as json.RawMessage
// here, consistent with how the channel entity and event repository handle
// JSONB payloads throughout the codebase.
type Message struct {
	ID                string          `db:"id"`
	ChannelID         string          `db:"channel_id"`
	RemoteID          string          `db:"remote_id"`
	PlatformMessageID string          `db:"platform_message_id"`
	Direction         string          `db:"direction"`
	Platform          sharedenums.Platform `db:"platform"`
	SenderRemoteID    string          `db:"sender_remote_id"`
	Content           json.RawMessage `db:"content"`
	OccurredAt        time.Time       `db:"occurred_at"`
	ObservedAt        time.Time       `db:"observed_at"`
	DeliveredAt       *time.Time      `db:"delivered_at"`
	SeenAt            *time.Time      `db:"seen_at"`
	EditedAt          *time.Time      `db:"edited_at"`
	DeletedAt         *time.Time      `db:"deleted_at"`
	Version           int64           `db:"version"`
}

// ApplyDelivered advances DeliveredAt when the delivery receipt arrives.
// Only moves forward — out-of-order receipts are ignored.
func (m *Message) ApplyDelivered(at time.Time) {
	if m.DeliveredAt == nil || at.After(*m.DeliveredAt) {
		m.DeliveredAt = &at
	}
}

// ApplySeen advances SeenAt when the seen receipt arrives.
// Only moves forward — out-of-order receipts are ignored.
func (m *Message) ApplySeen(at time.Time) {
	if m.SeenAt == nil || at.After(*m.SeenAt) {
		m.SeenAt = &at
	}
}

// ApplyEdited replaces the message content and records when the edit occurred.
func (m *Message) ApplyEdited(newContent json.RawMessage, at time.Time) {
	m.Content = newContent
	m.EditedAt = &at
}

// ApplySoftDelete records when the message was deleted without removing the row.
func (m *Message) ApplySoftDelete(at time.Time) {
	m.DeletedAt = &at
}
