package message

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"template/api-go/internal/channel/enums"
	"template/api-go/internal/channel/projections"
	"template/core-go/db/dbutil"
	"template/core-go/services/unitofwork"
)

// PgMessageProjectionRepository implements MessageProjectionRepository with
// Postgres. It stores and retrieves Message projection rows from the
// `messages` table.
//
// InsertIfNew and UpsertAllIfNew use ON CONFLICT DO NOTHING to provide
// idempotent insert semantics for the live-message and history-sync paths.
// UpdateDelivered and UpdateSeen use GREATEST to ensure forward-only semantics.
type PgMessageProjectionRepository struct {
	db *sql.DB
}

// NewPgMessageProjectionRepository constructs the read/projection-write repository.
func NewPgMessageProjectionRepository(db *sql.DB) *PgMessageProjectionRepository {
	return &PgMessageProjectionRepository{db: db}
}

// compile-time interface satisfaction check.
var _ MessageProjectionRepository = (*PgMessageProjectionRepository)(nil)

// msgChunkSize limits rows per batch INSERT to stay well under Postgres'
// 65535-parameter limit. messages has 15 columns × 500 = 7500 params.
const msgChunkSize = 500

// -------------------------------------------------------------------------------
// Reads
// -------------------------------------------------------------------------------

// Find returns the Message projection for the given messageID.
// Returns (nil, nil) when no row exists.
func (r *PgMessageProjectionRepository) Find(ctx context.Context, messageID string) (*projections.Message, error) {
	db := r.txOrDB(ctx)

	row := db.QueryRowContext(ctx,
		`SELECT id, channel_id, remote_id, platform_message_id, direction, platform,
		        sender_remote_id, content, occurred_at, observed_at,
		        delivered_at, seen_at, edited_at, deleted_at, version
		 FROM messages
		 WHERE id = $1`,
		messageID,
	)

	msg, err := scanMessage(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("pg message projection repo: find: %w", err)
	}
	return msg, nil
}

// FindByPlatformID returns the Message projection for the given
// (channelID, platformMessageID) pair.
// Returns (nil, nil) when no row exists.
func (r *PgMessageProjectionRepository) FindByPlatformID(ctx context.Context, channelID, platformMessageID string) (*projections.Message, error) {
	db := r.txOrDB(ctx)

	row := db.QueryRowContext(ctx,
		`SELECT id, channel_id, remote_id, platform_message_id, direction, platform,
		        sender_remote_id, content, occurred_at, observed_at,
		        delivered_at, seen_at, edited_at, deleted_at, version
		 FROM messages
		 WHERE channel_id = $1 AND platform_message_id = $2`,
		channelID, platformMessageID,
	)

	msg, err := scanMessage(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("pg message projection repo: find by platform id: %w", err)
	}
	return msg, nil
}

// ListByRemote returns a cursor-paginated slice of Message projections for the
// given (channelID, remoteID). When opts.Before is set, only messages with
// occurred_at strictly before that time are returned (forward-compatible cursor).
func (r *PgMessageProjectionRepository) ListByRemote(ctx context.Context, channelID, remoteID string, opts CursorOptions) ([]*projections.Message, error) {
	db := r.txOrDB(ctx)

	args := []any{channelID, remoteID}
	where := "channel_id = $1 AND remote_id = $2"

	if opts.Before != nil {
		args = append(args, opts.Before.UTC())
		where += fmt.Sprintf(" AND occurred_at < $%d", len(args))
	}

	limit := opts.Limit
	if limit <= 0 {
		limit = 50
	}
	args = append(args, limit)

	q := fmt.Sprintf(
		`SELECT id, channel_id, remote_id, platform_message_id, direction, platform,
		        sender_remote_id, content, occurred_at, observed_at,
		        delivered_at, seen_at, edited_at, deleted_at, version
		 FROM messages
		 WHERE %s
		 ORDER BY occurred_at DESC, observed_at DESC
		 LIMIT $%d`,
		where, len(args),
	)

	rows, err := db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("pg message projection repo: list by remote: %w", err)
	}
	defer rows.Close()

	return scanMessageRows(rows)
}

// -------------------------------------------------------------------------------
// Whole-row writes
// -------------------------------------------------------------------------------

