package mediator

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"template/core-go/types"
)

// ════════════════════════ THE OUTBOX IS THE TRANSPORT ════════════════════════
//
// SqlExternalMediator is the concrete ExternalMediator that replaces the Redis
// Streams mediator (go-domain-design.md §1.3, decisions §3(b)/§3(c)). Instead of
// outbox → Redis XADD → XREADGROUP, the consumer reads the outbox rows DIRECTLY:
// the shared SQLite database (WAL) carries integration events between processes
// and, in the single-binary target, between contexts of one process.
//
// Delivery is at-least-once: a crash after dispatch but before MarkProcessed
// redelivers. Exactly-once is NOT a transport property — it comes from the
// destination's idempotency (idempotent handler + a dedup UNIQUE such as
// thread.consumed_messages + INSERT ... ON CONFLICT DO NOTHING). at-least-once +
// dedup UNIQUE = exactly-once.
//
// Two roles, cleanly split (mirrors the retired Redis egress semantics):
//   - Publish (egress): INSERT the event as an outbox row (durable transport) and
//     synchronously fan out to in-process callbacks — the SSE broadcaster in
//     listen_events.go sees the event immediately, with no poll latency. Then
//     best-effort Notify the strategy to wake the consumer.
//   - the consume loop (ingress): claim unprocessed outbox rows via a leased
//     UPDATE and dispatch them to registered handlers. With no ingress handlers
//     registered (the channel gateway is egress-only today) the loop is a no-op
//     consumer — it claims nothing, so egress rows are never dropped.
const (
	// integrationClaimBatch bounds one claim cycle.
	integrationClaimBatch = 50
	// integrationLease is how long a claimed row is hidden from other consumers
	// (and from this consumer's own retry) before its lease expires and it becomes
	// re-claimable. It doubles as the retry backoff for a failed dispatch.
	integrationLease = 30 * time.Second
	// integrationMaxAttempts dead-letters a row after this many failed dispatches.
	integrationMaxAttempts = 5
)

// outboxRow is a single claimed integration-event outbox row.
type outboxRow struct {
	id       string
	name     string
	ownerID  string
	payload  json.RawMessage
	attempts int64
}

// SqlExternalMediator implements ExternalMediator over the SQLite outbox.
type SqlExternalMediator struct {
	db     *sql.DB
	source string
	notify NotifyStrategy

	mu        sync.RWMutex
	handlers  map[string][]IntegrationEventHandler
	callbacks []func(ctx context.Context, event types.IntegrationEventI)

	started bool
	cancel  context.CancelFunc
	done    chan struct{}

	// now is the injectable clock (tests drive lease expiry deterministically).
	now func() time.Time
}

// NewSqlExternalMediator builds the mediator. source is this producer's outbox
// discriminator (the "source" column); the consume loop claims only rows of this
// source whose name has a registered handler. notify decides how the consumer
// wakes (in-process nudge and/or WAL poll — see SqliteWalPollingStrategy).
func NewSqlExternalMediator(db *sql.DB, source string, notify NotifyStrategy) *SqlExternalMediator {
	return &SqlExternalMediator{
		db:       db,
		source:   source,
		notify:   notify,
		handlers: make(map[string][]IntegrationEventHandler),
		done:     make(chan struct{}),
		now:      time.Now,
	}
}

// Register records an ingress handler. Unlike the retired RedisExternalMediator
// (which failed loud because it had no consumer), the SQL mediator's whole point
// is a working consumer — so this is a live registration the claim loop honors.
func (m *SqlExternalMediator) Register(h IntegrationEventHandler) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.handlers[h.EventName()] = append(m.handlers[h.EventName()], h)
	slog.Info("sql external mediator: registered handler", "event", h.EventName())
}

// RegisterCallback records an in-process fan-out callback (e.g. the SSE broadcaster).
func (m *SqlExternalMediator) RegisterCallback(fn func(ctx context.Context, event types.IntegrationEventI)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.callbacks = append(m.callbacks, fn)
}

