package triage

import (
	"context"
	"database/sql"
	"log/slog"
	"sync/atomic"
	"time"

	"template/core-go/db/sqlite"
)

// SentLog records message IDs returned by POST /send so the webhook can
// skip the WhatsApp echo of those sends (needed once FORWARD_FROM_ME is on,
// or a command loop is born). The table lives in the same SQLite file as the
// rest of the gateway, so it survives process restarts.
type SentLog struct {
	db       *sql.DB
	inflight atomic.Int32
}

const sentLogRetention = 7 * 24 * time.Hour

func NewSentLog(store *sqlite.SqliteStore) (*SentLog, error) {
	db := store.DB()
	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS triage_bridge_sends (
			message_id TEXT PRIMARY KEY NOT NULL,
			created_at INTEGER NOT NULL
		)
	`); err != nil {
		return nil, err
	}
	if _, err := db.Exec(`CREATE INDEX IF NOT EXISTS triage_bridge_sends_created_at ON triage_bridge_sends (created_at)`); err != nil {
		return nil, err
	}
	return &SentLog{db: db}, nil
}

// newSentLogDB is for tests that don't boot the full store.
func newSentLogDB(db *sql.DB) (*SentLog, error) {
	s := &SentLog{db: db}
	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS triage_bridge_sends (
			message_id TEXT PRIMARY KEY NOT NULL,
			created_at INTEGER NOT NULL
		)
	`); err != nil {
		return nil, err
	}
	return s, nil
}

// BeginSend / EndSend bracket a POST /send so an echo that arrives before
// Remember can still be recognized (the webhook waits briefly while a send
// is in flight).
func (s *SentLog) BeginSend() { s.inflight.Add(1) }
func (s *SentLog) EndSend()   { s.inflight.Add(-1) }

func (s *SentLog) Remember(ctx context.Context, id string) {
	if s == nil || id == "" {
		return
	}
	now := time.Now().Unix()
	if _, err := s.db.ExecContext(ctx,
		`INSERT OR IGNORE INTO triage_bridge_sends (message_id, created_at) VALUES (?, ?)`,
		id, now,
	); err != nil {
		slog.Error("triage: failed to record /send message id — echo may be forwarded", "messageId", id, "error", err)
		return
	}
	if _, err := s.db.ExecContext(ctx,
		`DELETE FROM triage_bridge_sends WHERE created_at < ?`,
		time.Now().Add(-sentLogRetention).Unix(),
	); err != nil {
		slog.Warn("triage: failed to prune /send message ids", "error", err)
	}
}

func (s *SentLog) Has(ctx context.Context, id string) bool {
	if s == nil || id == "" {
		return false
	}
	var one int
	err := s.db.QueryRowContext(ctx,
		`SELECT 1 FROM triage_bridge_sends WHERE message_id = ?`, id,
	).Scan(&one)
	return err == nil
}

// OwnSend reports whether this message ID was returned by our POST /send.
// When a send is in flight and the id is not yet recorded, it waits up to
// wait so an early WhatsApp echo is not forwarded.
func (s *SentLog) OwnSend(ctx context.Context, id string, wait time.Duration) bool {
	if s.Has(ctx, id) {
		return true
	}
	if s == nil || s.inflight.Load() <= 0 || wait <= 0 {
		return false
	}
	deadline := time.Now().Add(wait)
	ticker := time.NewTicker(40 * time.Millisecond)
	defer ticker.Stop()
	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return s.Has(ctx, id)
		case <-ticker.C:
			if s.Has(ctx, id) {
				return true
			}
			if s.inflight.Load() <= 0 {
				return s.Has(ctx, id)
			}
		}
	}
	return s.Has(ctx, id)
}
