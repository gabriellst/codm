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
	"template/api-go/internal/shared/db/dbutil"
	"template/core-go/services/unitofwork"
)

// PgRemoteProjectionRepository implements RemoteProjectionRepository with
// Postgres. It stores and retrieves Remote projection rows from the
// `remotes` and `remote_memberships` tables.
//
// Whole-row Save/UpsertAll are used by projectors; atomic column mutations
// (ResetUnreadCount, UpdateMembership) are safe to call concurrently because
// each issues a single UPDATE or a DELETE+INSERT inside a transaction.
type PgRemoteProjectionRepository struct {
	db *sql.DB
}

// NewPgRemoteProjectionRepository constructs the read/projection-write repository.
func NewPgRemoteProjectionRepository(db *sql.DB) *PgRemoteProjectionRepository {
	return &PgRemoteProjectionRepository{db: db}
}

// compile-time interface satisfaction check.
var _ RemoteProjectionRepository = (*PgRemoteProjectionRepository)(nil)

// remoteChunkSize limits rows per batch INSERT to stay well under Postgres'
// 65535 parameter limit. remotes has 18 columns × 500 = 9000 params.
const remoteChunkSize = 500

// -------------------------------------------------------------------------------
// Reads
// -------------------------------------------------------------------------------

// Find returns the Remote projection for the given (channelID, remoteID) pair.
// Returns (nil, nil) when no row exists.
func (r *PgRemoteProjectionRepository) Find(ctx context.Context, channelID, remoteID string) (*projections.Remote, error) {
	db := r.txOrDB(ctx)

	row := db.QueryRowContext(ctx,
		`SELECT channel_id, remote_id, type, platform, name, avatar_url, is_blocked,
		        pinned_at, archived, mute_expiration, marked_as_unread,
		        unread_message_count, last_message_at, last_message_id, deleted_at,
		        created_at, updated_at, version
		 FROM remotes
		 WHERE channel_id = $1 AND remote_id = $2`,
		channelID, remoteID,
	)

	rem, err := scanRemote(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("pg remote projection repo: find: %w", err)
	}
	return rem, nil
}

// List returns a paginated slice of Remote projections for the given channel.
func (r *PgRemoteProjectionRepository) List(ctx context.Context, channelID string, opts ListOptions) ([]*projections.Remote, error) {
	db := r.txOrDB(ctx)

	args := []any{channelID}
	where := []string{"channel_id = $1"}

	if opts.Type != "" {
		args = append(args, string(opts.Type))
		where = append(where, fmt.Sprintf("type = $%d", len(args)))
	}
	if opts.Search != "" {
		args = append(args, "%"+opts.Search+"%")
		where = append(where, fmt.Sprintf("name ILIKE $%d", len(args)))
	}
	if opts.OnlyPinned {
		where = append(where, "pinned_at IS NOT NULL")
	}
	if opts.Cursor != nil {
		args = append(args, opts.Cursor.UTC())
		where = append(where, fmt.Sprintf("last_message_at < $%d", len(args)))
	}

	limit := opts.Limit
	if limit <= 0 {
		limit = 50
	}
	args = append(args, limit)

	q := fmt.Sprintf(
		`SELECT channel_id, remote_id, type, platform, name, avatar_url, is_blocked,
		        pinned_at, archived, mute_expiration, marked_as_unread,
		        unread_message_count, last_message_at, last_message_id, deleted_at,
		        created_at, updated_at, version
		 FROM remotes
		 WHERE %s
		 ORDER BY last_message_at DESC NULLS LAST
		 LIMIT $%d`,
		strings.Join(where, " AND "), len(args),
	)

	rows, err := db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("pg remote projection repo: list: %w", err)
	}
	defer rows.Close()

	return scanRemoteRows(rows)
}

