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

	"template/api-go/internal/shared/services/mediator"
	"template/api-go/internal/shared/types"
)

// Configuration constants.
const (
	batchSize        = 50
	maxAttempts      = 5
	ownerConcurrency = 10
	pollMin          = 50 * time.Millisecond
	pollMax          = time.Second
	backoffFactor    = 1.5
)

// OutboxSource discriminates rows produced by this service inside the shared
// outbox table. Each service polls only its own slice.
const OutboxSource = "gateway"

// outboxRow holds a single claimed outbox row plus its decoded event data.
type outboxRow struct {
	id       string
	name     string
	ownerID  string
	payload  json.RawMessage
	attempts int
}

// dispatchResult records what happened to each outbox row after processing.
type dispatchResult struct {
	succeeded []string    // IDs to DELETE
	failed    []outboxRow // rows to UPDATE (increment attempts, possibly dead-letter)
	skipped   []string    // IDs to release (clear processed_at)
}

// OutboxDispatcher polls the outbox table and dispatches domain events to the InternalMediator.
type OutboxDispatcher struct {
	db           *sql.DB
	mediator     mediator.InternalMediator
	pollInterval time.Duration
	stopCh       chan struct{}
	done         chan struct{}
	cancel       context.CancelFunc
}

// NewOutboxDispatcher creates a new OutboxDispatcher.
func NewOutboxDispatcher(db *sql.DB, m mediator.InternalMediator) *OutboxDispatcher {
	return &OutboxDispatcher{
		db:           db,
		mediator:     m,
		pollInterval: pollMin,
		stopCh:       make(chan struct{}),
		done:         make(chan struct{}),
	}
}

// Start launches the background polling goroutine.
// The provided context is NOT used for the loop lifetime — the dispatcher manages its own
// context so it survives beyond the fx OnStart phase. Use Stop() to shut it down.
func (d *OutboxDispatcher) Start(_ context.Context) {
	ctx, cancel := context.WithCancel(context.Background())
	d.cancel = cancel
	go func() {
		defer close(d.done)
		d.loop(ctx)
	}()
	slog.Info("outbox dispatcher: started")
}

// Stop signals the dispatcher to stop and waits for the goroutine to exit.
func (d *OutboxDispatcher) Stop() {
	close(d.stopCh)
	d.cancel()
	<-d.done
	slog.Info("outbox dispatcher: stopped")
}

// loop runs the adaptive-interval polling timer.
func (d *OutboxDispatcher) loop(ctx context.Context) {
	timer := time.NewTimer(0) // fire immediately on first tick
	defer timer.Stop()

	for {
		select {
		case <-d.stopCh:
			return
		case <-ctx.Done():
			return
		case <-timer.C:
			found, err := d.flush(ctx)
			if err != nil {
				slog.Error("outbox dispatcher: flush error", "error", err)
				d.pollInterval = min(time.Duration(float64(d.pollInterval)*backoffFactor), pollMax)
			} else if found {
				// More work may be waiting — poll quickly.
				d.pollInterval = pollMin
			} else {
				// Quiet period — back off.
				d.pollInterval = min(time.Duration(float64(d.pollInterval)*backoffFactor), pollMax)
			}
			timer.Reset(d.pollInterval)
		}
	}
}

// flush performs one full claim → process → finalize cycle.
// Returns true if any events were found (even if processing failed).
func (d *OutboxDispatcher) flush(ctx context.Context) (bool, error) {
	batches, err := d.claimBatch(ctx)
	if err != nil {
		return false, fmt.Errorf("claimBatch: %w", err)
	}

	total := 0
	for _, rows := range batches {
		total += len(rows)
	}
	if total == 0 {
		return false, nil
	}

	result := d.processEvents(ctx, batches)

	if err := d.finalize(ctx, result); err != nil {
		return true, fmt.Errorf("finalize: %w", err)
	}

	// If we got a full batch, recurse immediately to drain remaining rows.
	if total >= batchSize {
		_, _ = d.flush(ctx)
	}

	return true, nil
}

