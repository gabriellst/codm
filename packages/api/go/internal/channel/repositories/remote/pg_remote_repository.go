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
	"template/api-go/internal/shared/db/dbutil"
	sharedrepos "template/api-go/internal/shared/repositories"
	"template/api-go/internal/shared/services/unitofwork"
)

// remoteNamespace is the DNS namespace UUID used to derive deterministic entity
// IDs for Remote aggregates from their composite key (channelID + remoteID).
// The remotes table has no `id` column; the entity UUID is computed
// on-the-fly so domain events carry a stable, reproducible entity ID.
var remoteNamespace = uuid.MustParse("7f8e3d2c-1a4b-5c6d-8e9f-0a1b2c3d4e5f")

// PgRemoteRepository implements RemoteRepository with Postgres.
//
// Find loads the Remote aggregate from the remotes projection row
// (invariant-only fields). Save dual-writes: domain events via
// DomainEventRepository and an upsert on the remotes row, both within
// the ambient unit-of-work transaction when present.
type PgRemoteRepository struct {
	db              *sql.DB
	domainEventRepo sharedrepos.DomainEventRepository
}

// NewPgRemoteRepository constructs the write-side remote repository.
func NewPgRemoteRepository(db *sql.DB, domainEventRepo sharedrepos.DomainEventRepository) *PgRemoteRepository {
	return &PgRemoteRepository{db: db, domainEventRepo: domainEventRepo}
}

// compile-time interface satisfaction check.
var _ RemoteRepository = (*PgRemoteRepository)(nil)

// Find returns the Remote aggregate for the given (channelID, remoteID) pair.
// Only invariant-bearing fields are loaded; projection-only fields (name,
// avatar_url, is_blocked, unread_message_count, last_message_at) are ignored.
// Returns (nil, nil) when no row exists.
//
// The aggregate ID is derived deterministically from (channelID, remoteID) via
// uuid.NewSHA1 because the remotes table has no standalone id column.
func (r *PgRemoteRepository) Find(ctx context.Context, channelID, remoteID string) (*entities.Remote, error) {
	db := r.txOrDB(ctx)

	var (
		remoteType     string
		platform       string
		deletedAt      sql.NullTime
		pinnedAt       sql.NullTime
		archived       bool
		muteExpiration sql.NullTime
		markedAsUnread bool
		createdAt      time.Time
		updatedAt      time.Time
		version        int64
	)

	// Join channels to recover owner_id — it is not stored in remotes.
	var ownerID string
	err := db.QueryRowContext(ctx,
		`SELECT cr.type, cr.platform, cr.deleted_at, cr.pinned_at, cr.archived,
		        cr.mute_expiration, cr.marked_as_unread, cr.created_at, cr.updated_at, cr.version,
		        COALESCE(c.owner_id, '')
		 FROM remotes cr
		 LEFT JOIN channels c ON c.id = cr.channel_id
		 WHERE cr.channel_id = $1 AND cr.remote_id = $2`,
		channelID, remoteID,
	).Scan(
		&remoteType, &platform,
		&deletedAt, &pinnedAt, &archived,
		&muteExpiration, &markedAsUnread,
		&createdAt, &updatedAt, &version,
		&ownerID,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("pg remote repo: find: %w", err)
	}

	parsedChannelID, err := uuid.Parse(channelID)
	if err != nil {
		return nil, fmt.Errorf("pg remote repo: parse channel_id %q: %w", channelID, err)
	}

	// Derive a stable entity UUID from the composite key so domain events carry
	// a reproducible entity ID across different Find calls.
	entityID := uuid.NewSHA1(remoteNamespace, []byte(channelID+"|"+remoteID))

	return entities.ReconstructRemote(entities.ReconstructRemoteParams{
		ID:             entityID,
		ChannelID:      parsedChannelID,
		RemoteID:       remoteID,
		RemoteType:     channelenums.RemoteType(remoteType),
		OwnerID:        ownerID,
		Platform:       channelenums.Platform(platform),
		DeletedAt:      dbutil.TimePtr(deletedAt),
		PinnedAt:       dbutil.TimePtr(pinnedAt),
		Archived:       archived,
		MuteExpiration: dbutil.TimePtr(muteExpiration),
		MarkedAsUnread: markedAsUnread,
		CreatedAt:      createdAt.UTC(),
		UpdatedAt:      updatedAt.UTC(),
		Version:        int(version),
	}), nil
}

// Save persists domain events raised on the aggregate and upserts the
// remotes row with invariant-only fields. Both writes participate in
// the ambient unit-of-work transaction when present.
func (r *PgRemoteRepository) Save(ctx context.Context, remote *entities.Remote) error {
	events := remote.PullDomainEvents()
	if len(events) > 0 {
		if err := r.domainEventRepo.SaveAll(ctx, events); err != nil {
			return fmt.Errorf("pg remote repo: save domain events: %w", err)
		}
	}

	db := r.txOrDB(ctx)
	now := time.Now().UTC()

	_, err := db.ExecContext(ctx,
		`INSERT INTO remotes
		   (channel_id, remote_id, type, platform, deleted_at, pinned_at, archived,
		    mute_expiration, marked_as_unread, name, created_at, updated_at, version)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'',$10,$11,1)
		 ON CONFLICT (channel_id, remote_id) DO UPDATE SET
		   type            = EXCLUDED.type,
		   deleted_at      = EXCLUDED.deleted_at,
		   pinned_at       = EXCLUDED.pinned_at,
		   archived        = EXCLUDED.archived,
		   mute_expiration = EXCLUDED.mute_expiration,
		   marked_as_unread= EXCLUDED.marked_as_unread,
		   updated_at      = EXCLUDED.updated_at,
		   version         = remotes.version + 1`,
		remote.ChannelID().String(), remote.RemoteID(),
		string(remote.RemoteType()),
		string(remote.Platform()),
		dbutil.NullTime(remote.DeletedAt()), dbutil.NullTime(remote.PinnedAt()),
		remote.Archived(), dbutil.NullTime(remote.MuteExpiration()),
		remote.MarkedAsUnread(),
		remote.CreatedAt.UTC(), now,
	)
	if err != nil {
		return fmt.Errorf("pg remote repo: upsert: %w", err)
	}
	return nil
}

func (r *PgRemoteRepository) txOrDB(ctx context.Context) remoteExecContext {
	if tx, ok := unitofwork.TxFromContext(ctx); ok {
		return tx
	}
	return r.db
}

type remoteExecContext interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}