// Save upserts the full Message projection row.
func (r *PgMessageProjectionRepository) Save(ctx context.Context, msg *projections.Message) error {
	db := r.txOrDB(ctx)
	return upsertMessageRow(ctx, db, msg)
}

// InsertIfNew inserts the Message projection row only when no row with the same
// (channel_id, platform_message_id) exists. Returns inserted=true when a row
// was created, inserted=false on conflict.
func (r *PgMessageProjectionRepository) InsertIfNew(ctx context.Context, msg *projections.Message) (bool, error) {
	db := r.txOrDB(ctx)

	var id string
	err := db.QueryRowContext(ctx,
		`INSERT INTO messages
		   (id, channel_id, remote_id, platform_message_id, direction, platform,
		    sender_remote_id, content, occurred_at, observed_at,
		    delivered_at, seen_at, edited_at, deleted_at, version)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
		 ON CONFLICT (channel_id, platform_message_id) DO NOTHING
		 RETURNING id`,
		msg.ID, msg.ChannelID, msg.RemoteID, msg.PlatformMessageID,
		msg.Direction, string(msg.Platform), msg.SenderRemoteID, []byte(msg.Content),
		msg.OccurredAt.UTC(), msg.ObservedAt.UTC(),
		dbutil.NullTime(msg.DeliveredAt), dbutil.NullTime(msg.SeenAt),
		dbutil.NullTime(msg.EditedAt), dbutil.NullTime(msg.DeletedAt), msg.Version,
	).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		// ON CONFLICT DO NOTHING — no row returned means conflict.
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("pg message projection repo: insert if new: %w", err)
	}
	return true, nil
}

// UpsertAllIfNew batch-inserts Message projection rows with ON CONFLICT DO
// NOTHING. Returns the number of rows actually inserted. Processes records in
// chunks of 500 to stay under Postgres' 65535-parameter limit.
func (r *PgMessageProjectionRepository) UpsertAllIfNew(ctx context.Context, msgs []*projections.Message) (int, error) {
	if len(msgs) == 0 {
		return 0, nil
	}

	db := r.txOrDB(ctx)
	total := 0

	for start := 0; start < len(msgs); start += msgChunkSize {
		end := start + msgChunkSize
		if end > len(msgs) {
			end = len(msgs)
		}
		n, err := upsertMessageChunkIfNew(ctx, db, msgs[start:end])
		if err != nil {
			return total, err
		}
		total += n
	}
	slog.Debug("messages inserted", "count", total, "batch_size", len(msgs))
	return total, nil
}

func upsertMessageChunkIfNew(ctx context.Context, db msgQueryExecContext, chunk []*projections.Message) (int, error) {
	values := make([]string, 0, len(chunk))
	args := make([]any, 0, len(chunk)*15)
	pos := 1
	for _, msg := range chunk {
		values = append(values, fmt.Sprintf(
			"($%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d)",
			pos, pos+1, pos+2, pos+3, pos+4, pos+5, pos+6, pos+7, pos+8, pos+9, pos+10, pos+11, pos+12, pos+13, pos+14,
		))
		args = append(args,
			msg.ID, msg.ChannelID, msg.RemoteID, msg.PlatformMessageID,
			msg.Direction, string(msg.Platform), msg.SenderRemoteID, []byte(msg.Content),
			msg.OccurredAt.UTC(), msg.ObservedAt.UTC(),
			dbutil.NullTime(msg.DeliveredAt), dbutil.NullTime(msg.SeenAt),
			dbutil.NullTime(msg.EditedAt), dbutil.NullTime(msg.DeletedAt), msg.Version,
		)
		pos += 15
	}

	// ON CONFLICT: update delivered_at/seen_at forward-only (GREATEST+COALESCE),
	// leave all other columns untouched. Use xmax=0 to distinguish true inserts
	// from updates so the returned count reflects only new rows.
	q := fmt.Sprintf(
		`INSERT INTO messages
		   (id, channel_id, remote_id, platform_message_id, direction, platform,
		    sender_remote_id, content, occurred_at, observed_at,
		    delivered_at, seen_at, edited_at, deleted_at, version)
		 VALUES %s
		 ON CONFLICT (channel_id, platform_message_id) DO UPDATE SET
		   delivered_at = COALESCE(GREATEST(messages.delivered_at, EXCLUDED.delivered_at), messages.delivered_at, EXCLUDED.delivered_at),
		   seen_at      = COALESCE(GREATEST(messages.seen_at,      EXCLUDED.seen_at),      messages.seen_at,      EXCLUDED.seen_at)
		 RETURNING id, (xmax = 0) AS is_insert`,
		strings.Join(values, ","),
	)

	rows, err := db.QueryContext(ctx, q, args...)
	if err != nil {
		return 0, fmt.Errorf("pg message projection repo: upsert chunk if new: %w", err)
	}
	defer rows.Close()

	n := 0
	for rows.Next() {
		var id string
		var isInsert bool
		if err := rows.Scan(&id, &isInsert); err != nil {
			return n, fmt.Errorf("pg message projection repo: scan returning id: %w", err)
		}
		if isInsert {
			n++
		}
	}
	if err := rows.Err(); err != nil {
		return n, fmt.Errorf("pg message projection repo: rows err: %w", err)
	}
	return n, nil
}

