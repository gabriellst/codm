// CONTEXT-ORIGIN: medscall/software/monorepo/packages/channel@ff66dbb1ee0fcd6212e5bf68879fa1d5a0a9cd1b (2026-07-20)
// Source path: packages/channel/internal/channel/projections/remote.go
// Harvested verbatim for the projection skill exemplar set — do not edit; re-harvest instead.
package projections

import (
	"time"

	sharedenums "monorepo/api/internal/shared/enums"
)

// Remote is a pure read-model record that mirrors the remotes
// projection table. It is written by the remoteProjector and read directly
// by query handlers. No domain logic, no invariants, no events.
//
// AvatarURL uses an empty string to represent the NULL/absent state, consistent
// with how other TEXT columns in the codebase avoid sql.NullString.
type Remote struct {
	ChannelID          string     `db:"channel_id"`
	RemoteID           string     `db:"remote_id"`
	Type               string     `db:"type"`
	Platform           sharedenums.Platform `db:"platform"`
	Name               string     `db:"name"`
	AvatarURL          string     `db:"avatar_url"`
	IsBlocked          bool       `db:"is_blocked"`
	PinnedAt           *time.Time `db:"pinned_at"`
	Archived           bool       `db:"archived"`
	MuteExpiration     *time.Time `db:"mute_expiration"`
	MarkedAsUnread     bool       `db:"marked_as_unread"`
	UnreadMessageCount int        `db:"unread_message_count"`
	LastMessageAt      *time.Time `db:"last_message_at"`
	LastMessageID      *string    `db:"last_message_id"`
	DeletedAt          *time.Time `db:"deleted_at"`
	CreatedAt          time.Time  `db:"created_at"`
	UpdatedAt          time.Time  `db:"updated_at"`
	Version            int64      `db:"version"`
}

// ApplyMessageReceived bumps the unread counter and advances the preview
// pointers when a new inbound message arrives. Preview columns
// (LastMessageAt, LastMessageID) only move forward — out-of-order events
// do not roll them back.
func (r *Remote) ApplyMessageReceived(messageID string, occurredAt time.Time) {
	r.UnreadMessageCount++
	if r.LastMessageAt == nil || occurredAt.After(*r.LastMessageAt) {
		r.LastMessageAt = &occurredAt
		r.LastMessageID = &messageID
	}
}

// ApplyMessageSent advances the preview pointers for outbound messages.
// The unread counter is not touched — we sent it, so we have already read it.
func (r *Remote) ApplyMessageSent(messageID string, occurredAt time.Time) {
	if r.LastMessageAt == nil || occurredAt.After(*r.LastMessageAt) {
		r.LastMessageAt = &occurredAt
		r.LastMessageID = &messageID
	}
}

// ApplyChatSeen clears the unread state. Called when the user opens the chat.
func (r *Remote) ApplyChatSeen() {
	r.UnreadMessageCount = 0
	r.MarkedAsUnread = false
}

// ApplyPinned records the pin timestamp.
func (r *Remote) ApplyPinned(at time.Time) {
	r.PinnedAt = &at
}

// ApplyUnpinned clears the pin timestamp.
func (r *Remote) ApplyUnpinned() {
	r.PinnedAt = nil
}

// ApplyArchived marks the remote as archived.
func (r *Remote) ApplyArchived() {
	r.Archived = true
}

// ApplyUnarchived clears the archived flag.
func (r *Remote) ApplyUnarchived() {
	r.Archived = false
}

// ApplyMuted sets the mute expiration deadline.
func (r *Remote) ApplyMuted(until time.Time) {
	r.MuteExpiration = &until
}

// ApplyUnmuted clears the mute expiration.
func (r *Remote) ApplyUnmuted() {
	r.MuteExpiration = nil
}

// ApplyMarkedAsUnread sets the manual unread flag.
func (r *Remote) ApplyMarkedAsUnread() {
	r.MarkedAsUnread = true
}

// ApplyMirrorDiff updates the fields owned by the external system (WhatsApp).
// Called by the bootstrap ACL after diffing against the incoming contact list.
func (r *Remote) ApplyMirrorDiff(name, avatarURL string, isBlocked bool) {
	r.Name = name
	r.AvatarURL = avatarURL
	r.IsBlocked = isBlocked
}