// claimBatch opens a transaction, SELECTs up to batchSize rows FOR UPDATE SKIP LOCKED,
// marks them with processed_at = NOW(), commits, and returns rows grouped by owner_id.
func (d *OutboxDispatcher) claimBatch(ctx context.Context) (map[string][]outboxRow, error) {
	tx, err := d.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	rows, err := tx.QueryContext(ctx,
		`SELECT id, name, owner_id, payload, attempts
		 FROM shared.outbox
		 WHERE source = $1 AND processed_at IS NULL
		 ORDER BY created_at
		 LIMIT $2
		 FOR UPDATE SKIP LOCKED`,
		OutboxSource, batchSize,
	)
	if err != nil {
		return nil, fmt.Errorf("select outbox rows: %w", err)
	}

	var claimed []outboxRow
	for rows.Next() {
		var row outboxRow
		var rawPayload []byte
		if scanErr := rows.Scan(&row.id, &row.name, &row.ownerID, &rawPayload, &row.attempts); scanErr != nil {
			rows.Close()
			return nil, fmt.Errorf("scan outbox row: %w", scanErr)
		}
		row.payload = json.RawMessage(rawPayload)
		claimed = append(claimed, row)
	}
	rows.Close()
	if rowsErr := rows.Err(); rowsErr != nil {
		return nil, fmt.Errorf("rows iteration: %w", rowsErr)
	}

	if len(claimed) == 0 {
		_ = tx.Commit()
		return nil, nil
	}

	// Mark rows as in-flight.
	ids := make([]string, len(claimed))
	for i, r := range claimed {
		ids[i] = r.id
	}
	now := time.Now().UTC()
	_, err = tx.ExecContext(ctx,
		`UPDATE shared.outbox SET processed_at = $1 WHERE id = ANY($2::text[])`,
		now, ids,
	)
	if err != nil {
		return nil, fmt.Errorf("mark processed_at: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit claim tx: %w", err)
	}

	// Group by owner.
	batches := make(map[string][]outboxRow)
	for _, r := range claimed {
		batches[r.ownerID] = append(batches[r.ownerID], r)
	}
	return batches, nil
}

// processEvents dispatches owner batches in parallel (up to ownerConcurrency at a time).
// Within each owner the events are processed sequentially; on first failure, remaining
// events for that owner are skipped.
func (d *OutboxDispatcher) processEvents(ctx context.Context, batches map[string][]outboxRow) dispatchResult {
	type ownerResult struct {
		succeeded []string
		failed    []outboxRow
		skipped   []string
	}

	sem := make(chan struct{}, ownerConcurrency)
	resultCh := make(chan ownerResult, len(batches))
	var wg sync.WaitGroup

	for ownerID, rows := range batches {
		wg.Add(1)
		go func(tid string, ownerRows []outboxRow) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			var tr ownerResult
			failed := false
			for _, row := range ownerRows {
				if failed {
					tr.skipped = append(tr.skipped, row.id)
					continue
				}

				event := toRawDomainEvent(row)
				if err := d.mediator.Dispatch(ctx, event); err != nil {
					slog.Error("outbox dispatcher: publish failed",
						"event", row.name,
						"id", row.id,
						"ownerId", tid,
						"error", err,
					)
					tr.failed = append(tr.failed, row)
					failed = true
				} else {
					slog.Debug("outbox dispatcher: dispatched",
						"event", row.name,
						"id", row.id,
						"ownerId", tid,
					)
					tr.succeeded = append(tr.succeeded, row.id)
				}
			}
			resultCh <- tr
		}(ownerID, rows)
	}

	wg.Wait()
	close(resultCh)

	var result dispatchResult
	for tr := range resultCh {
		result.succeeded = append(result.succeeded, tr.succeeded...)
		result.failed = append(result.failed, tr.failed...)
		result.skipped = append(result.skipped, tr.skipped...)
	}
	return result
}

// finalize applies the dispatch results to the outbox table inside a single transaction:
//   - DELETE succeeded rows
//   - UPDATE failed rows (increment attempts; clear processed_at if not dead-lettered)
//   - UPDATE skipped rows (clear processed_at so they're retried next cycle)
func (d *OutboxDispatcher) finalize(ctx context.Context, result dispatchResult) error {
	tx, err := d.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return fmt.Errorf("begin finalize tx: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	// Delete succeeded rows.
	if len(result.succeeded) > 0 {
		if _, err = tx.ExecContext(ctx,
			`DELETE FROM shared.outbox WHERE id = ANY($1::text[])`,
			result.succeeded,
		); err != nil {
			return fmt.Errorf("delete succeeded rows: %w", err)
		}
	}

	// Update failed rows.
	for _, row := range result.failed {
		newAttempts := row.attempts + 1
		if newAttempts >= maxAttempts {
			// Dead-letter: leave processed_at set (won't be retried), increment attempts.
			slog.Warn("outbox dispatcher: dead-lettering event",
				"id", row.id,
				"event", row.name,
				"attempts", newAttempts,
			)
			if _, err = tx.ExecContext(ctx,
				`UPDATE shared.outbox SET attempts = $1, updated_at = NOW() WHERE id = $2`,
				newAttempts, row.id,
			); err != nil {
				return fmt.Errorf("dead-letter row %s: %w", row.id, err)
			}
		} else {
			// Retry: clear processed_at so the next poll cycle picks it up.
			if _, err = tx.ExecContext(ctx,
				`UPDATE shared.outbox SET attempts = $1, processed_at = NULL, updated_at = NOW() WHERE id = $2`,
				newAttempts, row.id,
			); err != nil {
				return fmt.Errorf("retry row %s: %w", row.id, err)
			}
		}
	}

	// Release skipped rows (clear processed_at).
	if len(result.skipped) > 0 {
		if _, err = tx.ExecContext(ctx,
			`UPDATE shared.outbox SET processed_at = NULL, updated_at = NOW() WHERE id = ANY($1::text[])`,
			result.skipped,
		); err != nil {
			return fmt.Errorf("release skipped rows: %w", err)
		}
	}

	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit finalize tx: %w", err)
	}
	return nil
}

