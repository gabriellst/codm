package projections

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"template/contracts-go/wire"
	"template/core-go/services/unitofwork"
)

// pgChannelProjectionRepository implements ChannelProjectionRepository with
// Postgres. Rows live in gateway.channels (schema-qualified — the table is
// owned by the `gateway` pg schema declared in packages/contracts, outside this
// service's search_path).
type pgChannelProjectionRepository struct {
	db *sql.DB
}

// NewPgChannelProjectionRepository returns the interface type so fx binds directly.
func NewPgChannelProjectionRepository(db *sql.DB) ChannelProjectionRepository {
	return &pgChannelProjectionRepository{db: db}
}

var _ ChannelProjectionRepository = (*pgChannelProjectionRepository)(nil)

const channelColumns = `id, owner_id, kind, status, account_detail, created_at, updated_at`

func (r *pgChannelProjectionRepository) Upsert(ctx context.Context, row *ChannelProjection) error {
	db := r.txOrDB(ctx)
	_, err := db.ExecContext(ctx,
		`INSERT INTO gateway.channels (id, owner_id, kind, status, account_detail, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7)
		 ON CONFLICT (id) DO UPDATE SET
		   status         = EXCLUDED.status,
		   account_detail = EXCLUDED.account_detail,
		   updated_at     = EXCLUDED.updated_at`,
		row.ID, row.OwnerID, string(row.Kind), string(row.Status),
		row.AccountDetail, row.CreatedAt.UTC(), row.UpdatedAt.UTC(),
	)
	if err != nil {
		return fmt.Errorf("pg channel projection: upsert: %w", err)
	}
	return nil
}

func (r *pgChannelProjectionRepository) SetStatus(ctx context.Context, id string, status wire.ChannelStatus, accountDetail string) error {
	db := r.txOrDB(ctx)
	_, err := db.ExecContext(ctx,
		`UPDATE gateway.channels
		 SET status = $2,
		     account_detail = CASE WHEN $3 <> '' THEN $3 ELSE account_detail END,
		     updated_at = $4
		 WHERE id = $1`,
		id, string(status), accountDetail, time.Now().UTC(),
	)
	if err != nil {
		return fmt.Errorf("pg channel projection: set status: %w", err)
	}
	return nil
}

func (r *pgChannelProjectionRepository) FindByID(ctx context.Context, id string) (*ChannelProjection, error) {
	db := r.txOrDB(ctx)
	row := db.QueryRowContext(ctx,
		`SELECT `+channelColumns+` FROM gateway.channels WHERE id = $1`, id)
	return scanOne(row)
}

func (r *pgChannelProjectionRepository) FindByOwnerAndKind(ctx context.Context, ownerID string, kind wire.ChannelKind) (*ChannelProjection, error) {
	db := r.txOrDB(ctx)
	row := db.QueryRowContext(ctx,
		`SELECT `+channelColumns+` FROM gateway.channels WHERE owner_id = $1 AND kind = $2
		 ORDER BY created_at DESC LIMIT 1`, ownerID, string(kind))
	return scanOne(row)
}

func (r *pgChannelProjectionRepository) ListByOwner(ctx context.Context, ownerID string) ([]*ChannelProjection, error) {
	db := r.txOrDB(ctx)
	rows, err := db.QueryContext(ctx,
		`SELECT `+channelColumns+` FROM gateway.channels WHERE owner_id = $1 ORDER BY created_at DESC`, ownerID)
	if err != nil {
		return nil, fmt.Errorf("pg channel projection: list by owner: %w", err)
	}
	defer rows.Close()

	var out []*ChannelProjection
	for rows.Next() {
		p, scanErr := scanRow(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ── helpers ──────────────────────────────────────────────────────────────────

func (r *pgChannelProjectionRepository) txOrDB(ctx context.Context) channelExecContext {
	if tx, ok := unitofwork.TxFromContext(ctx); ok {
		return tx
	}
	return r.db
}

type channelExecContext interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

type channelScanner interface {
	Scan(dest ...any) error
}

func scanRow(s channelScanner) (*ChannelProjection, error) {
	var p ChannelProjection
	var kind, status string
	if err := s.Scan(&p.ID, &p.OwnerID, &kind, &status, &p.AccountDetail, &p.CreatedAt, &p.UpdatedAt); err != nil {
		return nil, err
	}
	p.Kind = wire.ChannelKind(kind)
	p.Status = wire.ChannelStatus(status)
	return &p, nil
}

func scanOne(row *sql.Row) (*ChannelProjection, error) {
	p, err := scanRow(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("pg channel projection: scan: %w", err)
	}
	return p, nil
}