// FindAllByChannel returns all Remote projections for a channel, keyed by remoteID.
// Returns an empty (non-nil) map when the channel has no remotes.
func (r *PgRemoteProjectionRepository) FindAllByChannel(ctx context.Context, channelID string) (map[string]*projections.Remote, error) {
	db := r.txOrDB(ctx)

	rows, err := db.QueryContext(ctx,
		`SELECT channel_id, remote_id, type, platform, name, avatar_url, is_blocked,
		        pinned_at, archived, mute_expiration, marked_as_unread,
		        unread_message_count, last_message_at, last_message_id, deleted_at,
		        created_at, updated_at, version
		 FROM remotes
		 WHERE channel_id = $1`,
		channelID,
	)
	if err != nil {
		return nil, fmt.Errorf("pg remote projection repo: find all by channel: %w", err)
	}
	defer rows.Close()

	result := make(map[string]*projections.Remote)
	for rows.Next() {
		rem, err := scanRemote(rows)
		if err != nil {
			return nil, fmt.Errorf("pg remote projection repo: scan: %w", err)
		}
		result[rem.RemoteID] = rem
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("pg remote projection repo: rows err: %w", err)
	}
	return result, nil
}

// -------------------------------------------------------------------------------
// Whole-row writes
// -------------------------------------------------------------------------------

// Save upserts the full Remote projection row.
func (r *PgRemoteProjectionRepository) Save(ctx context.Context, rem *projections.Remote) error {
	db := r.txOrDB(ctx)
	return upsertRemoteRow(ctx, db, rem)
}

// InsertIfNew inserts the Remote projection row only when no row with the same
// (channel_id, remote_id) exists. Returns inserted=true when a row was created,
// inserted=false on conflict (DO NOTHING). Used by RemoteCreatedProjector to
// implement first-write-wins semantics: if remote_updated or remote_synced ran
// first and created a stub, the later remote_created must not overwrite it.
func (r *PgRemoteProjectionRepository) InsertIfNew(ctx context.Context, rem *projections.Remote) (bool, error) {
	db := r.txOrDB(ctx)
	now := time.Now().UTC()

	var channelID string
	err := db.QueryRowContext(ctx,
		`INSERT INTO remotes
		   (channel_id, remote_id, type, platform, name, avatar_url, is_blocked, pinned_at, archived,
		    mute_expiration, marked_as_unread, unread_message_count, last_message_at,
		    deleted_at, created_at, updated_at, version)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
		 ON CONFLICT (channel_id, remote_id) DO NOTHING
		 RETURNING channel_id`,
		rem.ChannelID, rem.RemoteID, rem.Type, string(rem.Platform), rem.Name,
		dbutil.NullStr(rem.AvatarURL), rem.IsBlocked,
		dbutil.NullTime(rem.PinnedAt), rem.Archived, dbutil.NullTime(rem.MuteExpiration),
		rem.MarkedAsUnread, rem.UnreadMessageCount, dbutil.NullTime(rem.LastMessageAt),
		dbutil.NullTime(rem.DeletedAt), rem.CreatedAt.UTC(), now, rem.Version,
	).Scan(&channelID)
	if errors.Is(err, sql.ErrNoRows) {
		// ON CONFLICT DO NOTHING — no row returned means conflict.
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("pg remote projection repo: insert if new: %w", err)
	}
	return true, nil
}

// UpsertAll batch-upserts Remote projection rows. It processes records in
// chunks of 500 to stay under Postgres' 65535-parameter limit.
func (r *PgRemoteProjectionRepository) UpsertAll(ctx context.Context, remotes []*projections.Remote) error {
	if len(remotes) == 0 {
		return nil
	}

	db := r.txOrDB(ctx)

	for start := 0; start < len(remotes); start += remoteChunkSize {
		end := start + remoteChunkSize
		if end > len(remotes) {
			end = len(remotes)
		}
		if err := upsertRemoteChunk(ctx, db, remotes[start:end]); err != nil {
			return err
		}
	}
	slog.Debug("remotes upserted", "count", len(remotes))
	return nil
}

