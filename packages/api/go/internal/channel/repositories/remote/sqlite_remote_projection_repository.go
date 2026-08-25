package remote

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	channelenums "template/api-go/internal/channel/enums"
	"template/api-go/internal/channel/projections"
	sqlitedb "template/api-go/internal/shared/db/sqlite/gen"
	"template/core-go/db/dbutil"
	"template/core-go/db/sqlite"
	"template/core-go/services/unitofwork"
)

// SqliteRemoteProjectionRepository serves reads and projection writes for the Remote read
// model over the SHARED SQLite store (gateway_remotes + gateway_remote_memberships).
//
// Semantics preserved from the pg original:
//   - Find returns (nil, nil) on miss; FindAllByChannel returns an empty
//     (non-nil) map.
//   - InsertIfNew is first-write-wins on (channel_id, remote_id).
//   - Preview columns (last_message_id/at) move forward-only by occurred_at;
//     unread_message_count bumps only for live received messages.
//   - UpdateMembership / BulkUpdateMemberships keep DELETE+INSERT atomic by
//     joining the ambient UoW tx, else opening a local one.
//
// Dialect deltas that needed more than a placeholder swap:
//
//	ILIKE            -> LIKE. SQLite LIKE is already case-insensitive for ASCII.
//	DESC NULLS LAST  -> DESC. In SQLite NULL sorts BEFORE every value, so a plain
//	                    DESC already puts NULLs last (see the schema comment on
//	                    idx_remotes_last_message_at).
//	NOW()            -> a bound time.Now().UnixMilli().
//	$3::uuid         -> ?3. Ids are TEXT here, so no cast exists or is needed.
//	UPDATE ... FROM  -> correlated subqueries in BackfillLastMessagePreview.
//	FALSE            -> 0 (booleans are INTEGER).
type SqliteRemoteProjectionRepository struct {
	store *sqlite.SqliteStore
}

// NewSqliteRemoteProjectionRepository constructs the read/projection-write repository.
func NewSqliteRemoteProjectionRepository(store *sqlite.SqliteStore) *SqliteRemoteProjectionRepository {
	return &SqliteRemoteProjectionRepository{store: store}
}

// compile-time interface satisfaction check.
var _ RemoteProjectionRepository = (*SqliteRemoteProjectionRepository)(nil)

// sqliteRemoteChunkSize caps rows per batch INSERT. SQLite allows 32766 bound
// parameters; 18 columns x 500 = 9000.
const sqliteRemoteChunkSize = 500

// sqliteRemoteColumns is the canonical projection column list, ordered to match
// the sqlc-generated sqlitedb.GatewayRemote field order that every scan uses.
const sqliteRemoteColumns = `channel_id, remote_id, type, platform, name, avatar_url, is_blocked,
	        pinned_at, archived, mute_expiration, marked_as_unread,
	        unread_message_count, last_message_at, last_message_id, deleted_at,
	        created_at, updated_at, version`

// -------------------------------------------------------------------------------
// Reads
// -------------------------------------------------------------------------------

// Find returns the Remote projection for (channelID, remoteID), or (nil, nil).
func (r *SqliteRemoteProjectionRepository) Find(ctx context.Context, channelID, remoteID string) (*projections.Remote, error) {
	row, err := r.queries(ctx).GetGatewayRemote(ctx, sqlitedb.GetGatewayRemoteParams{
		ChannelID: channelID,
		RemoteID:  remoteID,
	})
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("sqlite remote projection repo: find: %w", err)
	}
	return sqliteRemoteFromRow(row), nil
}

// List returns a paginated slice of Remote projections for the channel.
func (r *SqliteRemoteProjectionRepository) List(ctx context.Context, channelID string, opts ListOptions) ([]*projections.Remote, error) {
	args := []any{channelID}
	where := []string{"channel_id = ?"}

	if opts.Type != "" {
		args = append(args, string(opts.Type))
		where = append(where, "type = ?")
	}
	if opts.Search != "" {
		args = append(args, "%"+opts.Search+"%")
		where = append(where, "name LIKE ?")
	}
	if opts.OnlyPinned {
		where = append(where, "pinned_at IS NOT NULL")
	}
	if opts.Cursor != nil {
		args = append(args, dbutil.Millis(*opts.Cursor))
		where = append(where, "last_message_at < ?")
	}

	limit := opts.Limit
	if limit <= 0 {
		limit = 50
	}
	args = append(args, limit)

	rows, err := r.exec(ctx).QueryContext(ctx, fmt.Sprintf(
		`SELECT %s
		 FROM gateway_remotes
		 WHERE %s
		 ORDER BY last_message_at DESC
		 LIMIT ?`,
		sqliteRemoteColumns, strings.Join(where, " AND "),
	), args...)
	if err != nil {
		return nil, fmt.Errorf("sqlite remote projection repo: list: %w", err)
	}
	defer rows.Close()

	return scanSqliteRemoteRows(rows)
}

