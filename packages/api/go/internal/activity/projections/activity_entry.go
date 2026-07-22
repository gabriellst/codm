// Package projections provides the ActivityEntry read model.
package projections

import "time"

// ActivityEntry is a pure read-model record that mirrors activity.activity_entries.
// It is written by the ActivityEntryProjector and read by the ListActivity query
// use case. No domain logic, no invariants, no events raised.
//
// One row per logical fact — (OwnerID, EventName, EntityID). Redeliveries of the
// same occurrence are idempotent; genuinely new occurrences of the same fact
// advance LastOccurredAt (forward-only) and bump OccurrenceCount instead of
// inserting a new row.
type ActivityEntry struct {
	ID              string    `db:"id"`
	OwnerID         string    `db:"owner_id"`
	EventName       string    `db:"event_name"`
	EntityID        string    `db:"entity_id"`
	FirstOccurredAt time.Time `db:"first_occurred_at"`
	LastOccurredAt  time.Time `db:"last_occurred_at"`
	OccurrenceCount int64     `db:"occurrence_count"`
	RecordedAt      time.Time `db:"recorded_at"`
	Version         int64     `db:"version"`
}

// ApplyOccurrence records a new occurrence of the same logical fact.
// Only moves forward — a redelivery or out-of-order occurrence
// (at <= LastOccurredAt) is ignored, keeping the projector idempotent.
func (e *ActivityEntry) ApplyOccurrence(at time.Time) {
	if !at.After(e.LastOccurredAt) {
		return
	}
	e.LastOccurredAt = at
	e.OccurrenceCount++
}
