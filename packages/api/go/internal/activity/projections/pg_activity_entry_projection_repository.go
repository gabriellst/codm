package projections

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"template/core-go/services/unitofwork"
)

// pgActivityEntryProjectionRepository implements ActivityEntryProjectionRepository
// with Postgres. Rows live in activity.activity_entries (schema-qualified — the
// table is owned by the `activity` pg schema declared in packages/contracts,
// outside this service's search_path).
//
// InsertIfNew uses ON CONFLICT DO NOTHING against the
// (owner_id, event_name, entity_id) unique index for idempotent creation.
type pgActivityEntryProjectionRepository struct {
	db *sql.DB
}

// NewPgActivityEntryProjectionRepository constructs the Postgres implementation.
// Returns the interface type so fx can bind without wrapping.
func NewPgActivityEntryProjectionRepository(db *sql.DB) ActivityEntryProjectionRepository {
	return &pgActivityEntryProjectionRepository{db: db}
}

// compile-time interface satisfaction check.
var _ ActivityEntryProjectionRepository = (*pgActivityEntryProjectionRepository)(nil)

const activityEntryColumns = `id, owner_id, event_name, entity_id,
	       first_occurred_at, last_occurred_at, occurrence_count, recorded_at, version`

// FindByKey returns the ActivityEntry for the (ownerID, eventName, entityID)
// logical fact. Returns (nil, nil) when no row exists.
func (r *pgActivityEntryProjectionRepository) FindByKey(ctx context.Context, ownerID, eventName, entityID string) (*ActivityEntry, error) {
	db := r.txOrDB(ctx)

	row := db.QueryRowContext(ctx,
		`SELECT `+activityEntryColumns+`
		 FROM activity.activity_entries
		 WHERE owner_id = $1 AND event_name = $2 AND entity_id = $3`,
		ownerID, eventName, entityID,
	)

	entry, err := scanActivityEntry(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("pg activity entry projection repo: find by key: %w", err)
	}
	return entry, nil
}

// ListByOwner returns a cursor-paginated, newest-first slice of ActivityEntry
// rows for the given owner. When opts.Before is set, only entries with
// last_occurred_at strictly before that time are returned.
func (r *pgActivityEntryProjectionRepository) ListByOwner(ctx context.Context, ownerID string, opts CursorOptions) ([]*ActivityEntry, error) {
	db := r.txOrDB(ctx)

	args := []any{ownerID}
	where := "owner_id = $1"

	if opts.Before != nil {
		args = append(args, opts.Before.UTC())
		where += fmt.Sprintf(" AND last_occurred_at < $%d", len(args))
	}

	limit := opts.Limit
	if limit <= 0 {
		limit = 50
	}
	args = append(args, limit)

	q := fmt.Sprintf(
		`SELECT `+activityEntryColumns+`
		 FROM activity.activity_entries
		 WHERE %s
		 ORDER BY last_occurred_at DESC, recorded_at DESC
		 LIMIT $%d`,
		where, len(args),
	)

	rows, err := db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("pg activity entry projection repo: list by owner: %w", err)
	}
	defer rows.Close()

	return scanActivityEntryRows(rows)
}

// Save upserts the full ActivityEntry row (canonical write of the
// find → ApplyOccurrence → save path).
func (r *pgActivityEntryProjectionRepository) Save(ctx context.Context, entry *ActivityEntry) error {
	db := r.txOrDB(ctx)

	_, err := db.ExecContext(ctx,
		`INSERT INTO activity.activity_entries
		   (id, owner_id, event_name, entity_id,
		    first_occurred_at, last_occurred_at, occurrence_count, recorded_at, version)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		 ON CONFLICT (id) DO UPDATE SET
		   last_occurred_at = EXCLUDED.last_occurred_at,
		   occurrence_count = EXCLUDED.occurrence_count,
		   version          = activity_entries.version + 1`,
		entry.ID, entry.OwnerID, entry.EventName, entry.EntityID,
		entry.FirstOccurredAt.UTC(), entry.LastOccurredAt.UTC(),
		entry.OccurrenceCount, entry.RecordedAt.UTC(), entry.Version,
	)
	if err != nil {
		return fmt.Errorf("pg activity entry projection repo: save: %w", err)
	}
	return nil
}

// InsertIfNew inserts the ActivityEntry row only when no row for the same
// (owner_id, event_name, entity_id) fact exists. Returns inserted=true when a
// row was created, inserted=false on conflict (idempotent duplicate).
func (r *pgActivityEntryProjectionRepository) InsertIfNew(ctx context.Context, entry *ActivityEntry) (bool, error) {
	db := r.txOrDB(ctx)

	var id string
	err := db.QueryRowContext(ctx,
		`INSERT INTO activity.activity_entries
		   (id, owner_id, event_name, entity_id,
		    first_occurred_at, last_occurred_at, occurrence_count, recorded_at, version)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		 ON CONFLICT (owner_id, event_name, entity_id) DO NOTHING
		 RETURNING id`,
		entry.ID, entry.OwnerID, entry.EventName, entry.EntityID,
		entry.FirstOccurredAt.UTC(), entry.LastOccurredAt.UTC(),
		entry.OccurrenceCount, entry.RecordedAt.UTC(), entry.Version,
	).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		// ON CONFLICT DO NOTHING — no row returned means conflict.
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("pg activity entry projection repo: insert if new: %w", err)
	}
	return true, nil
}

// -------------------------------------------------------------------------------
// Internal helpers
// -------------------------------------------------------------------------------

func (r *pgActivityEntryProjectionRepository) txOrDB(ctx context.Context) activityQueryExecContext {
	if tx, ok := unitofwork.TxFromContext(ctx); ok {
		return tx
	}
	return r.db
}

type activityQueryExecContext interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

type activityRowScanner interface {
	Scan(dest ...any) error
}

func scanActivityEntry(row activityRowScanner) (*ActivityEntry, error) {
	var entry ActivityEntry
	err := row.Scan(
		&entry.ID, &entry.OwnerID, &entry.EventName, &entry.EntityID,
		&entry.FirstOccurredAt, &entry.LastOccurredAt,
		&entry.OccurrenceCount, &entry.RecordedAt, &entry.Version,
	)
	if err != nil {
		return nil, err
	}
	return &entry, nil
}

func scanActivityEntryRows(rows *sql.Rows) ([]*ActivityEntry, error) {
	var result []*ActivityEntry
	for rows.Next() {
		entry, err := scanActivityEntry(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}
