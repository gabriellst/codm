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
	sqlitedb "template/api-go/internal/shared/db/sqlite/gen"
	"template/core-go/db/dbutil"
	"template/core-go/db/sqlite"
	"template/core-go/services/unitofwork"
)

// SqliteMessageProjectionRepository serves reads and projection writes for the Message
// read model over the SHARED SQLite store (gateway_messages).
//
// Semantics preserved from the pg original:
//   - InsertIfNew / UpsertAllIfNew are idempotent on (channel_id,
//     platform_message_id) — the live-message and history-sync paths.
//   - UpdateDelivered / UpdateSeen are forward-only.
//   - Find / FindByPlatformID return (nil, nil) on miss.
//
// Dialect deltas that needed more than a placeholder swap:
//
//	GREATEST(a, b)  -> MAX(a, b)   (SQLite scalar MAX; the COALESCE guard for the
//	                                initial-NULL case carries over unchanged)
//	RETURNING (xmax = 0) -> gone. Postgres let one upsert both merge receipts and
//	                        report whether each row was really inserted. SQLite has
//	                        no xmax, so UpsertAllIfNew splits into (1) an
//	                        ON CONFLICT DO NOTHING ... RETURNING id insert whose
//	                        returned row count IS the inserted count, and (2) a
//	                        forward-only receipt merge for the few messages that
//	                        actually carry delivered_at/seen_at.
//	UPDATE ... FROM (VALUES ...) -> a per-mapping UPDATE loop in RewriteRemoteIDs
//	                        (the LID->PN map is tiny; a correlated batch buys
//	                        nothing and costs readability).
type SqliteMessageProjectionRepository struct {
	store *sqlite.SqliteStore
}

// NewSqliteMessageProjectionRepository constructs the read/projection-write repository.
func NewSqliteMessageProjectionRepository(store *sqlite.SqliteStore) *SqliteMessageProjectionRepository {
	return &SqliteMessageProjectionRepository{store: store}
}

// compile-time interface satisfaction check.
var _ MessageProjectionRepository = (*SqliteMessageProjectionRepository)(nil)

// sqliteMsgChunkSize caps rows per batch INSERT. SQLite allows 32766 bound
// parameters (SQLITE_MAX_VARIABLE_NUMBER since 3.32); 16 columns x 500 = 8000.
const sqliteMsgChunkSize = 500

// sqliteMessageColumns is the canonical projection column list, ordered to match
// the field order of the sqlc-generated sqlitedb.GatewayMessage that every scan
// target uses. Keeping one constant means a contract column change breaks the
// generated struct AND every query at once.
const sqliteMessageColumns = `id, channel_id, remote_id, platform_message_id, direction, platform,
	        sender_remote_id, message_type, content, occurred_at, observed_at,
	        delivered_at, seen_at, edited_at, deleted_at, version`

// -------------------------------------------------------------------------------
// Reads
// -------------------------------------------------------------------------------

// Find returns the Message projection for the given messageID, or (nil, nil).
func (r *SqliteMessageProjectionRepository) Find(ctx context.Context, messageID string) (*projections.Message, error) {
	m, err := r.queries(ctx).GetGatewayMessage(ctx, messageID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("sqlite message projection repo: find: %w", err)
	}
	return sqliteMessageFromRow(m), nil
}

// FindByPlatformID returns the Message projection for (channelID,
// platformMessageID), or (nil, nil) when no row exists.
func (r *SqliteMessageProjectionRepository) FindByPlatformID(
	ctx context.Context, channelID, platformMessageID string,
) (*projections.Message, error) {
	m, err := r.queries(ctx).GetGatewayMessageByPlatformID(ctx, sqlitedb.GetGatewayMessageByPlatformIDParams{
		ChannelID:         channelID,
		PlatformMessageID: platformMessageID,
	})
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("sqlite message projection repo: find by platform id: %w", err)
	}
	return sqliteMessageFromRow(m), nil
}

// ListByRemote returns a cursor-paginated slice of Message projections for
// (channelID, remoteID). When opts.Before is set only messages strictly older
// than that occurred_at are returned.
func (r *SqliteMessageProjectionRepository) ListByRemote(
	ctx context.Context, channelID, remoteID string, opts CursorOptions,
) ([]*projections.Message, error) {
	args := []any{channelID, remoteID}
	where := "channel_id = ? AND remote_id = ?"

	if opts.Before != nil {
		args = append(args, dbutil.Millis(*opts.Before))
		where += " AND occurred_at < ?"
	}

	limit := opts.Limit
	if limit <= 0 {
		limit = 50
	}
	args = append(args, limit)

	rows, err := r.exec(ctx).QueryContext(ctx, fmt.Sprintf(
		`SELECT %s
		 FROM gateway_messages
		 WHERE %s
		 ORDER BY occurred_at DESC, observed_at DESC
		 LIMIT ?`,
		sqliteMessageColumns, where,
	), args...)
	if err != nil {
		return nil, fmt.Errorf("sqlite message projection repo: list by remote: %w", err)
	}
	defer rows.Close()

	return scanSqliteMessageRows(rows)
}

