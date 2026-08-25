package outbox

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"

	"template/core-go/services/mediator"
)

const (
	// sqliteClaimBatch bounds one claim cycle (reuses the pg batch size).
	sqliteClaimBatch = batchSize
	// sqliteLease hides a claimed row from re-claim (and doubles as the failure
	// backoff) until it expires — mirrors the integration mediator's lease.
	sqliteLease = 30 * time.Second
	// sqliteMaxAttempts dead-letters a row after this many failed dispatches.
	sqliteMaxAttempts = maxAttempts
)

// SqliteOutboxDispatcher is the domain-event OutboxDispatcher over the SQLite
// substrate — the SQLite twin of the pg OutboxDispatcher. It drains the
// domain-event rows the SqliteDomainEventRepository dual-wrote to shared_outbox
// (source = the caller-declared lane, see NewSqliteOutboxDispatcher) and fans
// each to the InternalMediator (→ handlers, projectors), closing the
// write→claim→dispatch loop for the SQLite-backed contexts.
//
// Claim uses the same leased UPDATE as SqlExternalMediator: a per-claim token +
// lease_until, under a BEGIN IMMEDIATE write tx that COMMITS BEFORE dispatch — so a
// handler's own outbox write (e.g. an integration event) never contends with a
// still-held claim lock. Unlike the integration mediator (which filters by
// registered handler name), this dispatcher claims every unprocessed domain row of
// its source: the InternalMediator silently no-ops an event nobody handles, so an
// unhandled domain fact is still drained (marked processed), never stuck.
//
// Delivery is at-least-once; exactly-once comes from idempotent handlers + the
// destination's ON CONFLICT dedupe. Wake-up is the NotifyStrategy: an in-process
// nudge on commit (SqliteUnitOfWork) with an adaptive WAL poll as the fallback.
type SqliteOutboxDispatcher struct {
	db       *sql.DB
	mediator mediator.InternalMediator
	source   string
	notify   mediator.NotifyStrategy

	mu      sync.Mutex
	started bool
	cancel  context.CancelFunc
	done    chan struct{}

	// now is the injectable clock (tests drive lease expiry deterministically).
	now func() time.Time
}

// NewSqliteOutboxDispatcher builds the dispatcher over the SQLite store's db. It
// claims rows of source — the CALLER-declared lane (config.Service.OutboxSource)
// the domain-event dual-write stamps; this package does not choose the value,
// it only claims whichever lane it is handed — and dispatches them to m. notify
// decides how the loop wakes (in-process nudge and/or WAL poll — see
// SqliteWalPollingStrategy).
func NewSqliteOutboxDispatcher(db *sql.DB, m mediator.InternalMediator, source string, notify mediator.NotifyStrategy) *SqliteOutboxDispatcher {
	return &SqliteOutboxDispatcher{
		db:       db,
		mediator: m,
		source:   source,
		notify:   notify,
		done:     make(chan struct{}),
		now:      time.Now,
	}
}

// Start launches the consume loop. Idempotent: a second Start while running is a
// no-op.
func (d *SqliteOutboxDispatcher) Start(_ context.Context) {
	d.mu.Lock()
	if d.started {
		d.mu.Unlock()
		return
	}
	d.started = true
	// The loop owns its own context so it outlives the fx OnStart ctx; Stop cancels it.
	ctx, cancel := context.WithCancel(context.Background())
	d.cancel = cancel
	d.mu.Unlock()

	go d.consumeLoop(ctx)
	slog.Info("sqlite outbox dispatcher: started", "source", d.source)
}

// Stop cancels the consume loop, waits for it to drain out, and closes the notify
// strategy. Safe to call once.
func (d *SqliteOutboxDispatcher) Stop() {
	d.mu.Lock()
	if !d.started {
		d.mu.Unlock()
		return
	}
	d.started = false
	cancel := d.cancel
	d.mu.Unlock()

	if cancel != nil {
		cancel()
	}
	<-d.done
	if d.notify != nil {
		_ = d.notify.Close()
	}
	slog.Info("sqlite outbox dispatcher: stopped", "source", d.source)
}

