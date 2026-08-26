package channel

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"template/api-go/internal/channel/entities"
	"template/api-go/internal/channel/enums"
	sqlitedb "template/api-go/internal/shared/db/sqlite/gen"
	"template/core-go/db/dbutil"
	"template/core-go/db/sqlite"
	sharedrepos "template/core-go/repositories"
	"template/core-go/services/unitofwork"
)

// SqliteChannelRepository is the
// projection-backed implementation of ChannelRepository over the SHARED SQLite
// store (gateway_channels), replacing the split-DB Postgres handle.
//
// Everything the pg implementation guaranteed is preserved:
//   - Strict 404 on miss (Find / FindByName / FindByOwnerAndPlatform return
//     (nil, nil)); no event-replay fallback.
//   - Save appends the aggregate pulled domain events through
//     DomainEventRepository and upserts the row; both join the ambient unit of
//     work (unitofwork.TxFromContext) when the caller opened one.
//
// SQL dialect deltas vs the pg original (all mechanical, see the sqlite schema
// at packages/contracts/src/db/sqlite/channel.ts):
//   - table `channels` -> `gateway_channels` (pgSchema namespace became a prefix)
//   - $N placeholders  -> ?N
//   - timestamptz      -> INTEGER unix-millis (dbutil.Millis / TimeFromMillis)
//   - uuid columns     -> TEXT, so no ::uuid casts and ids scan as plain strings
//   - jsonb            -> TEXT holding JSON
//
// The static reads/writes go through the sqlc-generated queries
// (sqlitedb.Queries): the generated GatewayChannel struct is the compile-time
// drift guard: a contract column change breaks the build. Only the upsert is
// hand-written, because it binds `gateway_channels.version + 1` inside ON
// CONFLICT DO UPDATE which the sqlc arg rewriter does not model.
type SqliteChannelRepository struct {
	store           *sqlite.SqliteStore
	domainEventRepo sharedrepos.DomainEventRepository
}

// NewSqliteChannelRepository constructs the projection-backed repository over the
// shared SQLite store.
func NewSqliteChannelRepository(
	store *sqlite.SqliteStore,
	domainEventRepo sharedrepos.DomainEventRepository,
) *SqliteChannelRepository {
	return &SqliteChannelRepository{store: store, domainEventRepo: domainEventRepo}
}

// compile-time interface satisfaction check.
var _ ChannelRepository = (*SqliteChannelRepository)(nil)

// -------------------------------------------------------------------------------
// ChannelRepository interface
// -------------------------------------------------------------------------------

// Find returns the Channel aggregate for the given id, or (nil, nil) on miss.
func (r *SqliteChannelRepository) Find(ctx context.Context, id string) (*entities.Channel, error) {
	if id == "" {
		return nil, nil
	}
	row, err := r.queries(ctx).GetGatewayChannel(ctx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("sqlite channel repo: find: %w", err)
	}
	return hydrateChannel(row)
}

// FindByName returns the live Channel with that name, or (nil, nil) when absent.
// Deleted channels are treated as absent so the name can be reused.
func (r *SqliteChannelRepository) FindByName(ctx context.Context, name string) (*entities.Channel, error) {
	if name == "" {
		return nil, nil
	}
	row, err := r.queries(ctx).GetGatewayChannelByName(ctx, sqlitedb.GetGatewayChannelByNameParams{
		Name:          name,
		DeletedStatus: string(enums.ChannelStatusDeleted),
	})
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("sqlite channel repo: find by name: %w", err)
	}
	return hydrateChannel(row)
}

// FindByOwnerAndPlatform returns the most recently created live Channel for the
// (ownerID, platform) pair, or (nil, nil) when none exists.
func (r *SqliteChannelRepository) FindByOwnerAndPlatform(
	ctx context.Context, ownerID string, platform string,
) (*entities.Channel, error) {
	row, err := r.queries(ctx).GetGatewayChannelByOwnerPlatform(ctx, sqlitedb.GetGatewayChannelByOwnerPlatformParams{
		OwnerID:       ownerID,
		Platform:      platform,
		DeletedStatus: string(enums.ChannelStatusDeleted),
	})
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("sqlite channel repo: find by owner/platform: %w", err)
	}
	return hydrateChannel(row)
}

