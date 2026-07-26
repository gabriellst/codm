// Round-trip test — promotes the db-sqlite-poc proof onto the CONCRETE
// SqliteStore. It boots a real store in a t.TempDir(), which mkdirs the dir,
// opens WAL, applies the //go:embed drizzle migration, and locks the data dir —
// then drives the sqlc-generated outbox queries against it and asserts every
// column round-trips (deliberately non-tautological: reads assert exact written
// values, not just "no error").
package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	sqlitedb "template/core-go/db/sqlite/gen"
)

func newTestStore(t *testing.T) *SqliteStore {
	t.Helper()
	store, err := NewSqliteStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewSqliteStore: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	return store
}

func TestNewSqliteStore_BootsMigratesLocks(t *testing.T) {
	store := newTestStore(t)

	// The store owns its file layout — the db lives at <dataDir>/codedm.db.
	if filepath.Base(store.Path()) != dbFileName {
		t.Fatalf("unexpected db path %q", store.Path())
	}

	// WAL was requested in the DSN; confirm it took on the live connection.
	var mode string
	if err := store.DB().QueryRow("PRAGMA journal_mode").Scan(&mode); err != nil {
		t.Fatalf("PRAGMA journal_mode: %v", err)
	}
	if mode != "wal" {
		t.Fatalf("expected WAL journal mode, got %q", mode)
	}

	// The embedded migration created the contract tables (spot-check a few across
	// namespaces) — proves the Drizzle→migration→SQLite leg end to end.
	for _, table := range []string{"shared_outbox", "thread_threads", "gateway_channels", "issue_issues"} {
		var name string
		err := store.DB().QueryRow(
			"SELECT name FROM sqlite_master WHERE type='table' AND name=?", table,
		).Scan(&name)
		if err != nil {
			t.Fatalf("expected table %q to exist after migration: %v", table, err)
		}
	}

	// The single-instance lockfile is held while the store is open.
	lockPath := store.Path() + ".lock"
	if got := readLockPID(lockPath); got <= 0 {
		t.Fatalf("expected a live lockfile at %q, read pid %d", lockPath, got)
	}
}

func TestNewSqliteStore_IsIdempotentAcrossReopen(t *testing.T) {
	dir := t.TempDir()

	first, err := NewSqliteStore(dir)
	if err != nil {
		t.Fatalf("first NewSqliteStore: %v", err)
	}
	if err := first.Close(); err != nil {
		t.Fatalf("close first: %v", err)
	}

	// Reopening the same populated data dir must NOT fail on "table already
	// exists" — the migrations ledger skips the applied migration.
	second, err := NewSqliteStore(dir)
	if err != nil {
		t.Fatalf("reopen NewSqliteStore (migrations not idempotent?): %v", err)
	}
	t.Cleanup(func() { _ = second.Close() })
}

func TestNewSqliteStore_SameProcessReopenIsIdempotent(t *testing.T) {
	dir := t.TempDir()

	first, err := NewSqliteStore(dir)
	if err != nil {
		t.Fatalf("first NewSqliteStore: %v", err)
	}
	t.Cleanup(func() { _ = first.Close() })

	// The lock is keyed on pid: a second open FROM THE SAME PROCESS is a
	// deliberate no-op (mirrors the TS acquireDataDirLock idempotency), so the
	// memoized composition root can construct the store more than once without
	// tripping its own guard.
	second, err := NewSqliteStore(dir)
	if err != nil {
		t.Fatalf("same-process reopen should be idempotent, got: %v", err)
	}
	t.Cleanup(func() { _ = second.Close() })
}

func TestAcquireDataDirLock_ForeignLiveOwnerFailsLoud(t *testing.T) {
	lockPath := filepath.Join(t.TempDir(), "codedm.db.lock")

	// Spawn a real, live process and plant ITS pid in the lockfile — a foreign
	// owner the guard must refuse (the same-pid idempotency branch cannot fire).
	cmd := exec.Command("sleep", "30")
	if err := cmd.Start(); err != nil {
		t.Fatalf("spawn foreign process: %v", err)
	}
	t.Cleanup(func() {
		_ = cmd.Process.Kill()
		_, _ = cmd.Process.Wait()
	})
	if err := os.WriteFile(lockPath, []byte(strconv.Itoa(cmd.Process.Pid)), 0o644); err != nil {
		t.Fatalf("plant foreign lock: %v", err)
	}

	release, err := acquireDataDirLock(lockPath)
	if err == nil {
		release()
		t.Fatal("expected acquire to be refused by a foreign live owner, got nil")
	}
	var lockErr *DataDirLockedError
	if !errors.As(err, &lockErr) {
		t.Fatalf("expected *DataDirLockedError, got %T: %v", err, err)
	}
	if lockErr.HeldByPID != cmd.Process.Pid {
		t.Fatalf("lock error names pid %d, want %d", lockErr.HeldByPID, cmd.Process.Pid)
	}
}

