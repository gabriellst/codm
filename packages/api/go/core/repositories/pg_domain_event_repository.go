package repositories

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"template/core-go/services/outbox"
	"template/core-go/services/unitofwork"
	"template/core-go/types"
)

// PgDomainEventRepository implements DomainEventRepository with Postgres.
// Dual-writes to `events` (permanent audit log) and `outbox` (transient dispatch queue).
type PgDomainEventRepository struct {
	db *sql.DB
}

func NewPgDomainEventRepository(db *sql.DB) *PgDomainEventRepository {
	return &PgDomainEventRepository{db: db}
}

func (r *PgDomainEventRepository) Save(ctx context.Context, event types.DomainEventI) error {
	return r.SaveAll(ctx, []types.DomainEventI{event})
}

// batchInsertChunkSize limits rows per INSERT to keep the parameter count well
// under Postgres' 65535 limit (7 params × 500 rows = 3500 params per statement).
const batchInsertChunkSize = 500

func (r *PgDomainEventRepository) SaveAll(ctx context.Context, events []types.DomainEventI) error {
	if len(events) == 0 {
		return nil
	}

	db := r.txOrDB(ctx)

	for start := 0; start < len(events); start += batchInsertChunkSize {
		end := start + batchInsertChunkSize
		if end > len(events) {
			end = len(events)
		}
		if err := r.insertChunk(ctx, db, events[start:end]); err != nil {
			return err
		}
	}

	slog.Debug("domain events saved", "count", len(events))
	return nil
}

func (r *PgDomainEventRepository) insertChunk(ctx context.Context, db execContext, chunk []types.DomainEventI) error {
	now := time.Now().UTC()

	type innerPayloadProvider interface {
		GetPayload() json.RawMessage
	}

	eventsValues := make([]string, 0, len(chunk))
	eventsArgs := make([]any, 0, len(chunk)*7)
	outboxValues := make([]string, 0, len(chunk))
	outboxArgs := make([]any, 0, len(chunk)*7)

	ePos := 1
	oPos := 1
	for _, event := range chunk {
		// Full envelope for outbox — dispatcher needs entityId, ownerId, name, and payload.
		outboxPayload, err := json.Marshal(event)
		if err != nil {
			return fmt.Errorf("failed to marshal event %s: %w", event.GetEventName(), err)
		}
		// Inner payload only for the events audit log.
		eventsPayload := outboxPayload
		if pp, ok := event.(innerPayloadProvider); ok {
			eventsPayload = pp.GetPayload()
		}
		id := r.eventID(event)
		entityID := event.GetEntityID().String()
		// occurred_at follows the envelope's own timestamp so the audit log reflects
		// when the fact happened, not when it was flushed. Fall back to `now`.
		occurredAt := r.occurredAt(outboxPayload, now)

		// Contract columns: shared.events(id, name, entity_id, owner_id, payload, source, occurred_at).
		eventsValues = append(eventsValues, fmt.Sprintf(
			"($%d, $%d, $%d, $%d, $%d, $%d, $%d)",
			ePos, ePos+1, ePos+2, ePos+3, ePos+4, ePos+5, ePos+6))
		eventsArgs = append(eventsArgs,
			id, event.GetEventName(), entityID,
			event.GetOwnerID(), eventsPayload, outbox.OutboxSource, occurredAt)
		ePos += 7

		// Contract columns: shared.outbox(id, name, entity_id, owner_id, payload, source, created_at);
		// processed_at/attempts/last_error take their column defaults.
		outboxValues = append(outboxValues, fmt.Sprintf(
			"($%d, $%d, $%d, $%d, $%d, $%d, $%d)",
			oPos, oPos+1, oPos+2, oPos+3, oPos+4, oPos+5, oPos+6))
		outboxArgs = append(outboxArgs,
			id, event.GetEventName(), entityID, event.GetOwnerID(),
			outboxPayload, outbox.OutboxSource, now)
		oPos += 7
	}

	eventsSQL := fmt.Sprintf(
		`INSERT INTO shared.events (id, name, entity_id, owner_id, payload, source, occurred_at)
		 VALUES %s
		 ON CONFLICT (id) DO NOTHING`,
		strings.Join(eventsValues, ","),
	)
	if _, err := db.ExecContext(ctx, eventsSQL, eventsArgs...); err != nil {
		return fmt.Errorf("batch insert events: %w", err)
	}

	outboxSQL := fmt.Sprintf(
		`INSERT INTO shared.outbox (id, name, entity_id, owner_id, payload, source, created_at)
		 VALUES %s
		 ON CONFLICT (id) DO NOTHING`,
		strings.Join(outboxValues, ","),
	)
	if _, err := db.ExecContext(ctx, outboxSQL, outboxArgs...); err != nil {
		return fmt.Errorf("batch insert outbox: %w", err)
	}

	return nil
}

// occurredAt extracts the envelope's `time` field from the marshalled event so the
// events audit log records when the fact happened. The wire envelope keeps `time`
// (see core/types/events.go); only the DB column it lands in (occurred_at) differs.
// Falls back to `fallback` when the payload has no usable timestamp.
func (r *PgDomainEventRepository) occurredAt(envelope json.RawMessage, fallback time.Time) time.Time {
	var env struct {
		Time time.Time `json:"time"`
	}
	if err := json.Unmarshal(envelope, &env); err == nil && !env.Time.IsZero() {
		return env.Time
	}
	return fallback
}

func (r *PgDomainEventRepository) eventID(event types.DomainEventI) string {
	if provider, ok := event.(interface{ GetEventID() string }); ok {
		return provider.GetEventID()
	}
	return fmt.Sprintf("%v-%d", event.GetEntityID(), time.Now().UnixNano())
}

func (r *PgDomainEventRepository) txOrDB(ctx context.Context) execContext {
	if tx, ok := unitofwork.TxFromContext(ctx); ok {
		return tx
	}
	return r.db
}

type execContext interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}
