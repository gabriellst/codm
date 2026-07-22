// Package message is the read side + projection writes for the Message
// projection (gateway.messages). Mirrors the medscall channel message
// repository, adapted to the CodeDM `gateway` pg schema and the frozen wire
// enums.
package message

import (
	"context"
	"time"

	"template/api-go/internal/channel/projections"
)

// CursorOptions controls cursor-paginated message listings.
type CursorOptions struct {
	Limit  int
	Before *time.Time // occurred_at strict-less-than cursor
}

// MessageProjectionRepository is the read side + projection writes for the
// Message projection (gateway.messages).
//
// Reads return *projections.Message. Writes are a mix of whole-row Save
// (used by Edit/SoftDelete projectors), idempotent InsertIfNew (used by the
// live-message path), and bulk UpsertAllIfNew (used by the HistorySync
// bootstrap, where thousands of messages arrive in a batch).
//
// Not-found semantics: Find and FindByPlatformID return (nil, nil) when
// the message is absent.
type MessageProjectionRepository interface {
	// Reads
	Find(ctx context.Context, messageID string) (*projections.Message, error)
	FindByPlatformID(ctx context.Context, channelID, platformMessageID string) (*projections.Message, error)
	ListByRemote(ctx context.Context, channelID, remoteID string, opts CursorOptions) ([]*projections.Message, error)

	// Writes
	Save(ctx context.Context, msg *projections.Message) error
	InsertIfNew(ctx context.Context, msg *projections.Message) (inserted bool, err error)
	UpsertAllIfNew(ctx context.Context, msgs []*projections.Message) (insertedCount int, err error)

	// Atomic column updates (forward-only, used by receipt projectors)
	UpdateDelivered(ctx context.Context, messageID string, at time.Time) error
	UpdateSeen(ctx context.Context, messageID string, at time.Time) error

	// FindDistinctLIDRemoteIDs returns all distinct remote_ids in the messages
	// table for the given channel that are in LID form (@lid suffix).
	// Used by the post-sync normalization pass.
	FindDistinctLIDRemoteIDs(ctx context.Context, channelID string) ([]string, error)
	// RewriteRemoteIDs updates remote_id for all messages stored under a LID key
	// to the corresponding PN. lidToPN maps each LID string to its PN equivalent.
	// Returns the rewritten message rows so the caller can re-apply them to remote
	// projection columns (last_message_at, last_message_id).
	RewriteRemoteIDs(ctx context.Context, channelID string, lidToPN map[string]string) ([]*projections.Message, error)
}
