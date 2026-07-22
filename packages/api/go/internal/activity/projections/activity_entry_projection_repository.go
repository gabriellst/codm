package projections

import (
	"context"
	"time"
)

// CursorOptions controls cursor-paginated activity listings.
type CursorOptions struct {
	Limit  int
	Before *time.Time // last_occurred_at strict-less-than cursor
}

// ActivityEntryProjectionRepository is the read side + projection writes for the
// ActivityEntry projection (activity.activity_entries).
//
// Writes follow the projection canon: idempotent InsertIfNew for creation and
// whole-row Save for the find → ApplyOccurrence → save mutation path. No atomic
// ops — nothing here triggers hot-row, bulk, or monotonic-SQL justifications
// (the forward-only guard lives in ActivityEntry.ApplyOccurrence).
//
// Not-found semantics: FindByKey returns (nil, nil) when the entry is absent.
type ActivityEntryProjectionRepository interface {
	// Reads
	FindByKey(ctx context.Context, ownerID, eventName, entityID string) (*ActivityEntry, error)
	ListByOwner(ctx context.Context, ownerID string, opts CursorOptions) ([]*ActivityEntry, error)

	// Writes
	Save(ctx context.Context, entry *ActivityEntry) error
	InsertIfNew(ctx context.Context, entry *ActivityEntry) (inserted bool, err error)
}