// FindAllByChannel returns every Remote projection for a channel keyed by
// remoteID. Returns an empty (non-nil) map when the channel has no remotes.
func (r *SqliteRemoteProjectionRepository) FindAllByChannel(ctx context.Context, channelID string) (map[string]*projections.Remote, error) {
	rows, err := r.queries(ctx).ListGatewayRemotesByChannel(ctx, channelID)
	if err != nil {
		return nil, fmt.Errorf("sqlite remote projection repo: find all by channel: %w", err)
	}

	result := make(map[string]*projections.Remote, len(rows))
	for _, row := range rows {
		rem := sqliteRemoteFromRow(row)
		result[rem.RemoteID] = rem
	}
	return result, nil
}

// -------------------------------------------------------------------------------
// Whole-row writes
// -------------------------------------------------------------------------------

// Save upserts the full Remote projection row.
func (r *SqliteRemoteProjectionRepository) Save(ctx context.Context, rem *projections.Remote) error {
	_, err := r.exec(ctx).ExecContext(ctx,
		`INSERT INTO gateway_remotes
		   (`+sqliteRemoteColumns+`)
		 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
		 `+sqliteRemoteUpsertSet,
		sqliteRemoteArgs(rem)...,
	)
	if err != nil {
		return fmt.Errorf("sqlite remote projection repo: save: %w", err)
	}
	return nil
}

// sqliteRemoteUpsertSet is the shared ON CONFLICT branch of Save/UpsertAll:
// every projector-owned column is replaced and the row version bumps. created_at
// is deliberately absent so the original creation instant survives.
const sqliteRemoteUpsertSet = `ON CONFLICT(channel_id, remote_id) DO UPDATE SET
		   type                 = excluded.type,
		   platform             = excluded.platform,
		   name                 = excluded.name,
		   avatar_url           = excluded.avatar_url,
		   is_blocked           = excluded.is_blocked,
		   pinned_at            = excluded.pinned_at,
		   archived             = excluded.archived,
		   mute_expiration      = excluded.mute_expiration,
		   marked_as_unread     = excluded.marked_as_unread,
		   unread_message_count = excluded.unread_message_count,
		   last_message_at      = excluded.last_message_at,
		   last_message_id      = excluded.last_message_id,
		   deleted_at           = excluded.deleted_at,
		   updated_at           = excluded.updated_at,
		   version              = gateway_remotes.version + 1`

// InsertIfNew inserts the row only when no (channel_id, remote_id) row exists.
// Returns inserted=false on conflict — first-write-wins, so a late
// remote_created never overwrites fields an earlier remote_updated/remote_synced
// already populated.
//
// Faithful to the pg original, last_message_id is NOT part of the insert column
// list: a freshly created remote has no preview message yet.
func (r *SqliteRemoteProjectionRepository) InsertIfNew(ctx context.Context, rem *projections.Remote) (bool, error) {
	var channelID string
	err := r.exec(ctx).QueryRowContext(ctx,
		`INSERT INTO gateway_remotes
		   (channel_id, remote_id, type, platform, name, avatar_url, is_blocked, pinned_at, archived,
		    mute_expiration, marked_as_unread, unread_message_count, last_message_at,
		    deleted_at, created_at, updated_at, version)
		 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
		 ON CONFLICT(channel_id, remote_id) DO NOTHING
		 RETURNING channel_id`,
		rem.ChannelID, rem.RemoteID, rem.Type, string(rem.Platform), rem.Name,
		dbutil.NullStr(rem.AvatarURL), dbutil.BoolToInt(rem.IsBlocked),
		dbutil.NullMillis(rem.PinnedAt), dbutil.BoolToInt(rem.Archived),
		dbutil.NullMillis(rem.MuteExpiration), dbutil.BoolToInt(rem.MarkedAsUnread),
		rem.UnreadMessageCount, dbutil.NullMillis(rem.LastMessageAt),
		dbutil.NullMillis(rem.DeletedAt), dbutil.Millis(rem.CreatedAt),
		dbutil.Millis(time.Now()), rem.Version,
	).Scan(&channelID)
	if errors.Is(err, sql.ErrNoRows) {
		// DO NOTHING fired — no row returned means conflict.
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("sqlite remote projection repo: insert if new: %w", err)
	}
	return true, nil
}

