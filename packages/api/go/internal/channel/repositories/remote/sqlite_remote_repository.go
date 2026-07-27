package remote

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"template/api-go/internal/channel/entities"
	channelenums "template/api-go/internal/channel/enums"
	"template/core-go/db/dbutil"
	"template/core-go/db/sqlite"
	sqlitedb "template/core-go/db/sqlite/gen"
	sharedrepos "template/core-go/repositories"
	"template/core-go/services/unitofwork"
)

// remoteNamespace is the DNS namespace UUID used to derive deterministic entity
// IDs for Remote aggregates from their composite key (channelID + remoteID). The
// gateway_remotes table has no `id` column, so the entity UUID is computed
// on the fly and every Find yields the same one. The value is UNCHANGED from the
// Postgres implementation this replaces — changing it would re-key every remote
// event ever emitted.
var remoteNamespace = uuid.MustParse("7f8e3d2c-1a4b-5c6d-8e9f-0a1b2c3d4e5f")

// SqliteRemoteRepository is the write side
// of the Remote aggregate over the SHARED SQLite store (gateway_remotes).
//
// Find loads only the invariant-bearing columns plus the owning channel's
// owner_id (gateway_remotes does not denormalize it), and derives the aggregate
// UUID deterministically from (channelID, remoteID) via remoteNamespace — the
// table has no standalone id column, so this is what makes domain events carry a
// reproducible entity id across Find calls.
//
// Dialect deltas vs the pg original: tables gain the `gateway_` prefix, $N -> ?N,
// timestamptz -> INTEGER unix-millis, boolean -> INTEGER 0/1.
type SqliteRemoteRepository struct {
	store           *sqlite.SqliteStore
	domainEventRepo sharedrepos.DomainEventRepository
}

// NewSqliteRemoteRepository constructs the write-side remote repository.
func NewSqliteRemoteRepository(
	store *sqlite.SqliteStore,
	domainEventRepo sharedrepos.DomainEventRepository,
) *SqliteRemoteRepository {
	return &SqliteRemoteRepository{store: store, domainEventRepo: domainEventRepo}
}

// compile-time interface satisfaction check.
var _ RemoteRepository = (*SqliteRemoteRepository)(nil)

// Find returns the Remote aggregate for (channelID, remoteID), or (nil, nil).
// Projection-only fields (name, avatar_url, is_blocked, unread_message_count,
// last_message_at) are deliberately not loaded.
func (r *SqliteRemoteRepository) Find(ctx context.Context, channelID, remoteID string) (*entities.Remote, error) {
	row, err := r.queries(ctx).GetGatewayRemoteAggregate(ctx, sqlitedb.GetGatewayRemoteAggregateParams{
		ChannelID: channelID,
		RemoteID:  remoteID,
	})
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("sqlite remote repo: find: %w", err)
	}

	parsedChannelID, err := uuid.Parse(channelID)
	if err != nil {
		return nil, fmt.Errorf("sqlite remote repo: parse channel_id %q: %w", channelID, err)
	}

	// Stable entity UUID derived from the composite key (see remoteNamespace).
	entityID := uuid.NewSHA1(remoteNamespace, []byte(channelID+"|"+remoteID))

	return entities.ReconstructRemote(entities.ReconstructRemoteParams{
		ID:             entityID,
		ChannelID:      parsedChannelID,
		RemoteID:       remoteID,
		RemoteType:     channelenums.RemoteType(row.Type),
		OwnerID:        row.OwnerID,
		Platform:       channelenums.Platform(row.Platform),
		DeletedAt:      dbutil.TimePtrFromMillis(row.DeletedAt),
		PinnedAt:       dbutil.TimePtrFromMillis(row.PinnedAt),
		Archived:       dbutil.IntToBool(row.Archived),
		MuteExpiration: dbutil.TimePtrFromMillis(row.MuteExpiration),
		MarkedAsUnread: dbutil.IntToBool(row.MarkedAsUnread),
		CreatedAt:      dbutil.TimeFromMillis(row.CreatedAt),
		UpdatedAt:      dbutil.TimeFromMillis(row.UpdatedAt),
		Version:        int(row.Version),
	}), nil
}

// Save persists the pulled domain events and upserts the invariant-only columns
// of the gateway_remotes row. Both writes join the ambient unit of work when one
// is in context.
func (r *SqliteRemoteRepository) Save(ctx context.Context, remote *entities.Remote) error {
	events := remote.PullDomainEvents()
	if len(events) > 0 {
		if err := r.domainEventRepo.SaveAll(ctx, events); err != nil {
			return fmt.Errorf("sqlite remote repo: save domain events: %w", err)
		}
	}

	// `name` is projection-owned: bound as '' on insert and never touched on
	// conflict, so a projector-written display name survives an aggregate save.
	_, err := r.exec(ctx).ExecContext(ctx,
		`INSERT INTO gateway_remotes
		   (channel_id, remote_id, type, platform, deleted_at, pinned_at, archived,
		    mute_expiration, marked_as_unread, name, created_at, updated_at, version)
		 VALUES (?,?,?,?,?,?,?,?,?,'',?,?,1)
		 ON CONFLICT(channel_id, remote_id) DO UPDATE SET
		   type             = excluded.type,
		   deleted_at       = excluded.deleted_at,
		   pinned_at        = excluded.pinned_at,
		   archived         = excluded.archived,
		   mute_expiration  = excluded.mute_expiration,
		   marked_as_unread = excluded.marked_as_unread,
		   updated_at       = excluded.updated_at,
		   version          = gateway_remotes.version + 1`,
		remote.ChannelID().String(), remote.RemoteID(),
		string(remote.RemoteType()),
		string(remote.Platform()),
		dbutil.NullMillis(remote.DeletedAt()), dbutil.NullMillis(remote.PinnedAt()),
		dbutil.BoolToInt(remote.Archived()), dbutil.NullMillis(remote.MuteExpiration()),
		dbutil.BoolToInt(remote.MarkedAsUnread()),
		dbutil.Millis(remote.CreatedAt), dbutil.Millis(time.Now()),
	)
	if err != nil {
		return fmt.Errorf("sqlite remote repo: upsert: %w", err)
	}
	return nil
}

func (r *SqliteRemoteRepository) queries(ctx context.Context) *sqlitedb.Queries {
	if tx, ok := unitofwork.TxFromContext(ctx); ok {
		return r.store.Queries().WithTx(tx)
	}
	return r.store.Queries()
}

func (r *SqliteRemoteRepository) exec(ctx context.Context) sqliteRemoteExec {
	if tx, ok := unitofwork.TxFromContext(ctx); ok {
		return tx
	}
	return r.store.DB()
}

// sqliteRemoteExec is satisfied by both *sql.DB and *sql.Tx.
type sqliteRemoteExec interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}