// Publish inserts the event as an outbox row (the durable transport), fans it out
// to local callbacks, and nudges the consumer. The INSERT is idempotent
// (ON CONFLICT(id) DO NOTHING) so a re-published event id is a no-op rather than a
// PK error.
func (m *SqlExternalMediator) Publish(ctx context.Context, event types.IntegrationEventI) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("sql external mediator: marshal event %s: %w", event.GetEventName(), err)
	}

	// ids are TEXT in SQLite — plain `?` bindings, no `::uuid` cast (the pg outbox
	// uuid-cast discipline does not carry to this dialect).
	if _, err := m.db.ExecContext(ctx,
		`INSERT INTO shared_outbox (id, name, entity_id, owner_id, payload, source, created_at)
		 VALUES (?, ?, NULL, ?, ?, ?, ?)
		 ON CONFLICT(id) DO NOTHING`,
		integrationEventID(event),
		event.GetEventName(),
		nullableText(event.GetOwnerID()),
		string(payload),
		m.source,
		m.now().UnixMilli(),
	); err != nil {
		return fmt.Errorf("sql external mediator: insert outbox row for %s: %w", event.GetEventName(), err)
	}

	m.fireCallbacks(ctx, event)

	if m.notify != nil {
		_ = m.notify.Notify(ctx, m.source)
	}
	return nil
}

// Start launches the consume loop. Idempotent: a second Start while running is a
// no-op (the memoized composition root may resolve the mediator more than once).
func (m *SqlExternalMediator) Start(_ context.Context) error {
	m.mu.Lock()
	if m.started {
		m.mu.Unlock()
		return nil
	}
	m.started = true
	// The loop owns its own context so it outlives the fx OnStart ctx; Stop cancels it.
	ctx, cancel := context.WithCancel(context.Background())
	m.cancel = cancel
	m.mu.Unlock()

	go m.consumeLoop(ctx)
	slog.Info("sql external mediator: started", "source", m.source)
	return nil
}

// Stop cancels the consume loop, waits for it to drain out, and closes the notify
// strategy. Safe to call once.
func (m *SqlExternalMediator) Stop(_ context.Context) error {
	m.mu.Lock()
	if !m.started {
		m.mu.Unlock()
		return nil
	}
	m.started = false
	cancel := m.cancel
	m.mu.Unlock()

	if cancel != nil {
		cancel()
	}
	<-m.done
	if m.notify != nil {
		_ = m.notify.Close()
	}
	slog.Info("sql external mediator: stopped", "source", m.source)
	return nil
}

// consumeLoop drains all currently-claimable work on each wake, then blocks on the
// NotifyStrategy until the next nudge or poll tick.
func (m *SqlExternalMediator) consumeLoop(ctx context.Context) {
	defer close(m.done)
	for {
		for {
			n, err := m.drainOnce(ctx)
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				slog.Error("sql external mediator: drain error", "source", m.source, "error", err)
				break
			}
			if n < integrationClaimBatch {
				break // fewer than a full batch → nothing left this cycle
			}
		}
		if err := m.notify.Wait(ctx, m.source); err != nil {
			return // ctx cancelled
		}
	}
}

// drainOnce claims a batch and dispatches it. Returns the number of rows claimed.
func (m *SqlExternalMediator) drainOnce(ctx context.Context) (int, error) {
	names := m.handlerNames()
	if len(names) == 0 {
		return 0, nil // egress-only: no ingress handlers → claim nothing, drop nothing
	}

	rows, err := m.claim(ctx, names)
	if err != nil {
		return 0, err
	}
	for _, r := range rows {
		m.process(ctx, r)
	}
	return len(rows), nil
}

