package dbutil

import (
	"database/sql"
	"time"
)

// SQLite-dialect bind/scan helpers.
//
// The SQLite contract schema (packages/contracts/db/schema-sqlite) stores every
// timestamptz as an INTEGER of unix MILLISECONDS (drizzle `timestamp_ms`) and
// every boolean as an INTEGER 0/1. These helpers are the single conversion point
// between that wire shape and the Go domain types, so no repository hand-rolls a
// `t.UnixMilli()` and no scan silently drops the UTC normalization.
//
// Millisecond precision is lossy against time.Time: a value that survives a
// round-trip must already be millisecond-truncated. Callers that compare an
// input timestamp to what came back out (tests, forward-only guards) should
// truncate to time.Millisecond first.

// Millis converts a time.Time to the INTEGER unix-millis the SQLite schema
// stores. The value is normalized to UTC first.
func Millis(t time.Time) int64 { return t.UTC().UnixMilli() }

// TimeFromMillis converts a stored INTEGER unix-millis back to a UTC time.Time.
func TimeFromMillis(ms int64) time.Time { return time.UnixMilli(ms).UTC() }

// NullMillis converts a *time.Time to the nullable INTEGER column shape.
// A nil pointer produces SQL NULL.
func NullMillis(t *time.Time) sql.NullInt64 {
	if t == nil {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: Millis(*t), Valid: true}
}

// TimePtrFromMillis converts a nullable INTEGER unix-millis column to a
// *time.Time. A NULL produces nil.
func TimePtrFromMillis(v sql.NullInt64) *time.Time {
	if !v.Valid {
		return nil
	}
	t := TimeFromMillis(v.Int64)
	return &t
}

// BoolToInt maps a Go bool onto the INTEGER 0/1 a SQLite boolean column holds.
// Bound explicitly rather than relying on driver-side bool coercion.
func BoolToInt(b bool) int64 {
	if b {
		return 1
	}
	return 0
}

// IntToBool maps a stored INTEGER boolean back to a Go bool (non-zero is true).
func IntToBool(i int64) bool { return i != 0 }