// FindAll returns the paginated live channels for an owner plus the total live
// count. Deleted channels are excluded from both.
func (r *SqliteChannelRepository) FindAll(
	ctx context.Context, ownerID string, limit, offset int,
) ([]*entities.Channel, int, error) {
	q := r.queries(ctx)
	deleted := string(enums.ChannelStatusDeleted)

	total, err := q.CountGatewayChannelsByOwner(ctx, sqlitedb.CountGatewayChannelsByOwnerParams{
		OwnerID:       ownerID,
		DeletedStatus: deleted,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("sqlite channel repo: count: %w", err)
	}

	rows, err := q.ListGatewayChannelsByOwner(ctx, sqlitedb.ListGatewayChannelsByOwnerParams{
		OwnerID:       ownerID,
		DeletedStatus: deleted,
		Lim:           int64(limit),
		Off:           int64(offset),
	})
	if err != nil {
		return nil, 0, fmt.Errorf("sqlite channel repo: list: %w", err)
	}

	items, err := hydrateChannels(rows)
	if err != nil {
		return nil, 0, err
	}
	return items, int(total), nil
}

// FindAllActive returns every CONNECTED/CONNECTING channel that has a stored
// session (owner_remote_id != ”). Used on startup to reconnect live sessions.
func (r *SqliteChannelRepository) FindAllActive(ctx context.Context) ([]*entities.Channel, error) {
	rows, err := r.queries(ctx).ListActiveGatewayChannels(ctx, sqlitedb.ListActiveGatewayChannelsParams{
		ConnectedStatus:  string(enums.ChannelStatusConnected),
		ConnectingStatus: string(enums.ChannelStatusConnecting),
	})
	if err != nil {
		return nil, fmt.Errorf("sqlite channel repo: find all active: %w", err)
	}
	return hydrateChannels(rows)
}

// Save appends the aggregate pulled domain events to the event log and upserts
// the projection row. Both writes resolve against the ambient unit-of-work
// transaction when present, so a caller that wraps Save in a UoW gets full
// atomicity (the SqliteUnitOfWork opens BEGIN IMMEDIATE).
//
// Save always writes the row, even when no events were raised, so callers that
// mutate in-memory state without raising an event still persist the snapshot.
func (r *SqliteChannelRepository) Save(ctx context.Context, ch *entities.Channel) error {
	events := ch.PullDomainEvents()
	if len(events) > 0 {
		if err := r.domainEventRepo.SaveAll(ctx, events); err != nil {
			return fmt.Errorf("sqlite channel repo: save domain events: %w", err)
		}
	}

	creds := ch.Credentials
	if len(creds) == 0 {
		creds = json.RawMessage("{}")
	}

	// Hand-written: ON CONFLICT DO UPDATE reads the CURRENT row via the table
	// name (gateway_channels.version + 1) while every other column comes from
	// `excluded`. sqlc cannot express the self-reference, and the version bump is
	// the whole point of the upsert.
	_, err := r.exec(ctx).ExecContext(ctx,
		`INSERT INTO gateway_channels
		   (id, owner_id, platform, name, owner_remote_id, credentials,
		    status, created_at, updated_at, version)
		 VALUES (?,?,?,?,?,?,?,?,?,?)
		 ON CONFLICT(id) DO UPDATE SET
		   owner_id        = excluded.owner_id,
		   platform        = excluded.platform,
		   name            = excluded.name,
		   owner_remote_id = excluded.owner_remote_id,
		   credentials     = excluded.credentials,
		   status          = excluded.status,
		   updated_at      = excluded.updated_at,
		   version         = gateway_channels.version + 1`,
		ch.ID.String(),
		ch.OwnerID,
		string(ch.Platform),
		ch.Name,
		ch.OwnerRemoteID,
		string(creds),
		string(ch.Status),
		dbutil.Millis(ch.CreatedAt),
		dbutil.Millis(time.Now()),
		int64(ch.Version),
	)
	if err != nil {
		return fmt.Errorf("sqlite channel repo: upsert: %w", err)
	}
	return nil
}

// Delete removes the channel row. Deleting a non-existent channel is a no-op.
func (r *SqliteChannelRepository) Delete(ctx context.Context, id string) error {
	if err := r.queries(ctx).DeleteGatewayChannel(ctx, id); err != nil {
		return fmt.Errorf("sqlite channel repo: delete: %w", err)
	}
	return nil
}

// -------------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------------

// sqliteExec is satisfied by both *sql.DB and *sql.Tx.
type sqliteExec interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// queries binds the generated queries to the unit-of-work transaction when one
// is in context, else to the store autocommit handle.
func (r *SqliteChannelRepository) queries(ctx context.Context) *sqlitedb.Queries {
	if tx, ok := unitofwork.TxFromContext(ctx); ok {
		return sqlitedb.New(r.store.DB()).WithTx(tx)
	}
	return sqlitedb.New(r.store.DB())
}

// exec returns the unit-of-work transaction when present, else the store handle.
func (r *SqliteChannelRepository) exec(ctx context.Context) sqliteExec {
	if tx, ok := unitofwork.TxFromContext(ctx); ok {
		return tx
	}
	return r.store.DB()
}

// hydrateChannel rebuilds the Channel aggregate from the sqlc-generated row via
// ReconstructChannel — no events fired, no validation applied.
//
// Taking sqlitedb.GatewayChannel (not a bag of local vars) is the drift guard
// with teeth: a contract column rename/drop regenerates the struct and breaks
// THIS build rather than surfacing as a runtime "no such column".
//
// Note: gateway_channels has no connected_at/disconnected_at columns on the
// SQLite side, matching entities.Channel which carries neither.
func hydrateChannel(m sqlitedb.GatewayChannel) (*entities.Channel, error) {
	id, err := uuid.Parse(m.ID)
	if err != nil {
		return nil, fmt.Errorf("sqlite channel repo: parse id %q: %w", m.ID, err)
	}

	creds := json.RawMessage(m.Credentials)
	if len(creds) == 0 {
		creds = json.RawMessage("{}")
	}

	// enums.Platform / enums.ChannelStatus are aliases of the wire enums (plain
	// string kinds), so the TEXT columns convert directly.
	return entities.ReconstructChannel(entities.ReconstructChannelParams{
		ID:            id,
		Name:          m.Name,
		Platform:      enums.Platform(m.Platform),
		OwnerRemoteID: m.OwnerRemoteID,
		Credentials:   creds,
		Status:        enums.ChannelStatus(m.Status),
		OwnerID:       m.OwnerID,
		CreatedAt:     dbutil.TimeFromMillis(m.CreatedAt),
		UpdatedAt:     dbutil.TimeFromMillis(m.UpdatedAt),
		Version:       int(m.Version),
	}), nil
}

func hydrateChannels(rows []sqlitedb.GatewayChannel) ([]*entities.Channel, error) {
	var items []*entities.Channel
	for _, row := range rows {
		ch, err := hydrateChannel(row)
		if err != nil {
			return nil, err
		}
		items = append(items, ch)
	}
	return items, nil
}
