// CONTEXT-ORIGIN: medscall/software/monorepo/packages/channel@ff66dbb1ee0fcd6212e5bf68879fa1d5a0a9cd1b (2026-07-20)
// Source path: packages/channel/internal/channel/repositories/channel/pg_channel_repository.go
// Harvested verbatim for the repository skill exemplar set — do not edit; re-harvest instead.
package instance

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"monorepo/api/internal/channel/entities"
	"monorepo/api/internal/channel/enums"
	sharedenums "monorepo/api/internal/shared/enums"
	sharedrepos "monorepo/api/internal/shared/repositories"
	"monorepo/api/internal/shared/services/unitofwork"
)

// PgChannelRepository is the projection-backed production implementation of
// ChannelRepository (T6). It reads and writes Channel aggregate state directly
// from the `channels` table populated by the channel projector.
//
// Strict 404 semantics (spec §16 decision 4): Find / FindByName /
// FindByOwnerAndPlatform return (nil, nil) on miss — no event-replay fallback.
// Save writes both domain events (audit log) and the projection row in the same
// unit-of-work transaction, so subsequent reads always find a row.
type PgChannelRepository struct {
	db              *sql.DB
	domainEventRepo sharedrepos.DomainEventRepository
}

// NewPgChannelRepository constructs the projection-backed repository.
func NewPgChannelRepository(
	db *sql.DB,
	domainEventRepo sharedrepos.DomainEventRepository,
) *PgChannelRepository {
	return &PgChannelRepository{
		db:              db,
		domainEventRepo: domainEventRepo,
	}
}

// compile-time interface satisfaction check.
var _ ChannelRepository = (*PgChannelRepository)(nil)

// -------------------------------------------------------------------------------
// ChannelRepository interface
// -------------------------------------------------------------------------------

// Find returns the Channel aggregate for the given id.
// Returns (nil, nil) on miss — strict 404, no event-replay fallback.
func (r *PgChannelRepository) Find(ctx context.Context, id string) (*entities.Channel, error) {
	if id == "" {
		return nil, nil
	}
	db := r.txOrDB(ctx)
	row := db.QueryRowContext(ctx,
		`SELECT id, owner_id, platform, name, owner_remote_id, credentials,
		        status, created_at, updated_at, version
		 FROM channels WHERE id = $1`,
		id,
	)
	ch, err := scanChannelEntity(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("pg channel repo: find: %w", err)
	}
	return ch, nil
}

// FindByName returns the Channel whose name matches the argument.
// Returns (nil, nil) when no live channel with that name exists.
// Deleted channels are treated as absent so the name can be reused.
func (r *PgChannelRepository) FindByName(ctx context.Context, name string) (*entities.Channel, error) {
	if name == "" {
		return nil, nil
	}
	db := r.txOrDB(ctx)
	row := db.QueryRowContext(ctx,
		`SELECT id, owner_id, platform, name, owner_remote_id, credentials,
		        status, created_at, updated_at, version
		 FROM channels WHERE name = $1 AND status != $2`,
		name, string(enums.ChannelStatusDeleted),
	)
	ch, err := scanChannelEntity(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("pg channel repo: find by name: %w", err)
	}
	return ch, nil
}

// FindByOwnerAndPlatform returns the most recently created Channel for the
// given (ownerID, platform) pair.
// Returns (nil, nil) when no row exists or when the channel is deleted.
func (r *PgChannelRepository) FindByOwnerAndPlatform(
	ctx context.Context, ownerID string, platform string,
) (*entities.Channel, error) {
	db := r.txOrDB(ctx)
	row := db.QueryRowContext(ctx,
		`SELECT id, owner_id, platform, name, owner_remote_id, credentials,
		        status, created_at, updated_at, version
		 FROM channels
		 WHERE owner_id = $1 AND platform = $2 AND status != $3
		 ORDER BY created_at DESC LIMIT 1`,
		ownerID, platform, string(enums.ChannelStatusDeleted),
	)
	ch, err := scanChannelEntity(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("pg channel repo: find by owner/platform: %w", err)
	}
	return ch, nil
}

// FindAll returns the paginated live channels for the given owner plus the
// total live-channel count. Deleted channels are excluded from both.
func (r *PgChannelRepository) FindAll(
	ctx context.Context, ownerID string, limit, offset int,
) ([]*entities.Channel, int, error) {
	db := r.txOrDB(ctx)

	var total int
	if err := db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM channels
		 WHERE owner_id = $1 AND status != $2`,
		ownerID, string(enums.ChannelStatusDeleted),
	).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("pg channel repo: count: %w", err)
	}

	rows, err := db.QueryContext(ctx,
		`SELECT id, owner_id, platform, name, owner_remote_id, credentials,
		        status, created_at, updated_at, version
		 FROM channels
		 WHERE owner_id = $1 AND status != $2
		 ORDER BY created_at DESC
		 LIMIT $3 OFFSET $4`,
		ownerID, string(enums.ChannelStatusDeleted), limit, offset,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("pg channel repo: list: %w", err)
	}
	defer rows.Close()

	var items []*entities.Channel
	for rows.Next() {
		ch, err := scanChannelEntity(rows)
		if err != nil {
			return nil, 0, fmt.Errorf("pg channel repo: list scan: %w", err)
		}
		items = append(items, ch)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("pg channel repo: list rows: %w", err)
	}
	return items, total, nil
}

// FindAllActive returns every non-deleted channel that has a stored session
// (owner_remote_id != ''). Used on startup to reconnect live sessions.
func (r *PgChannelRepository) FindAllActive(ctx context.Context) ([]*entities.Channel, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, owner_id, platform, name, owner_remote_id, credentials,
		        status, created_at, updated_at, version
		 FROM channels
		 WHERE status IN ($1, $2) AND owner_remote_id != ''
		 ORDER BY created_at ASC`,
		string(enums.ChannelStatusConnected),
		string(enums.ChannelStatusConnecting),
	)
	if err != nil {
		return nil, fmt.Errorf("pg channel repo: find all active: %w", err)
	}
	defer rows.Close()

	var items []*entities.Channel
	for rows.Next() {
		ch, err := scanChannelEntity(rows)
		if err != nil {
			return nil, fmt.Errorf("pg channel repo: find all active scan: %w", err)
		}
		items = append(items, ch)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("pg channel repo: find all active rows: %w", err)
	}
	return items, nil
}