// UpsertContactSnapshot batch-upserts contact-owned fields (name, avatar_url) only.
// On conflict, only name, avatar_url, and updated_at are updated — derived fields
// (last_message_at, last_message_id, unread_message_count, pinned_at, archived, etc.)
// are preserved from the existing row.
// Processes records in chunks of 500 to stay under Postgres' parameter limit.
// Each row has 8 params → 500×8=4000 params per batch.
func (r *PgRemoteProjectionRepository) UpsertContactSnapshot(ctx context.Context, remotes []*projections.Remote) error {
	if len(remotes) == 0 {
		return nil
	}

	db := r.txOrDB(ctx)

	// contactSnapshotChunkSize is 500 rows × 8 params = 4000 params per batch.
	const contactSnapshotChunkSize = 500
	for start := 0; start < len(remotes); start += contactSnapshotChunkSize {
		end := start + contactSnapshotChunkSize
		if end > len(remotes) {
			end = len(remotes)
		}
		if err := upsertContactSnapshotChunk(ctx, db, remotes[start:end]); err != nil {
			return err
		}
	}
	slog.Debug("remotes contact snapshot upserted", "count", len(remotes))
	return nil
}

func upsertContactSnapshotChunk(ctx context.Context, db remoteQueryExecContext, chunk []*projections.Remote) error {
	now := time.Now().UTC()
	values := make([]string, 0, len(chunk))
	args := make([]any, 0, len(chunk)*8) // 8 bound params per row (version is the literal 1)
	pos := 1
	for _, rem := range chunk {
		values = append(values, fmt.Sprintf(
			"($%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,1)",
			pos, pos+1, pos+2, pos+3, pos+4, pos+5, pos+6, pos+7,
		))
		args = append(args,
			rem.ChannelID, rem.RemoteID, rem.Type, string(rem.Platform),
			rem.Name, dbutil.NullStr(rem.AvatarURL), rem.CreatedAt.UTC(), now,
		)
		pos += 8
	}

	q := fmt.Sprintf(
		`INSERT INTO remotes
		   (channel_id, remote_id, type, platform, name, avatar_url, created_at, updated_at, version)
		 VALUES %s
		 ON CONFLICT (channel_id, remote_id) DO UPDATE SET
		   name       = EXCLUDED.name,
		   avatar_url = EXCLUDED.avatar_url,
		   updated_at = EXCLUDED.updated_at,
		   version    = remotes.version + 1`,
		strings.Join(values, ","),
	)

	if _, err := db.ExecContext(ctx, q, args...); err != nil {
		return fmt.Errorf("pg remote projection repo: upsert contact snapshot chunk: %w", err)
	}
	return nil
}