// claim leases up to integrationClaimBatch unprocessed rows (of this source, whose
// name a handler is registered for) under a single write transaction — the §3(c)
// claim: stamp claimed_by (an opaque per-claim token) + lease_until (now + lease),
// then read back exactly the rows this token won. NO consumer-groups: a single
// consumer per direction, redelivery deduped at the destination.
//
// The transaction's first statement is the UPDATE (a write), so SQLite takes the
// write lock at that point — equivalent to BEGIN IMMEDIATE for our purpose (no
// deferred-then-upgrade deadlock window).
func (m *SqlExternalMediator) claim(ctx context.Context, names []string) ([]outboxRow, error) {
	token := uuid.NewString()
	now := m.now().UnixMilli()
	leaseUntil := now + integrationLease.Milliseconds()

	tx, err := m.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin claim tx: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	placeholders := make([]string, len(names))
	for i := range names {
		placeholders[i] = "?"
	}
	nameIn := strings.Join(placeholders, ", ")

	// UPDATE ... WHERE id IN (SELECT ... LIMIT n): the leased claim.
	updateArgs := make([]any, 0, len(names)+4)
	updateArgs = append(updateArgs, token, leaseUntil, m.source, now)
	for _, n := range names {
		updateArgs = append(updateArgs, n)
	}
	updateArgs = append(updateArgs, integrationClaimBatch)

	if _, err = tx.ExecContext(ctx, fmt.Sprintf(
		`UPDATE shared_outbox
		 SET claimed_by = ?, lease_until = ?
		 WHERE id IN (
		     SELECT id FROM shared_outbox
		     WHERE source = ?
		       AND processed_at IS NULL
		       AND (lease_until IS NULL OR lease_until < ?)
		       AND name IN (%s)
		     ORDER BY created_at
		     LIMIT ?
		 )`, nameIn), updateArgs...); err != nil {
		return nil, fmt.Errorf("claim update: %w", err)
	}

	rows, err := tx.QueryContext(ctx,
		`SELECT id, name, owner_id, payload, attempts
		 FROM shared_outbox
		 WHERE claimed_by = ?
		 ORDER BY created_at`, token)
	if err != nil {
		return nil, fmt.Errorf("select claimed rows: %w", err)
	}

	var claimed []outboxRow
	for rows.Next() {
		var (
			r       outboxRow
			owner   sql.NullString
			payload string
		)
		if scanErr := rows.Scan(&r.id, &r.name, &owner, &payload, &r.attempts); scanErr != nil {
			rows.Close()
			return nil, fmt.Errorf("scan claimed row: %w", scanErr)
		}
		r.ownerID = owner.String
		r.payload = json.RawMessage(payload)
		claimed = append(claimed, r)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate claimed rows: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit claim tx: %w", err)
	}
	committed = true
	return claimed, nil
}

// process dispatches one claimed row to its handlers, then marks it processed. On
// dispatch failure it records the error and either dead-letters (>= max attempts)
// or leaves the lease in place so the row is retried after the lease expires
// (natural backoff — no hot-loop on a poison message).
func (m *SqlExternalMediator) process(ctx context.Context, r outboxRow) {
	event := rawIntegrationEventFromRow(r)
	if err := m.dispatch(ctx, event); err != nil {
		m.fail(ctx, r, err)
		return
	}
	if err := m.markProcessed(ctx, r.id); err != nil {
		// The row keeps its lease; it will be redelivered after expiry. Handlers are
		// idempotent (dedup UNIQUE at destination), so a duplicate delivery is safe.
		slog.Error("sql external mediator: mark processed failed",
			"id", r.id, "event", r.name, "error", err)
	}
}

// dispatch runs every handler registered for the event, with panic recovery,
// returning the first error so the row is retried.
func (m *SqlExternalMediator) dispatch(ctx context.Context, event types.IntegrationEventI) error {
	m.mu.RLock()
	handlers := append([]IntegrationEventHandler(nil), m.handlers[event.GetEventName()]...)
	m.mu.RUnlock()

	for _, h := range handlers {
		if err := m.safeHandle(ctx, h, event); err != nil {
			return err
		}
	}
	return nil
}

func (m *SqlExternalMediator) safeHandle(ctx context.Context, h IntegrationEventHandler, event types.IntegrationEventI) (err error) {
	defer func() {
		if r := recover(); r != nil {
			slog.Error("sql external mediator: handler panicked",
				"event", event.GetEventName(), "handler", fmt.Sprintf("%T", h), "panic", r)
			err = fmt.Errorf("handler panicked: %v", r)
		}
	}()
	return h.Handle(ctx, event)
}

func (m *SqlExternalMediator) markProcessed(ctx context.Context, id string) error {
	_, err := m.db.ExecContext(ctx,
		`UPDATE shared_outbox SET processed_at = ?, claimed_by = NULL WHERE id = ?`,
		m.now().UnixMilli(), id)
	return err
}

