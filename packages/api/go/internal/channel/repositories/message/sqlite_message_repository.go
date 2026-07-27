package message

import (
	"context"
	"database/sql"
	"encoding/json"
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

// SqliteMessageRepository is the write
// side of the Message aggregate over the SHARED SQLite store (gateway_messages).
//
// Find loads the aggregate from the projection row; Save dual-writes the pulled
// domain events (through DomainEventRepository) and the row upsert, both joining
// the ambient unit of work when the caller opened one.
//
// Dialect deltas vs the pg original: table `messages` -> `gateway_messages`,
// $N -> ?N, timestamptz -> INTEGER unix-millis, jsonb -> TEXT.
type SqliteMessageRepository struct {
	store           *sqlite.SqliteStore
	domainEventRepo sharedrepos.DomainEventRepository
}

// NewSqliteMessageRepository constructs the write-side message repository.
func NewSqliteMessageRepository(
	store *sqlite.SqliteStore,
	domainEventRepo sharedrepos.DomainEventRepository,
) *SqliteMessageRepository {
	return &SqliteMessageRepository{store: store, domainEventRepo: domainEventRepo}
}

// compile-time interface satisfaction check.
var _ MessageRepository = (*SqliteMessageRepository)(nil)

// Find returns the Message aggregate for the given messageID, or (nil, nil) when
// no row exists.
func (r *SqliteMessageRepository) Find(ctx context.Context, messageID string) (*entities.Message, error) {
	m, err := r.queries(ctx).GetGatewayMessage(ctx, messageID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("sqlite message repo: find: %w", err)
	}

	parsedID, err := uuid.Parse(m.ID)
	if err != nil {
		return nil, fmt.Errorf("sqlite message repo: parse id %q: %w", m.ID, err)
	}
	parsedChannelID, err := uuid.Parse(m.ChannelID)
	if err != nil {
		return nil, fmt.Errorf("sqlite message repo: parse channel_id %q: %w", m.ChannelID, err)
	}

	observed := dbutil.TimeFromMillis(m.ObservedAt)
	return entities.ReconstructMessage(entities.ReconstructMessageParams{
		ID:                parsedID,
		ChannelID:         parsedChannelID,
		RemoteID:          m.RemoteID,
		PlatformMessageID: m.PlatformMessageID,
		Direction:         channelenums.Direction(m.Direction),
		Content:           json.RawMessage(m.Content),
		OwnerID:           "", // not stored on gateway_messages; populated by the caller if needed
		OccurredAt:        dbutil.TimeFromMillis(m.OccurredAt),
		EditedAt:          dbutil.TimePtrFromMillis(m.EditedAt),
		DeletedAt:         dbutil.TimePtrFromMillis(m.DeletedAt),
		CreatedAt:         observed, // observed_at is the insert time
		UpdatedAt:         observed,
		Version:           int(m.Version),
		SenderRemoteID:    m.SenderRemoteID,
		// The pg implementation hardcoded PlatformWhatsApp here because its
		// SELECT omitted the column. The generated row carries it, so the
		// persisted platform is used instead (identical for existing rows,
		// correct for INTERNAL ones).
		Platform:    channelenums.Platform(m.Platform),
		MessageType: channelenums.MessageTypeText, // not stored; callers with type context override
	}), nil
}

// Save persists the pulled domain events and upserts the gateway_messages row.
//
// sender_remote_id is write-once (set at insert). On conflict only content,
// edited_at, deleted_at and version change — matching the behavior methods
// (Edit, SoftDelete) this write path serves.
func (r *SqliteMessageRepository) Save(ctx context.Context, msg *entities.Message) error {
	evts := msg.PullDomainEvents()
	if len(evts) > 0 {
		if err := r.domainEventRepo.SaveAll(ctx, evts); err != nil {
			return fmt.Errorf("sqlite message repo: save domain events: %w", err)
		}
	}

	// sender_remote_id is not exposed on the aggregate (payload-composition
	// field, not an invariant). The update paths bind '' because ON CONFLICT
	// preserves the value written at insert time.
	_, err := r.exec(ctx).ExecContext(ctx,
		`INSERT INTO gateway_messages
		   (id, channel_id, remote_id, platform_message_id, direction, platform,
		    sender_remote_id, content, occurred_at, observed_at,
		    edited_at, deleted_at, version)
		 VALUES (?,?,?,?,?,?,'',?,?,?,?,?,1)
		 ON CONFLICT(id) DO UPDATE SET
		   content    = excluded.content,
		   edited_at  = excluded.edited_at,
		   deleted_at = excluded.deleted_at,
		   version    = gateway_messages.version + 1`,
		msg.ID.String(), msg.ChannelID().String(), msg.RemoteID(),
		msg.PlatformMessageID(), string(msg.Direction()),
		string(msg.Platform()),
		string(msg.Content()),
		dbutil.Millis(msg.OccurredAt()), dbutil.Millis(time.Now()),
		dbutil.NullMillis(msg.EditedAt()), dbutil.NullMillis(msg.DeletedAt()),
	)
	if err != nil {
		return fmt.Errorf("sqlite message repo: upsert: %w", err)
	}
	return nil
}

// queries binds the generated queries to the ambient unit-of-work transaction
// when present, else to the store autocommit handle.
func (r *SqliteMessageRepository) queries(ctx context.Context) *sqlitedb.Queries {
	if tx, ok := unitofwork.TxFromContext(ctx); ok {
		return r.store.Queries().WithTx(tx)
	}
	return r.store.Queries()
}

func (r *SqliteMessageRepository) exec(ctx context.Context) sqliteMsgExec {
	if tx, ok := unitofwork.TxFromContext(ctx); ok {
		return tx
	}
	return r.store.DB()
}

// sqliteMsgExec is satisfied by both *sql.DB and *sql.Tx.
type sqliteMsgExec interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}