// consumeLoop drains all currently-claimable work on each wake, then blocks on the
// NotifyStrategy until the next nudge or poll tick.
func (d *SqliteOutboxDispatcher) consumeLoop(ctx context.Context) {
	defer close(d.done)
	for {
		for {
			n, err := d.drainOnce(ctx)
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				slog.Error("sqlite outbox dispatcher: drain error", "source", d.source, "error", err)
				break
			}
			if n < sqliteClaimBatch {
				break // fewer than a full batch → nothing left this cycle
			}
		}
		if err := d.notify.Wait(ctx, d.source); err != nil {
			return // ctx cancelled
		}
	}
}

// drainOnce claims a batch and dispatches it. Returns the number of rows claimed.
func (d *SqliteOutboxDispatcher) drainOnce(ctx context.Context) (int, error) {
	rows, err := d.claim(ctx)
	if err != nil {
		return 0, err
	}
	for _, r := range rows {
		d.process(ctx, r)
	}
	return len(rows), nil
}

// claim leases up to sqliteClaimBatch unprocessed rows of this source under a
// single BEGIN IMMEDIATE write transaction: stamp claimed_by (an opaque per-claim
// token) + lease_until, then read back exactly the rows this token won. The tx
// commits before the caller dispatches, so a handler's downstream write is never
// blocked by a held claim lock.
func (d *SqliteOutboxDispatcher) claim(ctx context.Context) ([]outboxRow, error) {
	token := uuid.NewString()
	now := d.now().UnixMilli()
	leaseUntil := now + sqliteLease.Milliseconds()

	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin claim tx: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	if _, err = tx.ExecContext(ctx,
		`UPDATE shared_outbox
		 SET claimed_by = ?, lease_until = ?
		 WHERE id IN (
		     SELECT id FROM shared_outbox
		     WHERE source = ?
		       AND processed_at IS NULL
		       AND (lease_until IS NULL OR lease_until < ?)
		     ORDER BY created_at
		     LIMIT ?
		 )`,
		token, leaseUntil, d.source, now, sqliteClaimBatch,
	); err != nil {
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

// process reconstructs the typed domain event from the stored envelope, dispatches
// it synchronously to the InternalMediator, then marks it processed. A dispatch
// failure keeps the lease (natural backoff) or dead-letters past the attempt cap.
func (d *SqliteOutboxDispatcher) process(ctx context.Context, r outboxRow) {
	event := toRawDomainEvent(r)
	if err := d.mediator.Dispatch(ctx, event); err != nil {
		d.fail(ctx, r, err)
		return
	}
	if err := d.markProcessed(ctx, r.id); err != nil {
		// The row keeps its lease; it will be redelivered after expiry. Handlers are
		// idempotent (dedupe at destination), so a duplicate delivery is safe.
		slog.Error("sqlite outbox dispatcher: mark processed failed",
			"id", r.id, "event", r.name, "error", err)
	}
}

func (d *SqliteOutboxDispatcher) markProcessed(ctx context.Context, id string) error {
	_, err := d.db.ExecContext(ctx,
		`UPDATE shared_outbox SET processed_at = ?, claimed_by = NULL WHERE id = ?`,
		d.now().UnixMilli(), id)
	return err
}

func (d *SqliteOutboxDispatcher) fail(ctx context.Context, r outboxRow, cause error) {
	attempts := r.attempts + 1
	if attempts >= sqliteMaxAttempts {
		slog.Warn("sqlite outbox dispatcher: dead-lettering event",
			"id", r.id, "event", r.name, "attempts", attempts, "error", cause)
		// processed_at set → stops being claimed; last_error kept for audit.
		if _, err := d.db.ExecContext(ctx,
			`UPDATE shared_outbox SET attempts = ?, last_error = ?, processed_at = ?, claimed_by = NULL WHERE id = ?`,
			attempts, cause.Error(), d.now().UnixMilli(), r.id); err != nil {
			slog.Error("sqlite outbox dispatcher: dead-letter update failed", "id", r.id, "error", err)
		}
		return
	}
	slog.Error("sqlite outbox dispatcher: dispatch failed, will retry after lease",
		"id", r.id, "event", r.name, "attempts", attempts, "error", cause)
	// Keep claimed_by/lease_until in place → hidden until the lease expires, then
	// reclaimed. attempts + last_error advance for observability.
	if _, err := d.db.ExecContext(ctx,
		`UPDATE shared_outbox SET attempts = ?, last_error = ? WHERE id = ?`,
		attempts, cause.Error(), r.id); err != nil {
		slog.Error("sqlite outbox dispatcher: retry update failed", "id", r.id, "error", err)
	}
}