func upsertRemoteChunk(ctx context.Context, db remoteQueryExecContext, chunk []*projections.Remote) error {
	now := time.Now().UTC()
	values := make([]string, 0, len(chunk))
	args := make([]any, 0, len(chunk)*18) // 18 columns per row
	pos := 1
	for _, rem := range chunk {
		values = append(values, fmt.Sprintf(
			"($%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d)",
			pos, pos+1, pos+2, pos+3, pos+4, pos+5, pos+6, pos+7, pos+8, pos+9, pos+10, pos+11, pos+12, pos+13, pos+14, pos+15, pos+16, pos+17,
		))
		args = append(args,
			rem.ChannelID, rem.RemoteID, rem.Type, string(rem.Platform), rem.Name, dbutil.NullStr(rem.AvatarURL),
			rem.IsBlocked, dbutil.NullTime(rem.PinnedAt), rem.Archived, dbutil.NullTime(rem.MuteExpiration),
			rem.MarkedAsUnread, rem.UnreadMessageCount, dbutil.NullTime(rem.LastMessageAt),
			dbutil.NullStrPtr(rem.LastMessageID), dbutil.NullTime(rem.DeletedAt), rem.CreatedAt.UTC(), now, rem.Version,
		)
		pos += 18
	}

	q := fmt.Sprintf(
		`INSERT INTO remotes
		   (channel_id, remote_id, type, platform, name, avatar_url, is_blocked, pinned_at, archived,
		    mute_expiration, marked_as_unread, unread_message_count, last_message_at,
		    last_message_id, deleted_at, created_at, updated_at, version)
		 VALUES %s
		 ON CONFLICT (channel_id, remote_id) DO UPDATE SET
		   type                = EXCLUDED.type,
		   platform            = EXCLUDED.platform,
		   name                = EXCLUDED.name,
		   avatar_url          = EXCLUDED.avatar_url,
		   is_blocked          = EXCLUDED.is_blocked,
		   pinned_at           = EXCLUDED.pinned_at,
		   archived            = EXCLUDED.archived,
		   mute_expiration     = EXCLUDED.mute_expiration,
		   marked_as_unread    = EXCLUDED.marked_as_unread,
		   unread_message_count= EXCLUDED.unread_message_count,
		   last_message_at     = EXCLUDED.last_message_at,
		   last_message_id     = EXCLUDED.last_message_id,
		   deleted_at          = EXCLUDED.deleted_at,
		   updated_at          = EXCLUDED.updated_at,
		   version             = remotes.version + 1`,
		strings.Join(values, ","),
	)

	if _, err := db.ExecContext(ctx, q, args...); err != nil {
		return fmt.Errorf("pg remote projection repo: upsert chunk: %w", err)
	}
	return nil
}

func upsertRemoteRow(ctx context.Context, db remoteQueryExecContext, rem *projections.Remote) error {
	now := time.Now().UTC()
	_, err := db.ExecContext(ctx,
		`INSERT INTO remotes
		   (channel_id, remote_id, type, platform, name, avatar_url, is_blocked, pinned_at, archived,
		    mute_expiration, marked_as_unread, unread_message_count, last_message_at,
		    last_message_id, deleted_at, created_at, updated_at, version)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
		 ON CONFLICT (channel_id, remote_id) DO UPDATE SET
		   type                = EXCLUDED.type,
		   platform            = EXCLUDED.platform,
		   name                = EXCLUDED.name,
		   avatar_url          = EXCLUDED.avatar_url,
		   is_blocked          = EXCLUDED.is_blocked,
		   pinned_at           = EXCLUDED.pinned_at,
		   archived            = EXCLUDED.archived,
		   mute_expiration     = EXCLUDED.mute_expiration,
		   marked_as_unread    = EXCLUDED.marked_as_unread,
		   unread_message_count= EXCLUDED.unread_message_count,
		   last_message_at     = EXCLUDED.last_message_at,
		   last_message_id     = EXCLUDED.last_message_id,
		   deleted_at          = EXCLUDED.deleted_at,
		   updated_at          = EXCLUDED.updated_at,
		   version             = remotes.version + 1`,
		rem.ChannelID, rem.RemoteID, rem.Type, string(rem.Platform), rem.Name,
		dbutil.NullStr(rem.AvatarURL), rem.IsBlocked,
		dbutil.NullTime(rem.PinnedAt), rem.Archived, dbutil.NullTime(rem.MuteExpiration),
		rem.MarkedAsUnread, rem.UnreadMessageCount, dbutil.NullTime(rem.LastMessageAt),
		dbutil.NullStrPtr(rem.LastMessageID), dbutil.NullTime(rem.DeletedAt), rem.CreatedAt.UTC(), now, rem.Version,
	)
	if err != nil {
		return fmt.Errorf("pg remote projection repo: save: %w", err)
	}
	return nil
}

// -------------------------------------------------------------------------------
// Atomic column mutations
// -------------------------------------------------------------------------------