// -------------------------------------------------------------------------------
// Whole-row writes
// -------------------------------------------------------------------------------

// Save upserts the full Message projection row (keyed by id).
func (r *SqliteMessageProjectionRepository) Save(ctx context.Context, msg *projections.Message) error {
	_, err := r.exec(ctx).ExecContext(ctx,
		`INSERT INTO gateway_messages
		   (id, channel_id, remote_id, platform_message_id, direction, platform,
		    sender_remote_id, message_type, content, occurred_at, observed_at,
		    delivered_at, seen_at, edited_at, deleted_at, version)
		 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
		 ON CONFLICT(id) DO UPDATE SET
		   content      = excluded.content,
		   delivered_at = excluded.delivered_at,
		   seen_at      = excluded.seen_at,
		   edited_at    = excluded.edited_at,
		   deleted_at   = excluded.deleted_at,
		   observed_at  = excluded.observed_at,
		   version      = gateway_messages.version + 1`,
		sqliteMessageArgs(msg)...,
	)
	if err != nil {
		return fmt.Errorf("sqlite message projection repo: save: %w", err)
	}
	return nil
}

// InsertIfNew inserts the row only when no message with the same (channel_id,
// platform_message_id) exists. Returns inserted=false on conflict.
func (r *SqliteMessageProjectionRepository) InsertIfNew(ctx context.Context, msg *projections.Message) (bool, error) {
	var id string
	err := r.exec(ctx).QueryRowContext(ctx,
		`INSERT INTO gateway_messages
		   (id, channel_id, remote_id, platform_message_id, direction, platform,
		    sender_remote_id, message_type, content, occurred_at, observed_at,
		    delivered_at, seen_at, edited_at, deleted_at, version)
		 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
		 ON CONFLICT(channel_id, platform_message_id) DO NOTHING
		 RETURNING id`,
		sqliteMessageArgs(msg)...,
	).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		// DO NOTHING fired — no row returned means conflict.
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("sqlite message projection repo: insert if new: %w", err)
	}
	return true, nil
}

// UpsertAllIfNew batch-inserts Message projection rows, skipping ones that
// already exist under the same (channel_id, platform_message_id), and returns
// how many rows were genuinely inserted. Rows carrying a delivery/seen receipt
// still get a forward-only merge onto the pre-existing row, matching the pg
// ON CONFLICT DO UPDATE branch.
func (r *SqliteMessageProjectionRepository) UpsertAllIfNew(ctx context.Context, msgs []*projections.Message) (int, error) {
	if len(msgs) == 0 {
		return 0, nil
	}

	db := r.exec(ctx)
	total := 0

	for start := 0; start < len(msgs); start += sqliteMsgChunkSize {
		end := start + sqliteMsgChunkSize
		if end > len(msgs) {
			end = len(msgs)
		}
		n, err := insertSqliteMessageChunkIfNew(ctx, db, msgs[start:end])
		if err != nil {
			return total, err
		}
		total += n
	}

	// Receipt merge for the rows that lost the insert race (or were already
	// there). Only messages that actually carry a receipt need it, which in the
	// history-sync path this method serves is nearly none.
	for _, msg := range msgs {
		if msg.DeliveredAt == nil && msg.SeenAt == nil {
			continue
		}
		if err := mergeSqliteMessageReceipts(ctx, db, msg); err != nil {
			return total, err
		}
	}

	slog.Debug("messages inserted", "count", total, "batch_size", len(msgs))
	return total, nil
}

// insertSqliteMessageChunkIfNew issues one multi-row INSERT ... ON CONFLICT DO
// NOTHING RETURNING id. SQLite emits a RETURNING row only for rows it actually
// inserted, so the row count IS the inserted count — the replacement for
// Postgres' `(xmax = 0)` discriminator.
func insertSqliteMessageChunkIfNew(ctx context.Context, db sqliteMsgExec, chunk []*projections.Message) (int, error) {
	values := make([]string, 0, len(chunk))
	args := make([]any, 0, len(chunk)*16)
	for _, msg := range chunk {
		values = append(values, "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
		args = append(args, sqliteMessageArgs(msg)...)
	}

	rows, err := db.QueryContext(ctx, fmt.Sprintf(
		`INSERT INTO gateway_messages
		   (id, channel_id, remote_id, platform_message_id, direction, platform,
		    sender_remote_id, message_type, content, occurred_at, observed_at,
		    delivered_at, seen_at, edited_at, deleted_at, version)
		 VALUES %s
		 ON CONFLICT(channel_id, platform_message_id) DO NOTHING
		 RETURNING id`,
		strings.Join(values, ","),
	), args...)
	if err != nil {
		return 0, fmt.Errorf("sqlite message projection repo: insert chunk if new: %w", err)
	}
	defer rows.Close()

	n := 0
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return n, fmt.Errorf("sqlite message projection repo: scan returning id: %w", err)
		}
		n++
	}
	if err := rows.Err(); err != nil {
		return n, fmt.Errorf("sqlite message projection repo: rows err: %w", err)
	}
	return n, nil
}