func upsertMessageRow(ctx context.Context, db msgQueryExecContext, msg *projections.Message) error {
	now := time.Now().UTC()
	_, err := db.ExecContext(ctx,
		`INSERT INTO messages
		   (id, channel_id, remote_id, platform_message_id, direction, platform,
		    sender_remote_id, content, occurred_at, observed_at,
		    delivered_at, seen_at, edited_at, deleted_at, version)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
		 ON CONFLICT (id) DO UPDATE SET
		   content     = EXCLUDED.content,
		   delivered_at= EXCLUDED.delivered_at,
		   seen_at     = EXCLUDED.seen_at,
		   edited_at   = EXCLUDED.edited_at,
		   deleted_at  = EXCLUDED.deleted_at,
		   observed_at = EXCLUDED.observed_at,
		   version     = messages.version + 1`,
		msg.ID, msg.ChannelID, msg.RemoteID, msg.PlatformMessageID,
		msg.Direction, string(msg.Platform), msg.SenderRemoteID, []byte(msg.Content),
		msg.OccurredAt.UTC(), now,
		dbutil.NullTime(msg.DeliveredAt), dbutil.NullTime(msg.SeenAt),
		dbutil.NullTime(msg.EditedAt), dbutil.NullTime(msg.DeletedAt), msg.Version,
	)
	if err != nil {
		return fmt.Errorf("pg message projection repo: save: %w", err)
	}
	return nil
}

// -------------------------------------------------------------------------------
// Post-sync LID normalization
// -------------------------------------------------------------------------------