// ResetUnreadCount atomically resets unread_message_count to 0 and clears
// the marked_as_unread flag.
func (r *PgRemoteProjectionRepository) ResetUnreadCount(ctx context.Context, channelID, remoteID string) error {
	db := r.txOrDB(ctx)
	_, err := db.ExecContext(ctx,
		`UPDATE remotes
		 SET unread_message_count = 0, marked_as_unread = FALSE, updated_at = NOW()
		 WHERE channel_id = $1 AND remote_id = $2`,
		channelID, remoteID,
	)
	if err != nil {
		return fmt.Errorf("pg remote projection repo: reset unread count: %w", err)
	}
	return nil
}

// UpdateMembership replaces the group membership list for (channelID, groupID)
// in a single transaction: it deletes all existing rows then batch-inserts the
// new members. If `members` is empty, the delete alone suffices.
//
// If the context carries an ambient UoW transaction (unitofwork.TxFromContext),
// both statements run on that transaction (caller owns the commit). Otherwise a
// local transaction is opened to preserve DELETE+INSERT atomicity.
func (r *PgRemoteProjectionRepository) UpdateMembership(ctx context.Context, channelID, groupID string, members []MembershipRow) error {
	if tx, ok := unitofwork.TxFromContext(ctx); ok {
		return r.updateMembershipOnTx(ctx, tx, channelID, groupID, members)
	}
	// No ambient tx — open a local one for DELETE+INSERT atomicity.
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("pg remote projection repo: begin tx for membership: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck
	if err := r.updateMembershipOnTx(ctx, tx, channelID, groupID, members); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("pg remote projection repo: commit membership tx: %w", err)
	}
	return nil
}

func (r *PgRemoteProjectionRepository) updateMembershipOnTx(ctx context.Context, tx remoteQueryExecContext, channelID, groupID string, members []MembershipRow) error {
	if _, err := tx.ExecContext(ctx,
		`DELETE FROM remote_memberships WHERE channel_id = $1 AND group_id = $2`,
		channelID, groupID,
	); err != nil {
		return fmt.Errorf("pg remote projection repo: delete memberships: %w", err)
	}

	if len(members) > 0 {
		values := make([]string, 0, len(members))
		args := make([]any, 0, len(members)*5)
		pos := 1
		for _, m := range members {
			values = append(values, fmt.Sprintf("($%d,$%d,$%d,$%d,$%d)", pos, pos+1, pos+2, pos+3, pos+4))
			args = append(args, channelID, groupID, m.MemberID, m.IsAdmin, m.JoinedAt.UTC())
			pos += 5
		}
		q := fmt.Sprintf(
			`INSERT INTO remote_memberships (channel_id, group_id, member_id, is_admin, joined_at)
			 VALUES %s
			 ON CONFLICT (channel_id, group_id, member_id) DO UPDATE SET
			   is_admin = EXCLUDED.is_admin, joined_at = EXCLUDED.joined_at`,
			strings.Join(values, ","),
		)
		if _, err := tx.ExecContext(ctx, q, args...); err != nil {
			return fmt.Errorf("pg remote projection repo: insert memberships: %w", err)
		}
	}
	return nil
}

// AddMember upserts a single member into the remote_memberships table.
// Uses INSERT … ON CONFLICT DO UPDATE so it is safe to call for repeated events.
// Respects an ambient UoW transaction if one is present in the context.
func (r *PgRemoteProjectionRepository) AddMember(ctx context.Context, channelID, groupID string, member MembershipRow) error {
	db := r.txOrDB(ctx)
	_, err := db.ExecContext(ctx,
		`INSERT INTO remote_memberships (channel_id, group_id, member_id, is_admin, joined_at)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (channel_id, group_id, member_id) DO UPDATE SET
		   is_admin  = EXCLUDED.is_admin,
		   joined_at = EXCLUDED.joined_at`,
		channelID, groupID, member.MemberID, member.IsAdmin, member.JoinedAt.UTC(),
	)
	if err != nil {
		return fmt.Errorf("pg remote projection repo: add member: %w", err)
	}
	return nil
}