func (m *SqlExternalMediator) fail(ctx context.Context, r outboxRow, cause error) {
	attempts := r.attempts + 1
	if attempts >= integrationMaxAttempts {
		slog.Warn("sql external mediator: dead-lettering event",
			"id", r.id, "event", r.name, "attempts", attempts, "error", cause)
		// processed_at set → stops being claimed; last_error kept for audit.
		if _, err := m.db.ExecContext(ctx,
			`UPDATE shared_outbox SET attempts = ?, last_error = ?, processed_at = ?, claimed_by = NULL WHERE id = ?`,
			attempts, cause.Error(), m.now().UnixMilli(), r.id); err != nil {
			slog.Error("sql external mediator: dead-letter update failed", "id", r.id, "error", err)
		}
		return
	}
	slog.Error("sql external mediator: dispatch failed, will retry after lease",
		"id", r.id, "event", r.name, "attempts", attempts, "error", cause)
	// Keep claimed_by/lease_until in place → the row is hidden until the lease
	// expires, then reclaimed. attempts + last_error advance for observability.
	if _, err := m.db.ExecContext(ctx,
		`UPDATE shared_outbox SET attempts = ?, last_error = ? WHERE id = ?`,
		attempts, cause.Error(), r.id); err != nil {
		slog.Error("sql external mediator: retry update failed", "id", r.id, "error", err)
	}
}

// handlerNames returns the distinct event names with at least one registered
// handler — the claim's name filter (an empty set means egress-only).
func (m *SqlExternalMediator) handlerNames() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	names := make([]string, 0, len(m.handlers))
	for name, hs := range m.handlers {
		if len(hs) > 0 {
			names = append(names, name)
		}
	}
	return names
}

func (m *SqlExternalMediator) fireCallbacks(ctx context.Context, event types.IntegrationEventI) {
	m.mu.RLock()
	callbacks := make([]func(ctx context.Context, event types.IntegrationEventI), len(m.callbacks))
	copy(callbacks, m.callbacks)
	m.mu.RUnlock()
	for _, fn := range callbacks {
		fn(ctx, event)
	}
}

// integrationEventID prefers the event's own deterministic id (types.IntegrationEvent[T]
// exposes GetEventID) so a re-publish maps onto the same outbox row; otherwise it
// mints a fresh one.
func integrationEventID(event types.IntegrationEventI) string {
	if p, ok := event.(interface{ GetEventID() string }); ok {
		if id := p.GetEventID(); id != "" {
			return id
		}
	}
	return uuid.NewString()
}

func nullableText(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// integrationEventEnvelope mirrors the JSON written by json.Marshal(types.IntegrationEvent[T]).
type integrationEventEnvelope struct {
	ID      string          `json:"id"`
	OwnerID string          `json:"ownerId"`
	Name    string          `json:"name"`
	Payload json.RawMessage `json:"payload"`
}

// rawIntegrationEvent is a non-generic IntegrationEventI rebuilt from an outbox
// row, exposing the inner payload via GetPayload so UnmarshalIntegrationEvent[T]
// can extract a typed payload — the same slow-path shape rawDomainEvent uses.
type rawIntegrationEvent struct {
	id      string
	ownerID string
	name    string
	payload json.RawMessage
}

func (e *rawIntegrationEvent) GetEventName() string        { return e.name }
func (e *rawIntegrationEvent) GetOwnerID() string          { return e.ownerID }
func (e *rawIntegrationEvent) GetEventID() string          { return e.id }
func (e *rawIntegrationEvent) GetPayload() json.RawMessage { return e.payload }

// rawIntegrationEventFromRow reconstructs the event from the stored envelope,
// falling back to the row-level columns when the envelope is absent/partial.
func rawIntegrationEventFromRow(r outboxRow) *rawIntegrationEvent {
	var env integrationEventEnvelope
	if err := json.Unmarshal(r.payload, &env); err != nil {
		return &rawIntegrationEvent{id: r.id, ownerID: r.ownerID, name: r.name, payload: r.payload}
	}
	id := env.ID
	if id == "" {
		id = r.id
	}
	ownerID := env.OwnerID
	if ownerID == "" {
		ownerID = r.ownerID
	}
	name := env.Name
	if name == "" {
		name = r.name
	}
	payload := env.Payload
	if len(payload) == 0 {
		payload = r.payload
	}
	return &rawIntegrationEvent{id: id, ownerID: ownerID, name: name, payload: payload}
}

// Compile-time assertions.
var (
	_ ExternalMediator        = (*SqlExternalMediator)(nil)
	_ types.IntegrationEventI = (*rawIntegrationEvent)(nil)
)
