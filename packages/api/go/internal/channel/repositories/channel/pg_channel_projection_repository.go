package instance

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"template/api-go/internal/channel/projections"
	"template/api-go/internal/shared/services/unitofwork"
)

// PgChannelProjectionRepository implements ChannelProjectionRepository with
// Postgres. It stores and retrieves Channel projection rows from the `channels`
// table. The projector calls Save; query handlers call Find and ListByOwner.
type PgChannelProjectionRepository struct {
	db *sql.DB
}

// NewPgChannelProjectionRepository constructs the projection repository.
func NewPgChannelProjectionRepository(db *sql.DB) *PgChannelProjectionRepository {
	return &PgChannelProjectionRepository{db: db}
}

// compile-time interface satisfaction check.
var _ ChannelProjectionRepository = (*PgChannelProjectionRepository)(nil)

// Find returns the Channel projection for the given channelID.
// Returns (nil, nil) when no row exists.
func (r *PgChannelProjectionRepository) Find(ctx context.Context, channelID string) (*projections.Channel, error) {
	db := r.txOrDB(ctx)

	row := db.QueryRowContext(ctx,
		`SELECT id, owner_id, platform, status, connected_at, disconnected_at,
		        created_at, updated_at, version
		 FROM channels WHERE id = $1`,
		channelID,
	)

	ch, err := scanChannel(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("pg channel projection repo: find: %w", err)
	}
	return ch, nil
}

// ListByOwner returns all Channel projections for the given ownerID, ordered
// newest first.
func (r *PgChannelProjectionRepository) ListByOwner(ctx context.Context, ownerID string) ([]*projections.Channel, error) {
	db := r.txOrDB(ctx)

	rows, err := db.QueryContext(ctx,
		`SELECT id, owner_id, platform, status, connected_at, disconnected_at,
		        created_at, updated_at, version
		 FROM channels WHERE owner_id = $1 ORDER BY created_at DESC`,
		ownerID,
	)
	if err != nil {
		return nil, fmt.Errorf("pg channel projection repo: list by owner: %w", err)
	}
	defer rows.Close()

	var result []*projections.Channel
	for rows.Next() {
		ch, err := scanChannel(rows)
		if err != nil {
			return nil, fmt.Errorf("pg channel projection repo: scan: %w", err)
		}
		result = append(result, ch)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("pg channel projection repo: rows err: %w", err)
	}
	return result, nil
}

// Save upserts the Channel projection row. Increments version on update.
func (r *PgChannelProjectionRepository) Save(ctx context.Context, ch *projections.Channel) error {
	db := r.txOrDB(ctx)

	now := time.Now().UTC()
	_, err := db.ExecContext(ctx,
		`INSERT INTO channels
		   (id, owner_id, platform, status, connected_at, disconnected_at,
		    created_at, updated_at, version)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		 ON CONFLICT (id) DO UPDATE SET
		   owner_id        = EXCLUDED.owner_id,
		   platform        = EXCLUDED.platform,
		   status          = EXCLUDED.status,
		   connected_at    = EXCLUDED.connected_at,
		   disconnected_at = EXCLUDED.disconnected_at,
		   updated_at      = EXCLUDED.updated_at,
		   version         = channels.version + 1`,
		ch.ID, ch.OwnerID, ch.Platform, ch.Status,
		nullTime(ch.ConnectedAt), nullTime(ch.DisconnectedAt),
		ch.CreatedAt.UTC(), now, ch.Version,
	)
	if err != nil {
		return fmt.Errorf("pg channel projection repo: save: %w", err)
	}
	return nil
}

// txOrDB returns the active transaction from ctx when present, otherwise the base DB.
func (r *PgChannelProjectionRepository) txOrDB(ctx context.Context) queryExecContext {
	if tx, ok := unitofwork.TxFromContext(ctx); ok {
		return tx
	}
	return r.db
}

// queryExecContext is a common interface satisfied by both *sql.DB and *sql.Tx.
type queryExecContext interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// -------------------------------------------------------------------------------
// Scanning helpers
// -------------------------------------------------------------------------------

type rowScanner interface {
	Scan(dest ...any) error
}

func scanChannel(row rowScanner) (*projections.Channel, error) {
	var ch projections.Channel
	var connectedAt, disconnectedAt sql.NullTime
	err := row.Scan(
		&ch.ID, &ch.OwnerID, &ch.Platform, &ch.Status,
		&connectedAt, &disconnectedAt,
		&ch.CreatedAt, &ch.UpdatedAt, &ch.Version,
	)
	if err != nil {
		return nil, err
	}
	if connectedAt.Valid {
		t := connectedAt.Time.UTC()
		ch.ConnectedAt = &t
	}
	if disconnectedAt.Valid {
		t := disconnectedAt.Time.UTC()
		ch.DisconnectedAt = &t
	}
	return &ch, nil
}

// nullTime converts a *time.Time pointer to sql.NullTime for nullable columns.
func nullTime(t *time.Time) sql.NullTime {
	if t == nil {
		return sql.NullTime{}
	}
	return sql.NullTime{Time: t.UTC(), Valid: true}
}
