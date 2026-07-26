package repositories

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"template/core-go/db/sqlite"
	sqlitedb "template/core-go/db/sqlite/gen"
	"template/core-go/services/outbox"
	"template/core-go/services/unitofwork"
	"template/core-go/types"
)

// SqliteDomainEventRepository is the SQLite twin of PgDomainEventRepository: it
// DUAL-writes each pulled domain event to BOTH the shared_events audit log (the
// durable event store) AND the shared_outbox dispatch queue, over the shared
// SqliteStore. The audit row keeps the unwrapped inner payload + the fact's own
// timestamp; the outbox row keeps the FULL envelope so the SqliteOutboxDispatcher
// can rebuild a typed event (entityId, ownerId, name, inner payload) and fan it to
// the InternalMediator — closing the write→claim→dispatch loop the audit-only
// implementation left open.
//
// Both writes join the caller's unit of work when a *sql.Tx is in context
// (unitofwork.TxFromContext), so an aggregate's row write + its event/outbox rows
// commit atomically; absent a UoW they run on the store's autocommit handle. Both
// inserts are ON CONFLICT(id) DO NOTHING, so an at-least-once re-persist of the
// same event id is a no-op rather than a PK error.
type SqliteDomainEventRepository struct {
	store *sqlite.SqliteStore
}

// NewSqliteDomainEventRepository constructs the repository over the SQLite substrate.
func NewSqliteDomainEventRepository(store *sqlite.SqliteStore) *SqliteDomainEventRepository {
	return &SqliteDomainEventRepository{store: store}
}

// compile-time interface satisfaction check.
var _ DomainEventRepository = (*SqliteDomainEventRepository)(nil)

func (r *SqliteDomainEventRepository) Save(ctx context.Context, event types.DomainEventI) error {
	return r.SaveAll(ctx, []types.DomainEventI{event})
}

func (r *SqliteDomainEventRepository) SaveAll(ctx context.Context, events []types.DomainEventI) error {
	if len(events) == 0 {
		return nil
	}
	q := r.queriesFromContext(ctx)
	exec := r.execFromContext(ctx)
	now := time.Now().UTC()

	for _, event := range events {
		id := sqliteEventID(event)
		// entity_id / owner_id are nullable TEXT columns; a non-empty value is
		// stored as-is, an empty one as NULL (never the ambiguous "").
		entityID := sqliteNullString(event.GetEntityID().String())
		ownerID := sqliteNullString(event.GetOwnerID())

		// Audit log — the unwrapped inner payload, keyed by the deterministic id.
		if err := q.InsertEvent(ctx, sqlitedb.InsertEventParams{
			ID:         id,
			Name:       event.GetEventName(),
			EntityID:   entityID,
			OwnerID:    ownerID,
			Payload:    string(sqliteInnerPayload(event)),
			Source:     outbox.OutboxSource,
			OccurredAt: sqliteOccurredAtMs(event, now),
		}); err != nil {
			return fmt.Errorf("sqlite domain event repo: insert event %s: %w", event.GetEventName(), err)
		}

		// Outbox — the FULL envelope so the dispatcher can reconstruct the typed
		// event and fan it to the InternalMediator (mirror of the pg dual-write).
		// ids are TEXT in SQLite: plain `?` bindings, no `::uuid` cast.
		envelope, err := json.Marshal(event)
		if err != nil {
			return fmt.Errorf("sqlite domain event repo: marshal envelope %s: %w", event.GetEventName(), err)
		}
		if _, err := exec.ExecContext(ctx,
			`INSERT INTO shared_outbox (id, name, entity_id, owner_id, payload, source, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(id) DO NOTHING`,
			id, event.GetEventName(), entityID, ownerID,
			string(envelope), outbox.OutboxSource, now.UnixMilli(),
		); err != nil {
			return fmt.Errorf("sqlite domain event repo: insert outbox %s: %w", event.GetEventName(), err)
		}
	}
	return nil
}

// queriesFromContext binds the sqlc queries to the unit-of-work transaction when
// one is in context, so the audit-log insert joins the caller's atomic unit.
func (r *SqliteDomainEventRepository) queriesFromContext(ctx context.Context) *sqlitedb.Queries {
	if tx, ok := unitofwork.TxFromContext(ctx); ok {
		return r.store.Queries().WithTx(tx)
	}
	return r.store.Queries()
}

// execFromContext returns the unit-of-work transaction when present, else the
// store's autocommit handle — the target for the hand-written outbox insert (the
// generated InsertOutboxRow lacks ON CONFLICT, so the dual-write hand-writes it).
func (r *SqliteDomainEventRepository) execFromContext(ctx context.Context) execContext {
	if tx, ok := unitofwork.TxFromContext(ctx); ok {
		return tx
	}
	return r.store.DB()
}

// sqliteEventID prefers the event's own deterministic id so a re-persist maps onto
// the same row (ON CONFLICT DO NOTHING); otherwise it mints a fallback.
func sqliteEventID(event types.DomainEventI) string {
	if p, ok := event.(interface{ GetEventID() string }); ok {
		if id := p.GetEventID(); id != "" {
			return id
		}
	}
	return fmt.Sprintf("%s-%d", event.GetEntityID(), time.Now().UnixNano())
}

// sqliteInnerPayload returns the inner payload (matching the pg audit-log write,
// which stores the unwrapped payload, not the full envelope). Falls back to the
// full marshal when the event does not expose GetPayload.
func sqliteInnerPayload(event types.DomainEventI) json.RawMessage {
	if pp, ok := event.(interface{ GetPayload() json.RawMessage }); ok {
		return pp.GetPayload()
	}
	b, _ := json.Marshal(event)
	return b
}

// sqliteOccurredAtMs reads the envelope's `time` field (via a full marshal) so the
// audit log records when the fact happened, in the timestamp_ms integer the SQLite
// substrate uses everywhere. Falls back to `fallback` when absent/zero.
func sqliteOccurredAtMs(event types.DomainEventI, fallback time.Time) int64 {
	if b, err := json.Marshal(event); err == nil {
		var env struct {
			Time time.Time `json:"time"`
		}
		if json.Unmarshal(b, &env) == nil && !env.Time.IsZero() {
			return env.Time.UnixMilli()
		}
	}
	return fallback.UnixMilli()
}

// sqliteNullString maps an empty string to SQL NULL, any other value to itself.
func sqliteNullString(s string) sql.NullString {
	return sql.NullString{String: s, Valid: s != ""}
}