// UpsertAll batch-upserts Remote projection rows in chunks.
func (r *SqliteRemoteProjectionRepository) UpsertAll(ctx context.Context, remotes []*projections.Remote) error {
	if len(remotes) == 0 {
		return nil
	}
	db := r.exec(ctx)

	for start := 0; start < len(remotes); start += sqliteRemoteChunkSize {
		end := start + sqliteRemoteChunkSize
		if end > len(remotes) {
			end = len(remotes)
		}
		if err := upsertSqliteRemoteChunk(ctx, db, remotes[start:end]); err != nil {
			return err
		}
	}
	slog.Debug("remotes upserted", "count", len(remotes))
	return nil
}

func upsertSqliteRemoteChunk(ctx context.Context, db sqliteRemoteExec, chunk []*projections.Remote) error {
	values := make([]string, 0, len(chunk))
	args := make([]any, 0, len(chunk)*18)
	for _, rem := range chunk {
		values = append(values, "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
		args = append(args, sqliteRemoteArgs(rem)...)
	}

	if _, err := db.ExecContext(ctx, fmt.Sprintf(
		`INSERT INTO gateway_remotes
		   (%s)
		 VALUES %s
		 %s`,
		sqliteRemoteColumns, strings.Join(values, ","), sqliteRemoteUpsertSet,
	), args...); err != nil {
		return fmt.Errorf("sqlite remote projection repo: upsert chunk: %w", err)
	}
	return nil
}

// UpsertContactSnapshot batch-upserts only the contact-owned fields (name,
// avatar_url). On conflict every derived field (last_message_*, unread count,
// pinned_at, archived, ...) is preserved from the existing row.
func (r *SqliteRemoteProjectionRepository) UpsertContactSnapshot(ctx context.Context, remotes []*projections.Remote) error {
	if len(remotes) == 0 {
		return nil
	}
	db := r.exec(ctx)

	// 8 bound params per row (version is the literal 1) — 500 x 8 = 4000.
	const contactSnapshotChunkSize = 500
	for start := 0; start < len(remotes); start += contactSnapshotChunkSize {
		end := start + contactSnapshotChunkSize
		if end > len(remotes) {
			end = len(remotes)
		}
		if err := upsertSqliteContactSnapshotChunk(ctx, db, remotes[start:end]); err != nil {
			return err
		}
	}
	slog.Debug("remotes contact snapshot upserted", "count", len(remotes))
	return nil
}

func upsertSqliteContactSnapshotChunk(ctx context.Context, db sqliteRemoteExec, chunk []*projections.Remote) error {
	now := dbutil.Millis(time.Now())
	values := make([]string, 0, len(chunk))
	args := make([]any, 0, len(chunk)*8)
	for _, rem := range chunk {
		values = append(values, "(?,?,?,?,?,?,?,?,1)")
		args = append(args,
			rem.ChannelID, rem.RemoteID, rem.Type, string(rem.Platform),
			rem.Name, dbutil.NullStr(rem.AvatarURL), dbutil.Millis(rem.CreatedAt), now,
		)
	}

	if _, err := db.ExecContext(ctx, fmt.Sprintf(
		`INSERT INTO gateway_remotes
		   (channel_id, remote_id, type, platform, name, avatar_url, created_at, updated_at, version)
		 VALUES %s
		 ON CONFLICT(channel_id, remote_id) DO UPDATE SET
		   name       = excluded.name,
		   avatar_url = excluded.avatar_url,
		   updated_at = excluded.updated_at,
		   version    = gateway_remotes.version + 1`,
		strings.Join(values, ","),
	), args...); err != nil {
		return fmt.Errorf("sqlite remote projection repo: upsert contact snapshot chunk: %w", err)
	}
	return nil
}

// -------------------------------------------------------------------------------
// Atomic column mutations
// -------------------------------------------------------------------------------

// ResetUnreadCount zeroes unread_message_count and clears marked_as_unread.
func (r *SqliteRemoteProjectionRepository) ResetUnreadCount(ctx context.Context, channelID, remoteID string) error {
	if err := r.queries(ctx).ResetGatewayRemoteUnread(ctx, sqlitedb.ResetGatewayRemoteUnreadParams{
		UpdatedAt: dbutil.Millis(time.Now()),
		ChannelID: channelID,
		RemoteID:  remoteID,
	}); err != nil {
		return fmt.Errorf("sqlite remote projection repo: reset unread count: %w", err)
	}
	return nil
}

// UpdateAvatar sets avatar_url on a single remote row. No-op when absent.
func (r *SqliteRemoteProjectionRepository) UpdateAvatar(ctx context.Context, channelID, remoteID, avatarURL string) error {
	// Faithful to pg: the value is stored verbatim, so "" becomes '' rather than
	// NULL (unlike the Save path, which uses dbutil.NullStr).
	if err := r.queries(ctx).UpdateGatewayRemoteAvatar(ctx, sqlitedb.UpdateGatewayRemoteAvatarParams{
		AvatarUrl: sql.NullString{String: avatarURL, Valid: true},
		UpdatedAt: dbutil.Millis(time.Now()),
		ChannelID: channelID,
		RemoteID:  remoteID,
	}); err != nil {
		return fmt.Errorf("sqlite remote projection repo: update avatar: %w", err)
	}
	return nil
}

// -------------------------------------------------------------------------------
// Membership management
// -------------------------------------------------------------------------------

// UpdateMembership replaces the member list for (channelID, groupID): DELETE all
// existing rows then batch-INSERT the new set. An empty list is just the delete.
//
// Joins the ambient UoW transaction when present (caller owns the commit);
// otherwise opens a local transaction so DELETE+INSERT stays atomic.
func (r *SqliteRemoteProjectionRepository) UpdateMembership(ctx context.Context, channelID, groupID string, members []MembershipRow) error {
	return r.inTx(ctx, func(db sqliteRemoteExec) error {
		if _, err := db.ExecContext(ctx,
			`DELETE FROM gateway_remote_memberships WHERE channel_id = ? AND group_id = ?`,
			channelID, groupID,
		); err != nil {
			return fmt.Errorf("sqlite remote projection repo: delete memberships: %w", err)
		}
		if len(members) == 0 {
			return nil
		}

		values := make([]string, 0, len(members))
		args := make([]any, 0, len(members)*5)
		for _, m := range members {
			values = append(values, "(?,?,?,?,?)")
			args = append(args, channelID, groupID, m.MemberID,
				dbutil.BoolToInt(m.IsAdmin), dbutil.Millis(m.JoinedAt))
		}
		if _, err := db.ExecContext(ctx, fmt.Sprintf(
			`INSERT INTO gateway_remote_memberships (channel_id, group_id, member_id, is_admin, joined_at)
			 VALUES %s
			 ON CONFLICT(channel_id, group_id, member_id) DO UPDATE SET
			   is_admin = excluded.is_admin, joined_at = excluded.joined_at`,
			strings.Join(values, ","),
		), args...); err != nil {
			return fmt.Errorf("sqlite remote projection repo: insert memberships: %w", err)
		}
		return nil
	})
}

// AddMember upserts a single member — safe to replay for repeated events.
func (r *SqliteRemoteProjectionRepository) AddMember(ctx context.Context, channelID, groupID string, member MembershipRow) error {
	if err := r.queries(ctx).UpsertGatewayMembership(ctx, sqlitedb.UpsertGatewayMembershipParams{
		ChannelID: channelID,
		GroupID:   groupID,
		MemberID:  member.MemberID,
		IsAdmin:   dbutil.BoolToInt(member.IsAdmin),
		JoinedAt:  dbutil.Millis(member.JoinedAt),
	}); err != nil {
		return fmt.Errorf("sqlite remote projection repo: add member: %w", err)
	}
	return nil
}

// RemoveMember deletes a single member. Idempotent when the member is absent.
func (r *SqliteRemoteProjectionRepository) RemoveMember(ctx context.Context, channelID, groupID, memberID string) error {
	if err := r.queries(ctx).DeleteGatewayMembership(ctx, sqlitedb.DeleteGatewayMembershipParams{
		ChannelID: channelID,
		GroupID:   groupID,
		MemberID:  memberID,
	}); err != nil {
		return fmt.Errorf("sqlite remote projection repo: remove member: %w", err)
	}
	return nil
}

// BulkUpdateMemberships replaces every group membership for a channel: DELETE
// all rows for the channel then batch-INSERT the new set (keyed by group remote
// id). Chunked at 2000 rows (5 params each = 10 000 bindings).
func (r *SqliteRemoteProjectionRepository) BulkUpdateMemberships(ctx context.Context, channelID string, groups map[string][]MembershipRow) error {
	if len(groups) == 0 {
		return nil
	}
	return r.inTx(ctx, func(db sqliteRemoteExec) error {
		if _, err := db.ExecContext(ctx,
			`DELETE FROM gateway_remote_memberships WHERE channel_id = ?`, channelID,
		); err != nil {
			return fmt.Errorf("sqlite remote projection repo: bulk delete memberships: %w", err)
		}

		type memberRow struct {
			groupID  string
			memberID string
			isAdmin  bool
			joinedAt time.Time
		}
		var rows []memberRow
		for groupID, members := range groups {
			for _, m := range members {
				rows = append(rows, memberRow{groupID, m.MemberID, m.IsAdmin, m.JoinedAt})
			}
		}
		if len(rows) == 0 {
			return nil
		}

		const chunkSize = 2000
		for start := 0; start < len(rows); start += chunkSize {
			end := start + chunkSize
			if end > len(rows) {
				end = len(rows)
			}
			chunk := rows[start:end]

			placeholders := make([]string, len(chunk))
			args := make([]any, 0, len(chunk)*5)
			for i, row := range chunk {
				placeholders[i] = "(?,?,?,?,?)"
				args = append(args, channelID, row.groupID, row.memberID,
					dbutil.BoolToInt(row.isAdmin), dbutil.Millis(row.joinedAt))
			}
			if _, err := db.ExecContext(ctx, fmt.Sprintf(
				`INSERT INTO gateway_remote_memberships (channel_id, group_id, member_id, is_admin, joined_at)
				 VALUES %s
				 ON CONFLICT(channel_id, group_id, member_id) DO UPDATE SET is_admin = excluded.is_admin`,
				strings.Join(placeholders, ","),
			), args...); err != nil {
				return fmt.Errorf("sqlite remote projection repo: bulk insert memberships: %w", err)
			}
		}
		return nil
	})
}

// -------------------------------------------------------------------------------
// Apply* — folding message facts into the Remote projection
// -------------------------------------------------------------------------------

// ApplyLatestMessage folds a single live message fact into the derived columns.
// The preview pointers move forward-only by occurred_at; unread_message_count
// always bumps on a received message, whether or not it wins the preview slot.
func (r *SqliteRemoteProjectionRepository) ApplyLatestMessage(ctx context.Context, msg *projections.Message) error {
	incoming := 0
	if msg.Direction == string(channelenums.DirectionReceived) {
		incoming = 1
	}
	_, err := r.exec(ctx).ExecContext(ctx,
		`UPDATE gateway_remotes SET
		   last_message_id      = CASE WHEN last_message_at IS NULL OR last_message_at < ?4
		                               THEN ?3 ELSE last_message_id END,
		   last_message_at      = CASE WHEN last_message_at IS NULL OR last_message_at < ?4
		                               THEN ?4 ELSE last_message_at END,
		   unread_message_count = unread_message_count + ?5,
		   updated_at           = ?6
		 WHERE channel_id = ?1 AND remote_id = ?2`,
		msg.ChannelID, msg.RemoteID, msg.ID, dbutil.Millis(msg.OccurredAt),
		incoming, dbutil.Millis(time.Now()),
	)
	if err != nil {
		return fmt.Errorf("sqlite remote projection repo: apply latest message: %w", err)
	}
	return nil
}

// ApplyHistoricalMessages folds a batch of historical facts into the projection.
// Preview pointers move forward-only; unread_message_count is never bumped
// (history-sync messages count as already read).
func (r *SqliteRemoteProjectionRepository) ApplyHistoricalMessages(ctx context.Context, msgs []*projections.Message) error {
	db := r.exec(ctx)
	for _, msg := range msgs {
		if _, err := db.ExecContext(ctx,
			`UPDATE gateway_remotes SET
			   last_message_id = CASE WHEN last_message_at IS NULL OR last_message_at < ?4
			                          THEN ?3 ELSE last_message_id END,
			   last_message_at = CASE WHEN last_message_at IS NULL OR last_message_at < ?4
			                          THEN ?4 ELSE last_message_at END,
			   updated_at      = ?5
			 WHERE channel_id = ?1 AND remote_id = ?2`,
			msg.ChannelID, msg.RemoteID, msg.ID, dbutil.Millis(msg.OccurredAt),
			dbutil.Millis(time.Now()),
		); err != nil {
			return fmt.Errorf("sqlite remote projection repo: apply historical message: %w", err)
		}
	}
	return nil
}

// BackfillLastMessagePreview fills last_message_at/last_message_id for remote
// rows that still have a NULL (or stale) preview but do have messages. Runs once
// after RemoteSnapshotProjector's contact snapshot creates rows that
// ApplyHistoricalMessages could not update because they did not exist at
// history-sync time.
//
// The pg version used UPDATE ... FROM (subquery). SQLite has no UPDATE ... FROM
// with a per-row correlation of this shape, so the aggregate moves into
// correlated subqueries; the EXISTS guard replaces the join, and the forward-only
// comparison is unchanged. Safe to run repeatedly.
func (r *SqliteRemoteProjectionRepository) BackfillLastMessagePreview(ctx context.Context, channelID string) error {
	_, err := r.exec(ctx).ExecContext(ctx,
		`UPDATE gateway_remotes AS r SET
		   last_message_at = (
		     SELECT MAX(occurred_at) FROM gateway_messages
		     WHERE channel_id = ?1 AND remote_id = r.remote_id
		   ),
		   last_message_id = (
		     SELECT id FROM gateway_messages
		     WHERE channel_id = ?1 AND remote_id = r.remote_id
		     ORDER BY occurred_at DESC LIMIT 1
		   ),
		   updated_at = ?2
		 WHERE r.channel_id = ?1
		   AND EXISTS (
		     SELECT 1 FROM gateway_messages
		     WHERE channel_id = ?1 AND remote_id = r.remote_id
		   )
		   AND (
		     r.last_message_at IS NULL
		     OR r.last_message_at < (
		       SELECT MAX(occurred_at) FROM gateway_messages
		       WHERE channel_id = ?1 AND remote_id = r.remote_id
		     )
		   )`,
		channelID, dbutil.Millis(time.Now()),
	)
	if err != nil {
		return fmt.Errorf("sqlite remote projection repo: backfill last message preview: %w", err)
	}
	return nil
}

// RecomputePreviewIfLatest recomputes (or clears) the preview columns when the
// currently-referenced message was deleted. The expectedMessageID guard makes it
// a no-op once the remote has advanced past that message. The scalar subqueries
// yield NULL when no non-deleted message remains, which correctly clears both
// preview columns.
func (r *SqliteRemoteProjectionRepository) RecomputePreviewIfLatest(ctx context.Context, channelID, remoteID, expectedMessageID string) error {
	_, err := r.exec(ctx).ExecContext(ctx,
		`UPDATE gateway_remotes SET
		   last_message_id = (
		     SELECT id FROM gateway_messages
		     WHERE channel_id = ?1 AND remote_id = ?2 AND deleted_at IS NULL
		     ORDER BY occurred_at DESC LIMIT 1
		   ),
		   last_message_at = (
		     SELECT occurred_at FROM gateway_messages
		     WHERE channel_id = ?1 AND remote_id = ?2 AND deleted_at IS NULL
		     ORDER BY occurred_at DESC LIMIT 1
		   ),
		   updated_at = ?4
		 WHERE channel_id = ?1 AND remote_id = ?2 AND last_message_id = ?3`,
		channelID, remoteID, expectedMessageID, dbutil.Millis(time.Now()),
	)
	if err != nil {
		return fmt.Errorf("sqlite remote projection repo: recompute preview if latest: %w", err)
	}
	return nil
}

// -------------------------------------------------------------------------------
// Internal helpers
// -------------------------------------------------------------------------------

func (r *SqliteRemoteProjectionRepository) queries(ctx context.Context) *sqlitedb.Queries {
	if tx, ok := unitofwork.TxFromContext(ctx); ok {
		return sqlitedb.New(r.store.DB()).WithTx(tx)
	}
	return sqlitedb.New(r.store.DB())
}

func (r *SqliteRemoteProjectionRepository) exec(ctx context.Context) sqliteRemoteExec {
	if tx, ok := unitofwork.TxFromContext(ctx); ok {
		return tx
	}
	return r.store.DB()
}

// inTx runs fn on the ambient unit-of-work transaction when one is in context
// (the caller owns the commit), else on a local transaction it commits itself.
// Used by the multi-statement membership replacements that must stay atomic.
func (r *SqliteRemoteProjectionRepository) inTx(ctx context.Context, fn func(db sqliteRemoteExec) error) error {
	if tx, ok := unitofwork.TxFromContext(ctx); ok {
		return fn(tx)
	}
	tx, err := r.store.DB().BeginTx(ctx, nil) // BEGIN IMMEDIATE (store _txlock=immediate)
	if err != nil {
		return fmt.Errorf("sqlite remote projection repo: begin tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck
	if err := fn(tx); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("sqlite remote projection repo: commit tx: %w", err)
	}
	return nil
}

// sqliteRemoteArgs binds one projection row in sqliteRemoteColumns order.
// updated_at is refreshed to now on every write, matching the pg upsert.
func sqliteRemoteArgs(rem *projections.Remote) []any {
	return []any{
		rem.ChannelID, rem.RemoteID, rem.Type, string(rem.Platform), rem.Name,
		dbutil.NullStr(rem.AvatarURL), dbutil.BoolToInt(rem.IsBlocked),
		dbutil.NullMillis(rem.PinnedAt), dbutil.BoolToInt(rem.Archived),
		dbutil.NullMillis(rem.MuteExpiration), dbutil.BoolToInt(rem.MarkedAsUnread),
		rem.UnreadMessageCount, dbutil.NullMillis(rem.LastMessageAt),
		dbutil.NullStrPtr(rem.LastMessageID), dbutil.NullMillis(rem.DeletedAt),
		dbutil.Millis(rem.CreatedAt), dbutil.Millis(time.Now()), rem.Version,
	}
}

// sqliteRemoteFromRow converts the sqlc-generated row into the read model.
// AvatarURL uses "" for the absent state (project-wide convention), which is why
// a NULL column collapses to the empty string here.
func sqliteRemoteFromRow(m sqlitedb.GatewayRemote) *projections.Remote {
	rem := &projections.Remote{
		ChannelID:          m.ChannelID,
		RemoteID:           m.RemoteID,
		Type:               m.Type,
		Platform:           channelenums.Platform(m.Platform),
		Name:               m.Name,
		IsBlocked:          dbutil.IntToBool(m.IsBlocked),
		Archived:           dbutil.IntToBool(m.Archived),
		MarkedAsUnread:     dbutil.IntToBool(m.MarkedAsUnread),
		UnreadMessageCount: int(m.UnreadMessageCount),
		PinnedAt:           dbutil.TimePtrFromMillis(m.PinnedAt),
		MuteExpiration:     dbutil.TimePtrFromMillis(m.MuteExpiration),
		LastMessageAt:      dbutil.TimePtrFromMillis(m.LastMessageAt),
		DeletedAt:          dbutil.TimePtrFromMillis(m.DeletedAt),
		CreatedAt:          dbutil.TimeFromMillis(m.CreatedAt),
		UpdatedAt:          dbutil.TimeFromMillis(m.UpdatedAt),
		Version:            m.Version,
	}
	if m.AvatarUrl.Valid {
		rem.AvatarURL = m.AvatarUrl.String
	}
	if m.LastMessageID.Valid {
		s := m.LastMessageID.String
		rem.LastMessageID = &s
	}
	return rem
}

// scanSqliteRemoteRows scans hand-written query output through the generated
// struct, so sqliteRemoteColumns is validated against the contract at compile
// time rather than at runtime.
func scanSqliteRemoteRows(rows *sql.Rows) ([]*projections.Remote, error) {
	var result []*projections.Remote
	for rows.Next() {
		var m sqlitedb.GatewayRemote
		if err := rows.Scan(
			&m.ChannelID, &m.RemoteID, &m.Type, &m.Platform, &m.Name,
			&m.AvatarUrl, &m.IsBlocked,
			&m.PinnedAt, &m.Archived, &m.MuteExpiration, &m.MarkedAsUnread,
			&m.UnreadMessageCount, &m.LastMessageAt, &m.LastMessageID, &m.DeletedAt,
			&m.CreatedAt, &m.UpdatedAt, &m.Version,
		); err != nil {
			return nil, err
		}
		result = append(result, sqliteRemoteFromRow(m))
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}