// mergeSqliteMessageReceipts advances delivered_at/seen_at forward-only on the
// row that owns (channel_id, platform_message_id), leaving every other column
// alone. This is the surviving half of the pg ON CONFLICT DO UPDATE branch.
func mergeSqliteMessageReceipts(ctx context.Context, db sqliteMsgExec, msg *projections.Message) error {
	_, err := db.ExecContext(ctx,
		`UPDATE gateway_messages SET
		   delivered_at = CASE WHEN ?3 IS NULL THEN delivered_at
		                       ELSE MAX(COALESCE(delivered_at, ?3), ?3) END,
		   seen_at      = CASE WHEN ?4 IS NULL THEN seen_at
		                       ELSE MAX(COALESCE(seen_at, ?4), ?4) END
		 WHERE channel_id = ?1 AND platform_message_id = ?2`,
		msg.ChannelID, msg.PlatformMessageID,
		dbutil.NullMillis(msg.DeliveredAt), dbutil.NullMillis(msg.SeenAt),
	)
	if err != nil {
		return fmt.Errorf("sqlite message projection repo: merge receipts: %w", err)
	}
	return nil
}

// -------------------------------------------------------------------------------
// Post-sync LID normalization
// -------------------------------------------------------------------------------

// FindDistinctLIDRemoteIDs returns every distinct remote_id stored in LID form
// (@lid suffix) for the channel.
func (r *SqliteMessageProjectionRepository) FindDistinctLIDRemoteIDs(ctx context.Context, channelID string) ([]string, error) {
	ids, err := r.queries(ctx).ListLIDRemoteIDs(ctx, channelID)
	if err != nil {
		return nil, fmt.Errorf("sqlite message projection repo: find distinct LID remote ids: %w", err)
	}
	return ids, nil
}

// RewriteRemoteIDs rewrites LID-keyed message rows to their PN equivalents and
// returns the rewritten rows so the caller can re-apply them to the Remote
// projection preview columns.
//
// The pg version did this as one UPDATE ... FROM (VALUES ...). SQLite gets one
// UPDATE per mapping entry: the LID->PN map holds at most a handful of entries
// (only remotes that showed up in LID form during a sync), so the round-trip
// count is trivial and the SQL stays obvious.
func (r *SqliteMessageProjectionRepository) RewriteRemoteIDs(
	ctx context.Context, channelID string, lidToPN map[string]string,
) ([]*projections.Message, error) {
	if len(lidToPN) == 0 {
		return nil, nil
	}
	db := r.exec(ctx)

	var rewritten []*projections.Message
	for lid, pn := range lidToPN {
		rows, err := db.QueryContext(ctx, fmt.Sprintf(
			`UPDATE gateway_messages
			 SET remote_id = ?
			 WHERE channel_id = ? AND remote_id = ?
			 RETURNING %s`, sqliteMessageColumns),
			pn, channelID, lid,
		)
		if err != nil {
			return nil, fmt.Errorf("sqlite message projection repo: rewrite remote ids: %w", err)
		}
		batch, err := scanSqliteMessageRows(rows)
		rows.Close()
		if err != nil {
			return nil, fmt.Errorf("sqlite message projection repo: scan rewritten: %w", err)
		}
		rewritten = append(rewritten, batch...)
	}
	return rewritten, nil
}

// -------------------------------------------------------------------------------
// Atomic column updates
// -------------------------------------------------------------------------------

// UpdateDelivered advances delivered_at to `at`, forward-only.
//
// MAX is SQLite's scalar max (the GREATEST equivalent) and returns NULL if any
// argument is NULL, so the COALESCE seed is what makes the first receipt on a
// freshly-inserted message write the timestamp instead of NULL — the same trap
// the pg version documented.
func (r *SqliteMessageProjectionRepository) UpdateDelivered(ctx context.Context, messageID string, at time.Time) error {
	_, err := r.exec(ctx).ExecContext(ctx,
		`UPDATE gateway_messages
		 SET delivered_at = MAX(COALESCE(delivered_at, ?2), ?2),
		     version      = version + 1
		 WHERE id = ?1`,
		messageID, dbutil.Millis(at),
	)
	if err != nil {
		return fmt.Errorf("sqlite message projection repo: update delivered: %w", err)
	}
	return nil
}