// Save appends the aggregate's pulled domain events to the event log and
// upserts the projection row. Both writes use txOrDB(ctx): callers that
// wrap Save in a UnitOfWork transaction get full atomicity. Outside a UoW,
// the two writes run in separate tx. The event projector reconciles the
// projection row eventually, so the system remains consistent — but
// read-your-own-write inside the same function may briefly observe the
// old state if the process crashes between the two writes.
//
// Callers that need strict atomicity (e.g. a command that couples a
// channel save with a peer domain mutation) MUST use a UoW.
//
// Unlike the old EventSourcedChannelRepository, Save always writes the
// projection row — even when the aggregate has no new events — so that
// callers which mutate in-memory state without raising events still persist
// the current snapshot.
func (r *PgChannelRepository) Save(ctx context.Context, ch *entities.Channel) error {
	events := ch.PullDomainEvents()
	if len(events) > 0 {
		if err := r.domainEventRepo.SaveAll(ctx, events); err != nil {
			return fmt.Errorf("pg channel repo: save domain events: %w", err)
		}
	}

	db := r.txOrDB(ctx)
	credsJSON, err := marshalCredentials(ch.Credentials)
	if err != nil {
		return fmt.Errorf("pg channel repo: marshal credentials: %w", err)
	}

	now := time.Now().UTC()
	_, err = db.ExecContext(ctx,
		`INSERT INTO channels
		   (id, owner_id, platform, name, owner_remote_id, credentials,
		    status, created_at, updated_at, version)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		 ON CONFLICT (id) DO UPDATE SET
		   owner_id        = EXCLUDED.owner_id,
		   platform        = EXCLUDED.platform,
		   name            = EXCLUDED.name,
		   owner_remote_id = EXCLUDED.owner_remote_id,
		   credentials     = EXCLUDED.credentials,
		   status          = EXCLUDED.status,
		   updated_at      = EXCLUDED.updated_at,
		   version         = channels.version + 1`,
		ch.ID.String(),
		ch.OwnerID,
		string(ch.Platform),
		ch.Name,
		ch.OwnerRemoteID,
		credsJSON,
		string(ch.Status),
		ch.CreatedAt.UTC(),
		now,
		ch.Version,
	)
	if err != nil {
		return fmt.Errorf("pg channel repo: upsert: %w", err)
	}
	return nil
}

// Delete removes the channel row from the projection table.
// Deleting a non-existent channel is a no-op (matches legacy contract).
func (r *PgChannelRepository) Delete(ctx context.Context, id string) error {
	db := r.txOrDB(ctx)
	_, err := db.ExecContext(ctx,
		`DELETE FROM channels WHERE id = $1`,
		id,
	)
	if err != nil {
		return fmt.Errorf("pg channel repo: delete: %w", err)
	}
	return nil
}

// -------------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------------

// txOrDB returns the active transaction from ctx when present, otherwise the
// base DB handle.
func (r *PgChannelRepository) txOrDB(ctx context.Context) queryExecContext {
	if tx, ok := unitofwork.TxFromContext(ctx); ok {
		return tx
	}
	return r.db
}

// scanChannelEntity scans a row from the channels table into a Channel entity
// via ReconstructChannel — no events fired, no validation applied.
// It accepts the shared rowScanner interface (defined in pg_channel_projection_repository.go).
//
// Note: connected_at and disconnected_at columns are intentionally omitted from
// the SELECT column list because entities.Channel does not carry those fields.
// They are retained in the table for the projector and future analytics use.
func scanChannelEntity(row rowScanner) (*entities.Channel, error) {
	var (
		idStr         string
		ownerID       string
		platformStr   string
		name          string
		ownerRemoteID string
		credsRaw      []byte
		statusStr     string
		createdAt     time.Time
		updatedAt     time.Time
		version       int
	)
	err := row.Scan(
		&idStr, &ownerID, &platformStr, &name, &ownerRemoteID,
		&credsRaw, &statusStr,
		&createdAt, &updatedAt, &version,
	)
	if err != nil {
		return nil, err
	}

	id, err := uuid.Parse(idStr)
	if err != nil {
		return nil, fmt.Errorf("scanChannelEntity: invalid uuid %q: %w", idStr, err)
	}

	creds := json.RawMessage(credsRaw)
	if len(creds) == 0 {
		creds = json.RawMessage("{}")
	}

	return entities.ReconstructChannel(entities.ReconstructChannelParams{
		ID:            id,
		Name:          name,
		Platform:      sharedenums.Platform(platformStr),
		OwnerRemoteID: ownerRemoteID,
		Credentials:   creds,
		Status:        enums.ChannelStatus(statusStr),
		OwnerID:       ownerID,
		CreatedAt:     createdAt.UTC(),
		UpdatedAt:     updatedAt.UTC(),
		Version:       version,
	}), nil
}

// marshalCredentials returns the raw JSON bytes, defaulting to '{}' when the
// entity carries a nil or empty raw message.
func marshalCredentials(raw json.RawMessage) ([]byte, error) {
	if len(raw) == 0 {
		return []byte("{}"), nil
	}
	return raw, nil
}
