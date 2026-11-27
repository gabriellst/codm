package whatsapp

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
	"go.mau.fi/whatsmeow/types/events"

	mapperpkg "template/api-go/internal/channel/services/gateway/whatsapp/mapper"
)

// EnsureEditSchema makes sure gateway_messages has edited_at/version and that
// gateway_message_revisions exists. Idempotent and additive only (never drops
// or rewrites data); safe to call on every start.
func EnsureEditSchema(ctx context.Context, db *sql.DB) error {
	cols := map[string]bool{}
	rows, err := db.QueryContext(ctx, `PRAGMA table_info(gateway_messages)`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var (
			cid, notnull, pk int
			name, ctype      string
			dflt             sql.NullString
		)
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err != nil {
			rows.Close()
			return err
		}
		cols[name] = true
	}
	rows.Close()
	if len(cols) == 0 {
		return errors.New("gateway_messages table not found")
	}
	if !cols["edited_at"] {
		if _, err := db.ExecContext(ctx, `ALTER TABLE gateway_messages ADD COLUMN edited_at INTEGER`); err != nil {
			return err
		}
	}
	if !cols["version"] {
		if _, err := db.ExecContext(ctx, `ALTER TABLE gateway_messages ADD COLUMN version INTEGER NOT NULL DEFAULT 1`); err != nil {
			return err
		}
	}
	_, err = db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS gateway_message_revisions (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			message_id  TEXT    NOT NULL,              -- platform_message_id of the edited message
			remote_id   TEXT    NOT NULL,
			version     INTEGER NOT NULL,
			content     TEXT    NOT NULL,
			edited_at   INTEGER NOT NULL,              -- unix ms
			created_at  INTEGER NOT NULL,              -- unix ms (when the bridge stored it)
			found_original INTEGER NOT NULL DEFAULT 1, -- 0 = original message was not in gateway_messages
			UNIQUE (message_id, remote_id, version)
		);
		CREATE INDEX IF NOT EXISTS idx_message_revisions_msg ON gateway_message_revisions (message_id, remote_id);
		CREATE INDEX IF NOT EXISTS idx_message_revisions_edited ON gateway_message_revisions (edited_at);`)
	return err
}

// EditResult reports what ApplyMessageEdit did.
type EditResult struct {
	Version       int64
	FoundOriginal bool
	Duplicate     bool
}

// ApplyMessageEdit updates the original row (content, edited_at, version+1),
// located by platform_message_id + remote_id (falling back to the channel's
// unique platform_message_id when the remote form differs, e.g. LID vs PN),
// and records the revision. When the original is missing the revision is
// still stored (found_original=0). Redelivered identical edits are ignored.
func ApplyMessageEdit(ctx context.Context, db *sql.DB, channelID uuid.UUID, e mapperpkg.MessageEdit) (EditResult, error) {
	var res EditResult
	editedMs := e.EditedAt.UnixMilli()
	content := string(e.Content)
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return res, err
	}
	defer func() { _ = tx.Rollback() }()

	var dup int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM gateway_message_revisions
		WHERE message_id = ? AND remote_id = ? AND edited_at = ? AND content = ?`,
		e.TargetID, e.RemoteID, editedMs, content).Scan(&dup); err != nil {
		return res, err
	}
	if dup > 0 {
		res.Duplicate = true
		return res, nil
	}

	var rowID string
	err = tx.QueryRowContext(ctx, `SELECT id FROM gateway_messages
		WHERE platform_message_id = ? AND remote_id = ? ORDER BY occurred_at DESC LIMIT 1`,
		e.TargetID, e.RemoteID).Scan(&rowID)
	if errors.Is(err, sql.ErrNoRows) {
		err = tx.QueryRowContext(ctx, `SELECT id FROM gateway_messages
			WHERE platform_message_id = ? AND channel_id = ? LIMIT 1`, e.TargetID, channelID.String()).Scan(&rowID)
	}
	switch {
	case err == nil:
		res.FoundOriginal = true
		if _, err := tx.ExecContext(ctx, `UPDATE gateway_messages
			SET content = ?, edited_at = ?, version = COALESCE(version, 1) + 1 WHERE id = ?`,
			content, editedMs, rowID); err != nil {
			return res, err
		}
		if err := tx.QueryRowContext(ctx, `SELECT version FROM gateway_messages WHERE id = ?`, rowID).Scan(&res.Version); err != nil {
			return res, err
		}
	case errors.Is(err, sql.ErrNoRows):
		if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(version), 1) + 1 FROM gateway_message_revisions
			WHERE message_id = ? AND remote_id = ?`, e.TargetID, e.RemoteID).Scan(&res.Version); err != nil {
			return res, err
		}
	default:
		return res, err
	}
	found := 0
	if res.FoundOriginal {
		found = 1
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO gateway_message_revisions
		(message_id, remote_id, version, content, edited_at, created_at, found_original)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (message_id, remote_id, version) DO UPDATE SET content = excluded.content, edited_at = excluded.edited_at`,
		e.TargetID, e.RemoteID, res.Version, content, editedMs, time.Now().UnixMilli(), found); err != nil {
		return res, err
	}
	return res, tx.Commit()
}

