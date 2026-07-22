// Package dbutil provides lightweight SQL scan/bind helpers shared across all
// channel repository implementations. It exists solely to eliminate the
// copy-pasted toNullTime / toMsgNullTime / nullString family that lived in
// every repository file.
package dbutil

import (
	"database/sql"
	"time"
)

// NullTime converts a *time.Time pointer to sql.NullTime.
// A nil pointer produces an invalid (NULL) NullTime.
func NullTime(t *time.Time) sql.NullTime {
	if t == nil {
		return sql.NullTime{}
	}
	return sql.NullTime{Time: t.UTC(), Valid: true}
}

// TimePtr converts a sql.NullTime to a *time.Time pointer.
// An invalid (NULL) NullTime produces nil.
func TimePtr(nt sql.NullTime) *time.Time {
	if !nt.Valid {
		return nil
	}
	t := nt.Time.UTC()
	return &t
}

// NullStr converts a string to sql.NullString, treating the empty string as
// SQL NULL. This matches the project-wide convention where "" represents the
// absent state instead of sql.NullString (e.g., AvatarURL, Name).
func NullStr(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

// NullStrPtr converts a *string to sql.NullString.
// A nil pointer produces an invalid (NULL) NullString.
func NullStrPtr(s *string) sql.NullString {
	if s == nil {
		return sql.NullString{}
	}
	return sql.NullString{String: *s, Valid: true}
}