// rawDomainEvent is a lightweight DomainEventI implementation built from an outbox row.
// It stores the raw JSON payload so that UnmarshalDomainEvent[T] can unmarshal it later
// via the PayloadProvider slow path.
type rawDomainEvent struct {
	eventID   uuid.UUID
	entityID  uuid.UUID
	ownerID   string
	eventName string
	time      time.Time
	payload   json.RawMessage
}

// MarshalJSON emits the canonical DomainEvent[T] envelope so that consumers
// (e.g. the SSE listener) receive the same shape as in-memory typed events.
func (e *rawDomainEvent) MarshalJSON() ([]byte, error) {
	payload := e.payload
	if len(payload) == 0 {
		payload = json.RawMessage("null")
	}
	return json.Marshal(types.DomainEvent[json.RawMessage]{
		ID:       e.eventID,
		EntityID: e.entityID,
		OwnerID:  e.ownerID,
		Name:     e.eventName,
		Time:     e.time,
		Payload:  payload,
	})
}

// GetEventName implements DomainEventI.
func (e *rawDomainEvent) GetEventName() string { return e.eventName }

// GetEntityID implements DomainEventI.
func (e *rawDomainEvent) GetEntityID() uuid.UUID { return e.entityID }

// GetOwnerID implements DomainEventI.
func (e *rawDomainEvent) GetOwnerID() string { return e.ownerID }

// GetPayload implements mediator.PayloadProvider so that UnmarshalDomainEvent[T] can
// extract a typed payload from an outbox-dispatched event via JSON unmarshalling.
func (e *rawDomainEvent) GetPayload() json.RawMessage { return e.payload }

// Ensure rawDomainEvent satisfies both DomainEventI and PayloadProvider at compile time.
var _ types.DomainEventI = (*rawDomainEvent)(nil)
var _ mediator.PayloadProvider = (*rawDomainEvent)(nil)

// payloadEnvelope mirrors the JSON structure written to the outbox payload column by the
// TypeScript backend's DomainEventRepository and by Go's types.DomainEvent[T].
//
// The full envelope looks like:
//
//	{
//	  "id":       "<uuid>",
//	  "entityId": "<uuid>",
//	  "ownerId": "<string>",
//	  "name":     "<string>",
//	  "time":     "<RFC3339>",
//	  "payload":  { ... }   ← the typed inner payload
//	}
type payloadEnvelope struct {
	ID       string          `json:"id"`
	EntityID string          `json:"entityId"`
	OwnerID  string          `json:"ownerId"`
	Name     string          `json:"name"`
	Time     time.Time       `json:"time"`
	Payload  json.RawMessage `json:"payload"`
}

// toRawDomainEvent converts an outboxRow into a rawDomainEvent by unmarshalling the
// JSONB payload envelope to extract the core identity fields and the nested typed payload.
func toRawDomainEvent(row outboxRow) *rawDomainEvent {
	var env payloadEnvelope
	if err := json.Unmarshal(row.payload, &env); err != nil {
		// Fallback: use the outbox-level metadata and treat the whole payload as the inner payload.
		slog.Warn("outbox dispatcher: failed to unmarshal payload envelope, using raw payload",
			"id", row.id,
			"event", row.name,
			"error", err,
		)
		return &rawDomainEvent{
			eventID:   uuid.Nil,
			entityID:  uuid.Nil,
			ownerID:   row.ownerID,
			eventName: row.name,
			payload:   row.payload,
		}
	}

	eventID, _ := uuid.Parse(env.ID)
	entityID, _ := uuid.Parse(env.EntityID)

	// Prefer envelope-level ownerId and name; fall back to row-level values.
	ownerID := env.OwnerID
	if ownerID == "" {
		ownerID = row.ownerID
	}
	eventName := env.Name
	if eventName == "" {
		eventName = row.name
	}

	// The nested "payload" field is what handlers expect to unmarshal.
	innerPayload := env.Payload
	if len(innerPayload) == 0 {
		innerPayload = row.payload
	}

	return &rawDomainEvent{
		eventID:   eventID,
		entityID:  entityID,
		ownerID:   ownerID,
		eventName: eventName,
		time:      env.Time,
		payload:   innerPayload,
	}
}
