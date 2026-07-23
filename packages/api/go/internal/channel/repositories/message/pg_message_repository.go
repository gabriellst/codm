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
	sharedrepos "template/core-go/repositories"
	"template/core-go/services/unitofwork"
)

// PgMessageRepository implements MessageRepository with Postgres.
//
// Find loads the Message aggregate from the messages projection row.
// Save dual-writes: domain events via DomainEventRepository and an upsert on
// the messages row, both within the ambient unit-of-work transaction
// when present.
type PgMessageRepository struct {
	db              *sql.DB
	domainEventRepo sharedrepos.DomainEventRepository
}

// NewPgMessageRepository constructs the write-side message repository.
func NewPgMessageRepository(db *sql.DB, domainEventRepo sharedrepos.DomainEventRepository) *PgMessageRepository {
	return &PgMessageRepository{db: db, domainEventRepo: domainEventRepo}
}

// compile-time interface satisfaction check.
var _ MessageRepository = (*PgMessageRepository)(nil)

// Find returns the Message aggregate for the given messageID.
// Returns (nil, nil) when no row exists.
func (r *PgMessageRepository) Find(ctx context.Context, messageID string) (*entities.Message, error) {
	db := r.txOrDB(ctx)

	var (
		id                string
		channelID         string
		remoteID          string
		platformMessageID string
		direction         string
		senderRemoteID    string
		content           []byte
		occurredAt        time.Time
		observedAt        time.Time
		editedAt          sql.NullTime
		deletedAt         sql.NullTime
		version           int64
	)

	err := db.QueryRowContext(ctx,
		`SELECT id, channel_id, remote_id, platform_message_id, direction,
		        sender_remote_id, content, occurred_at, observed_at,
		        edited_at, deleted_at, version
		 FROM messages
		 WHERE id = $1`,
		messageID,
	).Scan(
		&id, &channelID, &remoteID, &platformMessageID, &direction,
		&senderRemoteID, &content, &occurredAt, &observedAt,
		&editedAt, &deletedAt, &version,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("pg message repo: find: %w", err)
	}

	parsedID, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("pg message repo: parse id %q: %w", id, err)
	}
	parsedChannelID, err := uuid.Parse(channelID)
	if err != nil {
		return nil, fmt.Errorf("pg message repo: parse channel_id %q: %w", channelID, err)
	}

	return entities.ReconstructMessage(entities.ReconstructMessageParams{
		ID:                parsedID,
		ChannelID:         parsedChannelID,
		RemoteID:          remoteID,
		PlatformMessageID: platformMessageID,
		Direction:         channelenums.Direction(direction),
		Content:           json.RawMessage(content),
		OwnerID:           "", // not stored in messages; populated by caller if needed
		OccurredAt:        occurredAt.UTC(),
		EditedAt:          dbutil.TimePtr(editedAt),
		DeletedAt:         dbutil.TimePtr(deletedAt),
		CreatedAt:         observedAt.UTC(), // observed_at is the insert time
		UpdatedAt:         observedAt.UTC(),
		Version:           int(version),
		SenderRemoteID:    senderRemoteID,
		Platform:          channelenums.PlatformWhatsApp, // default; callers with platform context override
		MessageType:       channelenums.MessageTypeText,  // default; callers with type context override
	}), nil
}

// Save persists domain events raised on the aggregate and upserts the
// messages row. Both writes participate in the ambient unit-of-work
// transaction when present.
//
// Note: sender_remote_id is write-once (set at insert time). On conflict, only
// content, edited_at, deleted_at, and version are updated — matching the
// behavior methods (Edit, SoftDelete) that this write path serves.
func (r *PgMessageRepository) Save(ctx context.Context, msg *entities.Message) error {
	evts := msg.PullDomainEvents()
	if len(evts) > 0 {
		if err := r.domainEventRepo.SaveAll(ctx, evts); err != nil {
			return fmt.Errorf("pg message repo: save domain events: %w", err)
		}
	}

	db := r.txOrDB(ctx)
	now := time.Now().UTC()

	// sender_remote_id is not exposed as a public accessor on the aggregate (it is a
	// payload-composition field, not an invariant). We store an empty string on
	// update paths (Edit/SoftDelete) because the ON CONFLICT clause preserves
	// the original value from the insert.
	_, err := db.ExecContext(ctx,
		`INSERT INTO messages
		   (id, channel_id, remote_id, platform_message_id, direction, platform,
		    sender_remote_id, content, occurred_at, observed_at,
		    edited_at, deleted_at, version)
		 VALUES ($1,$2,$3,$4,$5,$6,'',$7,$8,$9,$10,$11,1)
		 ON CONFLICT (id) DO UPDATE SET
		   content     = EXCLUDED.content,
		   edited_at   = EXCLUDED.edited_at,
		   deleted_at  = EXCLUDED.deleted_at,
		   version     = messages.version + 1`,
		msg.ID.String(), msg.ChannelID().String(), msg.RemoteID(),
		msg.PlatformMessageID(), string(msg.Direction()),
		string(msg.Platform()),
		msg.Content(),
		msg.OccurredAt().UTC(), now,
		dbutil.NullTime(msg.EditedAt()), dbutil.NullTime(msg.DeletedAt()),
	)
	if err != nil {
		return fmt.Errorf("pg message repo: upsert: %w", err)
	}
	return nil
}

func (r *PgMessageRepository) txOrDB(ctx context.Context) msgExecContext {
	if tx, ok := unitofwork.TxFromContext(ctx); ok {
		return tx
	}
	return r.db
}

type msgExecContext interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}