func TestAcquireDataDirLock_StaleLockIsReclaimed(t *testing.T) {
	lockPath := filepath.Join(t.TempDir(), "codedm.db.lock")

	// A pid from a process that has exited — its lock is stale and reclaimable.
	cmd := exec.Command("true")
	if err := cmd.Run(); err != nil {
		t.Fatalf("run throwaway process: %v", err)
	}
	deadPID := cmd.Process.Pid
	if err := os.WriteFile(lockPath, []byte(strconv.Itoa(deadPID)), 0o644); err != nil {
		t.Fatalf("plant stale lock: %v", err)
	}

	release, err := acquireDataDirLock(lockPath)
	if err != nil {
		t.Fatalf("expected stale lock to be reclaimed, got: %v", err)
	}
	defer release()
	if got := readLockPID(lockPath); got != os.Getpid() {
		t.Fatalf("after reclaim lockfile holds pid %d, want self %d", got, os.Getpid())
	}
}

func TestOutboxRoundTrip(t *testing.T) {
	ctx := context.Background()
	store := newTestStore(t)
	q := store.Queries()

	createdAt := time.Now().UnixMilli()
	const id = "018f4c00-0000-7000-8000-000000000001"
	const source = "thread"
	const name = "thread.MessageReceived"
	const payload = `{"threadId":"t-1","body":"hello"}`

	if err := q.InsertOutboxRow(ctx, sqlitedb.InsertOutboxRowParams{
		ID:        id,
		Name:      name,
		EntityID:  sql.NullString{String: "t-1", Valid: true},
		OwnerID:   sql.NullString{String: "owner-1", Valid: true},
		Payload:   payload,
		Source:    source,
		CreatedAt: createdAt,
	}); err != nil {
		t.Fatalf("InsertOutboxRow: %v", err)
	}

	got, err := q.GetOutboxRow(ctx, id)
	if err != nil {
		t.Fatalf("GetOutboxRow: %v", err)
	}
	if got.ID != id || got.Name != name || got.Source != source {
		t.Fatalf("row identity mismatch: %+v", got)
	}
	if got.Payload != payload {
		t.Fatalf("payload mismatch: %q", got.Payload)
	}
	if !got.EntityID.Valid || got.EntityID.String != "t-1" {
		t.Fatalf("entity_id mismatch: %+v", got.EntityID)
	}
	if !got.OwnerID.Valid || got.OwnerID.String != "owner-1" {
		t.Fatalf("owner_id mismatch: %+v", got.OwnerID)
	}
	if got.CreatedAt != createdAt {
		t.Fatalf("createdAt mismatch: got %d want %d", got.CreatedAt, createdAt)
	}
	if got.ProcessedAt.Valid {
		t.Fatalf("expected processed_at NULL, got %v", got.ProcessedAt)
	}
	if got.Attempts != 0 {
		t.Fatalf("expected attempts default 0, got %d", got.Attempts)
	}

	// Consumer read shape (outbox-as-transport): unprocessed rows for a source.
	unprocessed, err := q.ListUnprocessed(ctx, sqlitedb.ListUnprocessedParams{Source: source, Lim: 10})
	if err != nil {
		t.Fatalf("ListUnprocessed: %v", err)
	}
	if len(unprocessed) != 1 || unprocessed[0].ID != id {
		t.Fatalf("expected 1 unprocessed row, got %d: %+v", len(unprocessed), unprocessed)
	}

	// Mark processed → drops out of the unprocessed set and persists on the row.
	processedAt := time.Now().UnixMilli()
	if err := q.MarkProcessed(ctx, sqlitedb.MarkProcessedParams{
		ProcessedAt: sql.NullInt64{Int64: processedAt, Valid: true},
		ID:          id,
	}); err != nil {
		t.Fatalf("MarkProcessed: %v", err)
	}
	after, err := q.ListUnprocessed(ctx, sqlitedb.ListUnprocessedParams{Source: source, Lim: 10})
	if err != nil {
		t.Fatalf("ListUnprocessed (after): %v", err)
	}
	if len(after) != 0 {
		t.Fatalf("expected 0 unprocessed rows after MarkProcessed, got %d", len(after))
	}
	reread, err := q.GetOutboxRow(ctx, id)
	if err != nil {
		t.Fatalf("GetOutboxRow (after): %v", err)
	}
	if !reread.ProcessedAt.Valid || reread.ProcessedAt.Int64 != processedAt {
		t.Fatalf("processed_at not persisted: %+v", reread.ProcessedAt)
	}
}