// ReconcileEdit re-applies an edit when the original row appeared after the
// edit arrived (the original is projected asynchronously, so a fast "✻ …"
// edit can beat it) or when a stale write put the old content back. It never
// overrides a newer edit. Returns true when it changed the row.
func ReconcileEdit(ctx context.Context, db *sql.DB, channelID uuid.UUID, e mapperpkg.MessageEdit) (bool, error) {
	editedMs := e.EditedAt.UnixMilli()
	var (
		rowID, content string
		editedAt       sql.NullInt64
	)
	err := db.QueryRowContext(ctx, `SELECT id, content, edited_at FROM gateway_messages
		WHERE (platform_message_id = ? AND remote_id = ?) OR (platform_message_id = ? AND channel_id = ?)
		ORDER BY occurred_at DESC LIMIT 1`, e.TargetID, e.RemoteID, e.TargetID, channelID.String()).Scan(&rowID, &content, &editedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	switch {
	case editedAt.Valid && editedAt.Int64 > editedMs:
		return false, nil // a newer edit already won
	case editedAt.Valid && editedAt.Int64 == editedMs:
		if content == string(e.Content) {
			return false, nil
		}
		_, err = db.ExecContext(ctx, `UPDATE gateway_messages SET content = ? WHERE id = ?`, string(e.Content), rowID)
	default: // original arrived late (or edited_at reverted): apply now
		_, err = db.ExecContext(ctx, `UPDATE gateway_messages SET content = ?, edited_at = ?, version = COALESCE(version, 1) + 1 WHERE id = ?`,
			string(e.Content), editedMs, rowID)
	}
	if err != nil {
		return false, err
	}
	_, _ = db.ExecContext(ctx, `UPDATE gateway_message_revisions SET found_original = 1
		WHERE message_id = ? AND remote_id = ? AND edited_at = ?`, e.TargetID, e.RemoteID, editedMs)
	return true, nil
}

// editReconcileDelays: when to re-check an edit against its original row.
var editReconcileDelays = []time.Duration{3 * time.Second, 15 * time.Second, 60 * time.Second, 5 * time.Minute}

var (
	editSchemaMu sync.Mutex
	editSchemaOK bool
)

func ensureEditSchemaOnce(ctx context.Context, db *sql.DB) error {
	editSchemaMu.Lock()
	defer editSchemaMu.Unlock()
	if editSchemaOK {
		return nil
	}
	if err := EnsureEditSchema(ctx, db); err != nil {
		return err
	}
	editSchemaOK = true
	return nil
}

// handleEdit applies a WhatsApp edit event, if v is one. Returns true when v was an edit.
func (c *WhatsmeowChannel) handleEdit(v *events.Message) bool {
	e, ok := mapperpkg.DecodeEdit(c.device, v)
	if !ok {
		return false
	}
	if c.db == nil {
		slog.Warn("message edit ignored: no database", "messageId", e.TargetID)
		return true
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := ensureEditSchemaOnce(ctx, c.db); err != nil {
		slog.Warn("message edit schema unavailable", "error", err)
		return true
	}
	var res EditResult
	err := persistWithRetry(func() error {
		var err error
		res, err = ApplyMessageEdit(ctx, c.db, c.instanceID, e)
		return err
	}, time.Sleep)
	if err != nil {
		slog.Warn("message edit not stored", "messageId", e.TargetID, "remote", e.RemoteID, "error", err)
		return true
	}
	slog.Info("message edit stored", "messageId", e.TargetID, "remote", e.RemoteID,
		"version", res.Version, "foundOriginal", res.FoundOriginal, "duplicate", res.Duplicate)
	if !res.Duplicate {
		go c.reconcileEdit(e)
	}
	return true
}

func (c *WhatsmeowChannel) reconcileEdit(e mapperpkg.MessageEdit) {
	stop := c.stopCtx
	if stop == nil {
		stop = context.Background()
	}
	for _, d := range editReconcileDelays {
		select {
		case <-stop.Done():
			return
		case <-time.After(d):
		}
		ctx, cancel := context.WithTimeout(stop, 15*time.Second)
		changed, err := ReconcileEdit(ctx, c.db, c.instanceID, e)
		cancel()
		if err != nil {
			slog.Warn("message edit reconcile failed", "messageId", e.TargetID, "error", err)
			continue
		}
		if changed {
			slog.Info("message edit reconciled", "messageId", e.TargetID, "after", d.String())
		}
	}
}
