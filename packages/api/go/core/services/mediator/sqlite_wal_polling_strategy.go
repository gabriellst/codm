package mediator

import (
	"context"
	"sync"
	"time"
)

// NotifyStrategy abstracts HOW the outbox consumer learns there is new work to
// pull — the pivot of go-domain-design.md §3(b). Publish writes the outbox row
// (that IS the transport); Notify is only the wake-up. Wait blocks until the
// strategy believes there may be unprocessed rows (or ctx is done), after which
// the consumer runs its SQL claim query.
//
// The swap from Redis Streams to the outbox does not need a cross-process push
// primitive (SQLite has no LISTEN/NOTIFY): a strategy can rely on polling, on an
// in-process nudge, or both. Close releases any dedicated resource the strategy
// holds.
type NotifyStrategy interface {
	// Notify signals that a row for source was just written (best-effort wake).
	Notify(ctx context.Context, source string) error
	// Wait blocks until there may be unprocessed rows for source, or ctx is done.
	Wait(ctx context.Context, source string) error
	// Close releases any dedicated connection / watcher the strategy holds.
	Close() error
}

const (
	// defaultMinPollInterval is the tight interval used right after activity — the
	// consumer stays responsive while there may be a burst of work.
	defaultMinPollInterval = 50 * time.Millisecond
	// defaultMaxPollInterval caps the backoff during quiet periods, bounding the
	// worst-case cross-process delivery latency (and the desktop battery cost).
	defaultMaxPollInterval = 2 * time.Second
)

// SqliteWalPollingStrategy is the concrete NotifyStrategy for the SQLite
// outbox-as-transport (go-domain-design.md §3(b)). It reconciles the two
// deployment shapes the founder ratified with ONE mechanism:
//
//   - SINGLE-BINARY target (the primary path): publisher and consumer are the
//     same process, so Publish → Notify pushes an in-process nudge and the
//     consumer's Wait returns immediately — near-zero latency, no polling
//     pressure. This is what "InternalMediator in-process is the primary path"
//     means for the collapsed Go binary.
//   - INTERIM multi-process desktop (the fallback): the publisher lives in a
//     different process (the TS daemon), so its write cannot nudge this
//     consumer. WAL mode makes the shared file a safe single-writer/many-reader
//     transport; the consumer then learns of the row by POLLING on an interval
//     with adaptive backoff.
//
// Backoff: the interval starts at minInterval and doubles up to maxInterval on
// each quiet (timed-out) wake; any nudge resets it to minInterval. A local
// publish therefore both wakes the loop instantly AND re-tightens the poll.
type SqliteWalPollingStrategy struct {
	minInterval time.Duration
	maxInterval time.Duration

	mu      sync.Mutex
	current time.Duration

	// nudge is a coalescing (buffered, cap 1) in-process wake channel: a same
	// process writer signals it via Notify so a waiting consumer returns at once.
	nudge chan struct{}
}

// NewSqliteWalPollingStrategy constructs the strategy. A non-positive minInterval
// selects the package defaults. maxInterval is clamped to be at least minInterval.
func NewSqliteWalPollingStrategy(minInterval, maxInterval time.Duration) *SqliteWalPollingStrategy {
	if minInterval <= 0 {
		minInterval = defaultMinPollInterval
	}
	if maxInterval < minInterval {
		maxInterval = defaultMaxPollInterval
		if maxInterval < minInterval {
			maxInterval = minInterval
		}
	}
	return &SqliteWalPollingStrategy{
		minInterval: minInterval,
		maxInterval: maxInterval,
		current:     minInterval,
		nudge:       make(chan struct{}, 1),
	}
}

// Notify is a best-effort in-process nudge (no cross-process push on SQLite). The
// send is non-blocking and coalescing: many publishes between two waits collapse
// into a single wake.
func (s *SqliteWalPollingStrategy) Notify(_ context.Context, _ string) error {
	select {
	case s.nudge <- struct{}{}:
	default:
	}
	return nil
}

// Wait blocks until a nudge arrives, the current poll interval elapses, or ctx is
// done. A nudge resets the backoff to minInterval (there was activity); a timeout
// grows it toward maxInterval (quiet period).
func (s *SqliteWalPollingStrategy) Wait(ctx context.Context, _ string) error {
	s.mu.Lock()
	d := s.current
	s.mu.Unlock()

	timer := time.NewTimer(d)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-s.nudge:
		s.mu.Lock()
		s.current = s.minInterval
		s.mu.Unlock()
		return nil
	case <-timer.C:
		s.mu.Lock()
		next := s.current * 2
		if next > s.maxInterval {
			next = s.maxInterval
		}
		s.current = next
		s.mu.Unlock()
		return nil
	}
}

// Close is a no-op: the strategy holds no dedicated DB connection or watcher.
func (s *SqliteWalPollingStrategy) Close() error { return nil }

// Compile-time assertion.
var _ NotifyStrategy = (*SqliteWalPollingStrategy)(nil)
