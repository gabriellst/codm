// Package remote is the read side + projection writes for the Remote projection
// (gateway.remotes + gateway.remote_memberships). Mirrors the medscall channel
// remote repository, adapted to the CodeDM `gateway` pg schema and the frozen
// wire enums.
package remote

import (
	"context"
	"time"

	"template/api-go/internal/channel/projections"
	"template/contracts-go/wire"
)

// ListOptions controls pagination for remote listings.
type ListOptions struct {
	Limit      int
	Cursor     *time.Time       // cursor pagination on last_message_at (null means first page)
	Search     string           // optional substring match on Name
	Type       wire.ContactKind // empty = any type (harmonized ContactKind: CONTACT/GROUP/BROADCAST)
	OnlyPinned bool
}

// MembershipRow represents a group membership to be upserted.
type MembershipRow struct {
	MemberID string
	IsAdmin  bool
	JoinedAt time.Time
}

// RemoteProjectionRepository is the read side + projection writes for the
// Remote projection (gateway.remotes + gateway.remote_memberships).
//
// Reads return *projections.Remote. Writes are either whole-row Save/UpsertAll
// (projector read-modify-write) or atomic column operations for concurrent-safe
// mutations like counter bumps.
//
// Not-found semantics: Find returns (nil, nil); FindAllByChannel returns an
// empty map (not nil) when the channel has no remotes.
type RemoteProjectionRepository interface {
	// Reads
	Find(ctx context.Context, channelID, remoteID string) (*projections.Remote, error)
	List(ctx context.Context, channelID string, opts ListOptions) ([]*projections.Remote, error)
	FindAllByChannel(ctx context.Context, channelID string) (map[string]*projections.Remote, error)

	// Whole-row writes (projector-friendly)
	Save(ctx context.Context, remote *projections.Remote) error
	// InsertIfNew inserts the Remote projection row only when no row with the
	// same (channel_id, remote_id) exists. Returns inserted=true when a row was
	// created, inserted=false on conflict (DO NOTHING). Used by the
	// RemoteCreatedProjector to ensure first-write-wins semantics so that a
	// late-arriving remote_created event never overwrites fields populated by
	// an earlier remote_updated or remotes_synced event.
	InsertIfNew(ctx context.Context, remote *projections.Remote) (inserted bool, err error)
	UpsertAll(ctx context.Context, remotes []*projections.Remote) error
	// UpsertContactSnapshot upserts contact-owned fields (name, avatar_url) only.
	// On conflict, only name, avatar_url, and updated_at are updated —
	// derived fields (last_message_at, last_message_id, unread_message_count,
	// pinned_at, archived, etc.) are preserved from the existing row.
	UpsertContactSnapshot(ctx context.Context, remotes []*projections.Remote) error

	// Atomic column mutations (concurrency-safe, avoid read-modify-write races)
	ResetUnreadCount(ctx context.Context, channelID, remoteID string) error

	// Apply* methods — fold message facts into the Remote projection's derived
	// fields. Preview columns (last_message_id, last_message_at) move forward-only
	// by occurred_at; unread_message_count bumps on received for live messages only.
	// The incoming_count is derived from msg.Direction (received=1, sent=0) inside
	// the repo implementation.
	ApplyLatestMessage(ctx context.Context, msg *projections.Message) error
	// ApplyHistoricalMessages folds a batch of historical message facts into the
	// Remote projection. Preview columns (last_message_id, last_message_at) move
	// forward-only. Unread count is NOT bumped — historical messages are treated
	// as already read.
	ApplyHistoricalMessages(ctx context.Context, msgs []*projections.Message) error

	// RecomputePreviewIfLatest clears or recomputes the preview columns when the
	// currently-referenced message is deleted. No-op when the remote has already
	// advanced past expectedMessageID.
	RecomputePreviewIfLatest(ctx context.Context, channelID, remoteID, expectedMessageID string) error

	// BackfillLastMessagePreview populates last_message_at and last_message_id for
	// remote rows that still have NULL last_message_at but have messages in the
	// messages table. Used once after projectContactSnapshot creates remote rows
	// that ApplyHistoricalMessages couldn't update (rows didn't exist yet at
	// history-sync time).
	BackfillLastMessagePreview(ctx context.Context, channelID string) error

	// Membership management (for group remotes)
	UpdateMembership(ctx context.Context, channelID, groupID string, members []MembershipRow) error
	// AddMember upserts a single member into the group membership projection.
	// Safe under concurrent calls: uses INSERT … ON CONFLICT DO UPDATE.
	AddMember(ctx context.Context, channelID, groupID string, member MembershipRow) error
	// RemoveMember deletes a single member from the group membership projection.
	RemoveMember(ctx context.Context, channelID, groupID, memberID string) error

	// BulkUpdateMemberships replaces all group memberships for a channel in one
	// round-trip: DELETE all existing rows then batch-INSERT the new set.
	// The map key is the group remote_id; value is the list of members.
	BulkUpdateMemberships(ctx context.Context, channelID string, groups map[string][]MembershipRow) error

	// UpdateAvatar sets avatar_url on a single remote row.
	// No-op when the row does not exist.
	UpdateAvatar(ctx context.Context, channelID, remoteID, avatarURL string) error
}