// RemoveMember deletes a single member from the remote_memberships table.
// Respects an ambient UoW transaction if one is present in the context.
// A no-op if the member does not exist (idempotent).
func (r *PgRemoteProjectionRepository) RemoveMember(ctx context.Context, channelID, groupID, memberID string) error {
	db := r.txOrDB(ctx)
	_, err := db.ExecContext(ctx,
		`DELETE FROM remote_memberships
		 WHERE channel_id = $1 AND group_id = $2 AND member_id = $3`,
		channelID, groupID, memberID,
	)
	if err != nil {
		return fmt.Errorf("pg remote projection repo: remove member: %w", err)
	}
	return nil
}

// BulkUpdateMemberships replaces all group memberships for a channel in one
// round-trip: DELETE all existing rows then batch-INSERT the new set.
// The map key is the group remote_id; value is the list of members.
// Chunk size is 2000 rows (5 params × 2000 = 10 000, well under 65 535).
//
// If the context carries an ambient UoW transaction (unitofwork.TxFromContext),
// both statements run on that transaction (caller owns the commit). Otherwise a
// local transaction is opened to preserve DELETE+INSERT atomicity.
func (r *PgRemoteProjectionRepository) BulkUpdateMemberships(ctx context.Context, channelID string, groups map[string][]MembershipRow) error {
	if len(groups) == 0 {
		return nil
	}
	if tx, ok := unitofwork.TxFromContext(ctx); ok {
		return r.doBulkUpdateMemberships(ctx, tx, channelID, groups)
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("pg remote projection repo: begin tx for bulk membership: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck
	if err := r.doBulkUpdateMemberships(ctx, tx, channelID, groups); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *PgRemoteProjectionRepository) doBulkUpdateMemberships(ctx context.Context, db remoteQueryExecContext, channelID string, groups map[string][]MembershipRow) error {
	// Clear all memberships for this channel first.
	if _, err := db.ExecContext(ctx,
		`DELETE FROM remote_memberships WHERE channel_id = $1`, channelID,
	); err != nil {
		return fmt.Errorf("pg remote projection repo: bulk delete memberships: %w", err)
	}

	// Collect all rows.
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

	// Chunk into batches of 2000 rows (5 params × 2000 = 10 000, well under 65 535).
	const chunkSize = 2000
	for start := 0; start < len(rows); start += chunkSize {
		end := start + chunkSize
		if end > len(rows) {
			end = len(rows)
		}
		chunk := rows[start:end]

		placeholders := make([]string, len(chunk))
		args := make([]any, 0, len(chunk)*5)
		pos := 1
		for i, row := range chunk {
			placeholders[i] = fmt.Sprintf("($%d,$%d,$%d,$%d,$%d)", pos, pos+1, pos+2, pos+3, pos+4)
			args = append(args, channelID, row.groupID, row.memberID, row.isAdmin, row.joinedAt.UTC())
			pos += 5
		}
		if _, err := db.ExecContext(ctx,
			fmt.Sprintf(
				`INSERT INTO remote_memberships (channel_id, group_id, member_id, is_admin, joined_at)
				 VALUES %s
				 ON CONFLICT (channel_id, group_id, member_id) DO UPDATE SET is_admin = EXCLUDED.is_admin`,
				strings.Join(placeholders, ","),
			),
			args...,
		); err != nil {
			return fmt.Errorf("pg remote projection repo: bulk insert memberships: %w", err)
		}
	}
	return nil
}

// UpdateAvatar sets avatar_url on a single remote row.
// No-op when the row does not exist.
func (r *PgRemoteProjectionRepository) UpdateAvatar(ctx context.Context, channelID, remoteID, avatarURL string) error {
	db := r.txOrDB(ctx)
	_, err := db.ExecContext(ctx,
		`UPDATE remotes SET avatar_url = $1, updated_at = NOW()
		 WHERE channel_id = $2 AND remote_id = $3`,
		avatarURL, channelID, remoteID,
	)
	if err != nil {
		return fmt.Errorf("pg remote projection repo: update avatar: %w", err)
	}
	return nil
}

// -------------------------------------------------------------------------------
// Internal helpers
// -------------------------------------------------------------------------------

func (r *PgRemoteProjectionRepository) txOrDB(ctx context.Context) remoteQueryExecContext {
	if tx, ok := unitofwork.TxFromContext(ctx); ok {
		return tx
	}
	return r.db
}

type remoteQueryExecContext interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// -------------------------------------------------------------------------------
// Scanning helpers
// -------------------------------------------------------------------------------

func scanRemote(row rowScanner) (*projections.Remote, error) {
	var rem projections.Remote
	var platform string
	var avatarURL sql.NullString
	var lastMessageID sql.NullString
	var pinnedAt, muteExpiration, lastMessageAt, deletedAt sql.NullTime
	err := row.Scan(
		&rem.ChannelID, &rem.RemoteID, &rem.Type, &platform, &rem.Name,
		&avatarURL, &rem.IsBlocked,
		&pinnedAt, &rem.Archived, &muteExpiration, &rem.MarkedAsUnread,
		&rem.UnreadMessageCount, &lastMessageAt, &lastMessageID, &deletedAt,
		&rem.CreatedAt, &rem.UpdatedAt, &rem.Version,
	)
	if err != nil {
		return nil, err
	}
	rem.Platform = channelenums.Platform(platform)
	if avatarURL.Valid {
		rem.AvatarURL = avatarURL.String
	}
	if lastMessageID.Valid {
		s := lastMessageID.String
		rem.LastMessageID = &s
	}
	rem.PinnedAt = dbutil.TimePtr(pinnedAt)
	rem.MuteExpiration = dbutil.TimePtr(muteExpiration)
	rem.LastMessageAt = dbutil.TimePtr(lastMessageAt)
	rem.DeletedAt = dbutil.TimePtr(deletedAt)
	return &rem, nil
}

func scanRemoteRows(rows *sql.Rows) ([]*projections.Remote, error) {
	var result []*projections.Remote
	for rows.Next() {
		rem, err := scanRemote(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, rem)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

// rowScanner is the common interface for *sql.Row and *sql.Rows.
type rowScanner interface {
	Scan(dest ...any) error
}

// -------------------------------------------------------------------------------
// Apply* stubs — implementations land in Tasks 7-9
// -------------------------------------------------------------------------------

// ApplyLatestMessage folds a single message fact into the Remote projection's
// derived fields. Preview columns (last_message_id, last_message_at) move
// forward-only by occurred_at; unread_message_count always bumps on received,
// regardless of whether this message wins the preview slot.
func (r *PgRemoteProjectionRepository) ApplyLatestMessage(ctx context.Context, msg *projections.Message) error {
	db := r.txOrDB(ctx)
	incoming := 0
	if msg.Direction == string(channelenums.DirectionReceived) {
		incoming = 1
	}
	_, err := db.ExecContext(ctx,
		`UPDATE remotes SET
		   last_message_id      = CASE WHEN last_message_at IS NULL OR last_message_at < $4
		                               THEN $3::uuid ELSE last_message_id END,
		   last_message_at      = CASE WHEN last_message_at IS NULL OR last_message_at < $4
		                               THEN $4 ELSE last_message_at END,
		   unread_message_count = unread_message_count + $5,
		   updated_at           = NOW()
		 WHERE channel_id = $1 AND remote_id = $2`,
		msg.ChannelID, msg.RemoteID, msg.ID, msg.OccurredAt.UTC(), incoming,
	)
	if err != nil {
		return fmt.Errorf("pg remote projection repo: apply latest message: %w", err)
	}
	return nil
}

// ApplyHistoricalMessages folds a batch of historical message facts into the
// Remote projection. Preview columns (last_message_id, last_message_at) move
// forward-only. Unread count is NOT bumped — historical messages are treated
// as already read.
//
// This is the history-sync path only. For live received messages use
// ApplyLatestMessage, which still bumps unread_message_count.
func (r *PgRemoteProjectionRepository) ApplyHistoricalMessages(ctx context.Context, msgs []*projections.Message) error {
	db := r.txOrDB(ctx)
	for _, msg := range msgs {
		if err := applyHistoricalMessage(ctx, db, msg); err != nil {
			return err
		}
	}
	return nil
}

// applyHistoricalMessage issues the forward-only preview UPDATE without
// touching unread_message_count. Used exclusively by ApplyHistoricalMessages.
func applyHistoricalMessage(ctx context.Context, db remoteQueryExecContext, msg *projections.Message) error {
	_, err := db.ExecContext(ctx,
		`UPDATE remotes SET
		   last_message_id = CASE WHEN last_message_at IS NULL OR last_message_at < $4
		                          THEN $3::uuid ELSE last_message_id END,
		   last_message_at = CASE WHEN last_message_at IS NULL OR last_message_at < $4
		                          THEN $4 ELSE last_message_at END,
		   updated_at      = NOW()
		 WHERE channel_id = $1 AND remote_id = $2`,
		msg.ChannelID, msg.RemoteID, msg.ID, msg.OccurredAt.UTC(),
	)
	if err != nil {
		return fmt.Errorf("pg remote projection repo: apply historical message: %w", err)
	}
	return nil
}

// BackfillLastMessagePreview populates last_message_at and last_message_id for
// any remote row that still has a NULL last_message_at but has messages in the
// messages table. A single UPDATE…FROM handles all remotes for the channel in
// one round-trip — safe to run multiple times (forward-only CASE guard).
func (r *PgRemoteProjectionRepository) BackfillLastMessagePreview(ctx context.Context, channelID string) error {
	db := r.txOrDB(ctx)
	_, err := db.ExecContext(ctx,
		`UPDATE remotes r
		 SET
		   last_message_at = sub.max_occurred,
		   last_message_id = (
		     SELECT id FROM messages
		     WHERE channel_id = $1 AND remote_id = r.remote_id
		     ORDER BY occurred_at DESC
		     LIMIT 1
		   ),
		   updated_at = NOW()
		 FROM (
		   SELECT remote_id, MAX(occurred_at) AS max_occurred
		   FROM messages
		   WHERE channel_id = $1
		   GROUP BY remote_id
		 ) sub
		 WHERE r.channel_id = $1
		   AND r.remote_id  = sub.remote_id
		   AND (r.last_message_at IS NULL OR r.last_message_at < sub.max_occurred)`,
		channelID,
	)
	if err != nil {
		return fmt.Errorf("pg remote projection repo: backfill last message preview: %w", err)
	}
	return nil
}

// RecomputePreviewIfLatest clears or recomputes the preview columns when the
// currently-referenced message is deleted. Guarded by expectedMessageID — when
// the remote has already advanced past it, the UPDATE matches zero rows and
// the call is a no-op. Scalar subqueries return NULL when no non-deleted
// message remains, correctly clearing the preview columns.
func (r *PgRemoteProjectionRepository) RecomputePreviewIfLatest(ctx context.Context, channelID, remoteID, expectedMessageID string) error {
	db := r.txOrDB(ctx)
	_, err := db.ExecContext(ctx,
		`UPDATE remotes SET
		   last_message_id = (
		     SELECT id FROM messages
		     WHERE channel_id = $1 AND remote_id = $2 AND deleted_at IS NULL
		     ORDER BY occurred_at DESC LIMIT 1
		   ),
		   last_message_at = (
		     SELECT occurred_at FROM messages
		     WHERE channel_id = $1 AND remote_id = $2 AND deleted_at IS NULL
		     ORDER BY occurred_at DESC LIMIT 1
		   ),
		   updated_at = NOW()
		 WHERE channel_id = $1 AND remote_id = $2 AND last_message_id = $3::uuid`,
		channelID, remoteID, expectedMessageID,
	)
	if err != nil {
		return fmt.Errorf("pg remote projection repo: recompute preview if latest: %w", err)
	}
	return nil
}
