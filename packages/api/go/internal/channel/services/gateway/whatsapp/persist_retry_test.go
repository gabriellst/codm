package whatsapp

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

// realBusyError produces a GENUINE lock refusal from the driver — the error type is the driver's own and
// cannot be built by hand, and a hand-built stand-in would test the fake instead of the classification.
func realBusyError(t *testing.T) error {
	t.Helper()
	dsn := "file:" + filepath.Join(t.TempDir(), "busy.db") + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(0)"
	holder, err := sql.Open("sqlite", dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = holder.Close() })
	if _, err := holder.Exec(`CREATE TABLE t (id INTEGER)`); err != nil {
		t.Fatal(err)
	}
	conn, err := holder.Conn(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	if _, err := conn.ExecContext(context.Background(), `BEGIN IMMEDIATE`); err != nil {
		t.Fatal(err)
	}
	other, err := sql.Open("sqlite", dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = other.Close() })
	_, writeErr := other.Exec(`INSERT INTO t (id) VALUES (1)`)
	if writeErr == nil {
		t.Fatal("expected a lock refusal")
	}
	return fmt.Errorf("sqlite domain event repo: insert event channel.message_received: %w", writeErr)
}

// 2026-10-30: a `channel.message_received` was dropped on the first SQLITE_BUSY. FALSIFIER: return on
// the first error (no retry) and the save count stays at 1 with the batch lost.
func TestPersistWithRetryOutlastsATransientLock(t *testing.T) {
	busy := realBusyError(t)
	calls := 0
	var slept []time.Duration
	err := persistWithRetry(func() error {
		calls++
		if calls < 3 {
			return busy
		}
		return nil
	}, func(d time.Duration) { slept = append(slept, d) })

	if err != nil {
		t.Fatalf("a lock that clears within the attempts must persist the batch, got %v", err)
	}
	if calls != 3 {
		t.Fatalf("expected 3 attempts, got %d", calls)
	}
	if len(slept) != 2 || slept[0] != persistRetryBackoff || slept[1] != 2*persistRetryBackoff {
		t.Fatalf("expected growing backoff before each retry, got %v", slept)
	}
}

func TestPersistWithRetryGivesUpAfterTheBoundedAttempts(t *testing.T) {
	busy := realBusyError(t)
	calls := 0
	err := persistWithRetry(func() error { calls++; return busy }, func(time.Duration) {})
	if calls != persistAttempts || err == nil {
		t.Fatalf("a lock that never clears is reported after %d attempts, got calls=%d err=%v", persistAttempts, calls, err)
	}
}

func TestPersistWithRetryNeverRetriesANonLockFailure(t *testing.T) {
	calls := 0
	constraint := errors.New("UNIQUE constraint failed")
	err := persistWithRetry(func() error { calls++; return constraint }, func(time.Duration) {})
	if calls != 1 || !errors.Is(err, constraint) {
		t.Fatalf("a failure that will repeat must return at once, got calls=%d err=%v", calls, err)
	}
}