// FindDistinctLIDRemoteIDs returns all distinct remote_ids stored in LID form
// (@lid suffix) for the given channel.
func (r *PgMessageProjectionRepository) FindDistinctLIDRemoteIDs(ctx context.Context, channelID string) ([]string, error) {
	db := r.txOrDB(ctx)
	rows, err := db.QueryContext(ctx,
		`SELECT DISTINCT remote_id FROM messages WHERE channel_id = $1 AND remote_id LIKE '%@lid'`,
		channelID,
	)
	if err != nil {
		return nil, fmt.Errorf("pg message projection repo: find distinct LID remote ids: %w", err)
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("pg message projection repo: scan LID remote id: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// RewriteRemoteIDs rewrites LID-keyed message rows to their PN equivalents in
// a single batch UPDATE and returns the rewritten rows. The caller passes
// these to ApplyHistoricalMessages so remote last_message_at is updated for the
// now-PN-keyed messages.
func (r *PgMessageProjectionRepository) RewriteRemoteIDs(ctx context.Context, channelID string, lidToPN map[string]string) ([]*projections.Message, error) {
	if len(lidToPN) == 0 {
		return nil, nil
	}
	db := r.txOrDB(ctx)

	// Build VALUES pairs for a single batch UPDATE … FROM (VALUES …).
	valueParts := make([]string, 0, len(lidToPN))
	args := []any{channelID}
	i := 2
	for lid, pn := range lidToPN {
		valueParts = append(valueParts, fmt.Sprintf("($%d, $%d)", i, i+1))
		args = append(args, lid, pn)
		i += 2
	}

	q := fmt.Sprintf(`
		UPDATE messages m
		SET remote_id = mapping.pn
		FROM (VALUES %s) AS mapping(lid, pn)
		WHERE m.channel_id = $1 AND m.remote_id = mapping.lid
		RETURNING m.id, m.channel_id, m.remote_id, m.platform_message_id, m.direction, m.platform,
		          m.sender_remote_id, m.content, m.occurred_at, m.observed_at,
		          m.delivered_at, m.seen_at, m.edited_at, m.deleted_at, m.version`,
		strings.Join(valueParts, ","))

	rows, err := db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("pg message projection repo: rewrite remote ids: %w", err)
	}
	defer rows.Close()
	return scanMessageRows(rows)
}

// -------------------------------------------------------------------------------
// Atomic column updates
// -------------------------------------------------------------------------------

// UpdateDelivered advances delivered_at to `at` using GREATEST for forward-only
// semantics. COALESCE handles the initial-NULL case: GREATEST(NULL, val) = NULL in
// Postgres, so without COALESCE the first delivery receipt on a newly-inserted
// message would silently write NULL instead of the delivery timestamp.
func (r *PgMessageProjectionRepository) UpdateDelivered(ctx context.Context, messageID string, at time.Time) error {
	db := r.txOrDB(ctx)
	_, err := db.ExecContext(ctx,
		`UPDATE messages
		 SET delivered_at = COALESCE(GREATEST(delivered_at, $2::timestamptz), $2::timestamptz),
		     version      = version + 1
		 WHERE id = $1`,
		messageID, at.UTC(),
	)
	if err != nil {
		return fmt.Errorf("pg message projection repo: update delivered: %w", err)
	}
	return nil
}

// UpdateSeen advances seen_at to `at` using GREATEST for forward-only semantics.
// COALESCE handles the initial-NULL case (see UpdateDelivered for rationale).
func (r *PgMessageProjectionRepository) UpdateSeen(ctx context.Context, messageID string, at time.Time) error {
	db := r.txOrDB(ctx)
	_, err := db.ExecContext(ctx,
		`UPDATE messages
		 SET seen_at = COALESCE(GREATEST(seen_at, $2::timestamptz), $2::timestamptz),
		     version = version + 1
		 WHERE id = $1`,
		messageID, at.UTC(),
	)
	if err != nil {
		return fmt.Errorf("pg message projection repo: update seen: %w", err)
	}
	return nil
}

// -------------------------------------------------------------------------------
// Internal helpers
// -------------------------------------------------------------------------------

func (r *PgMessageProjectionRepository) txOrDB(ctx context.Context) msgQueryExecContext {
	if tx, ok := unitofwork.TxFromContext(ctx); ok {
		return tx
	}
	return r.db
}

type msgQueryExecContext interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// -------------------------------------------------------------------------------
// Scanning helpers
// -------------------------------------------------------------------------------

type msgRowScanner interface {
	Scan(dest ...any) error
}

func scanMessage(row msgRowScanner) (*projections.Message, error) {
	var msg projections.Message
	var content []byte
	var platform string
	var deliveredAt, seenAt, editedAt, deletedAt sql.NullTime
	err := row.Scan(
		&msg.ID, &msg.ChannelID, &msg.RemoteID, &msg.PlatformMessageID,
		&msg.Direction, &platform, &msg.SenderRemoteID, &content,
		&msg.OccurredAt, &msg.ObservedAt,
		&deliveredAt, &seenAt, &editedAt, &deletedAt, &msg.Version,
	)
	if err != nil {
		return nil, err
	}
	msg.Platform = enums.Platform(platform)
	msg.Content = json.RawMessage(content)
	msg.DeliveredAt = dbutil.TimePtr(deliveredAt)
	msg.SeenAt = dbutil.TimePtr(seenAt)
	msg.EditedAt = dbutil.TimePtr(editedAt)
	msg.DeletedAt = dbutil.TimePtr(deletedAt)
	return &msg, nil
}

func scanMessageRows(rows *sql.Rows) ([]*projections.Message, error) {
	var result []*projections.Message
	for rows.Next() {
		msg, err := scanMessage(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, msg)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}