// UpdateSeen advances seen_at to `at`, forward-only (see UpdateDelivered).
func (r *SqliteMessageProjectionRepository) UpdateSeen(ctx context.Context, messageID string, at time.Time) error {
	_, err := r.exec(ctx).ExecContext(ctx,
		`UPDATE gateway_messages
		 SET seen_at = MAX(COALESCE(seen_at, ?2), ?2),
		     version = version + 1
		 WHERE id = ?1`,
		messageID, dbutil.Millis(at),
	)
	if err != nil {
		return fmt.Errorf("sqlite message projection repo: update seen: %w", err)
	}
	return nil
}

// -------------------------------------------------------------------------------
// Internal helpers
// -------------------------------------------------------------------------------

func (r *SqliteMessageProjectionRepository) queries(ctx context.Context) *sqlitedb.Queries {
	if tx, ok := unitofwork.TxFromContext(ctx); ok {
		return sqlitedb.New(r.store.DB()).WithTx(tx)
	}
	return sqlitedb.New(r.store.DB())
}

func (r *SqliteMessageProjectionRepository) exec(ctx context.Context) sqliteMsgExec {
	if tx, ok := unitofwork.TxFromContext(ctx); ok {
		return tx
	}
	return r.store.DB()
}

// sqliteMessageArgs binds one projection row in sqliteMessageColumns order.
// observed_at is refreshed to now on every write, matching the pg upsert.
func sqliteMessageArgs(msg *projections.Message) []any {
	return []any{
		msg.ID, msg.ChannelID, msg.RemoteID, msg.PlatformMessageID,
		msg.Direction, string(msg.Platform), msg.SenderRemoteID,
		sqliteNullIfEmpty(string(msg.MessageType)), string(msg.Content),
		dbutil.Millis(msg.OccurredAt), dbutil.Millis(time.Now()),
		dbutil.NullMillis(msg.DeliveredAt), dbutil.NullMillis(msg.SeenAt),
		dbutil.NullMillis(msg.EditedAt), dbutil.NullMillis(msg.DeletedAt),
		msg.Version,
	}
}

// sqliteNullIfEmpty maps "" to NULL so the nullable enum-checked message_type
// column never stores an empty string.
func sqliteNullIfEmpty(v string) any {
	if v == "" {
		return nil
	}
	return v
}

// sqliteMessageFromRow converts the sqlc-generated row into the read model.
func sqliteMessageFromRow(m sqlitedb.GatewayMessage) *projections.Message {
	return &projections.Message{
		ID:                m.ID,
		ChannelID:         m.ChannelID,
		RemoteID:          m.RemoteID,
		PlatformMessageID: m.PlatformMessageID,
		Direction:         m.Direction,
		Platform:          enums.Platform(m.Platform),
		SenderRemoteID:    m.SenderRemoteID,
		MessageType:       enums.MessageType(m.MessageType.String),
		Content:           json.RawMessage(m.Content),
		OccurredAt:        dbutil.TimeFromMillis(m.OccurredAt),
		ObservedAt:        dbutil.TimeFromMillis(m.ObservedAt),
		DeliveredAt:       dbutil.TimePtrFromMillis(m.DeliveredAt),
		SeenAt:            dbutil.TimePtrFromMillis(m.SeenAt),
		EditedAt:          dbutil.TimePtrFromMillis(m.EditedAt),
		DeletedAt:         dbutil.TimePtrFromMillis(m.DeletedAt),
		Version:           m.Version,
	}
}

// scanSqliteMessageRows scans hand-written query output through the generated
// struct, so the column order of sqliteMessageColumns is checked against the
// contract at compile time rather than at runtime.
func scanSqliteMessageRows(rows *sql.Rows) ([]*projections.Message, error) {
	var result []*projections.Message
	for rows.Next() {
		var m sqlitedb.GatewayMessage
		if err := rows.Scan(
			&m.ID, &m.ChannelID, &m.RemoteID, &m.PlatformMessageID,
			&m.Direction, &m.Platform, &m.SenderRemoteID, &m.MessageType, &m.Content,
			&m.OccurredAt, &m.ObservedAt,
			&m.DeliveredAt, &m.SeenAt, &m.EditedAt, &m.DeletedAt, &m.Version,
		); err != nil {
			return nil, err
		}
		result = append(result, sqliteMessageFromRow(m))
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}
