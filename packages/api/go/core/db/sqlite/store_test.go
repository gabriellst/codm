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
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
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

	// The store owns its file layout — the db lives at <dataDir>/codm.db.
	if filepath.Base(store.Path()) != dbFileName() {
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

// sleepHelperEnv marks the re-exec of THIS test binary as the disposable "foreign live process".
// It replaced `exec.Command("sleep", "30")`, which does not exist on Windows — the OS where this
// case only started meaning anything once the liveness probe learned to answer there (before that,
// lock.go read every pid as dead and the guard below could never fire).
const sleepHelperEnv = "CODM_SQLITE_LOCK_SLEEP_HELPER"

// TestSleepHelperProcess is not a test: it is the body of the child process spawned below. Without
// the env var it skips instantly, so a normal `go test ./...` costs nothing.
func TestSleepHelperProcess(t *testing.T) {
	if os.Getenv(sleepHelperEnv) == "" {
		t.Skip("helper process body — only runs when re-exec'd by this package's tests")
	}
	time.Sleep(30 * time.Second)
}

func startForeignProcess(t *testing.T) int {
	t.Helper()
	cmd := exec.Command(os.Args[0], "-test.run=^TestSleepHelperProcess$")
	cmd.Env = append(os.Environ(), sleepHelperEnv+"=1")
	if err := cmd.Start(); err != nil {
		t.Fatalf("spawn foreign process: %v", err)
	}
	t.Cleanup(func() {
		_ = cmd.Process.Kill()
		_, _ = cmd.Process.Wait()
	})
	return cmd.Process.Pid
}

func TestAcquireDataDirLock_ForeignLiveOwnerFailsLoud(t *testing.T) {
	lockPath := filepath.Join(t.TempDir(), "codm.db.lock")

	// A real, live process whose pid is planted in the lockfile — a foreign owner the guard must
	// refuse (the same-pid idempotency branch cannot fire).
	foreignPID := startForeignProcess(t)
	if err := os.WriteFile(lockPath, []byte(strconv.Itoa(foreignPID)), 0o644); err != nil {
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
	if lockErr.HeldByPID != foreignPID {
		t.Fatalf("lock error names pid %d, want %d", lockErr.HeldByPID, foreignPID)
	}
}

func TestAcquireDataDirLock_StaleLockIsReclaimed(t *testing.T) {
	lockPath := filepath.Join(t.TempDir(), "codm.db.lock")

	// A pid from a process that has exited — its lock is stale and reclaimable. Re-exec of this
	// binary with a filter that matches nothing: it starts, runs no test, exits 0.
	cmd := exec.Command(os.Args[0], "-test.run=^$")
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

// TestApplyOne_SkipsMigrationRecordedByAnotherWriter is the TOCTOU guard of the shared
// ledger, exercised at the level where the race actually resolves.
//
// The race: the TS daemon and this gateway boot against the SAME file, both pass the
// lock-free pre-check of applyMigrations ("not applied"), and both call applyOne. Whoever
// takes the write lock second MUST NOT re-execute the file — migration 0000 is 25
// CREATE TABLE with no IF NOT EXISTS, so re-execution is a fatal error, not a no-op.
//
// This drives exactly that second caller: a store is booted (so every migration is applied
// AND recorded), then applyOne is invoked again for the SAME name, as if the pre-check had
// gone stale. It must observe the ledger row from INSIDE its own transaction and return nil
// without running a statement. Before the in-transaction re-check this failed with
// "table ... already exists".
func TestApplyOne_SkipsMigrationRecordedByAnotherWriter(t *testing.T) {
	ctx := context.Background()
	store := newTestStore(t)

	names, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		t.Fatalf("ReadDir(migrations): %v", err)
	}
	applied := 0
	for _, e := range names {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".sql") {
			continue
		}
		applied++
		// Sanity: the boot really did record it, so the skip below is the branch under test
		// and not an accidental fresh apply.
		wasApplied, err := store.migrationApplied(ctx, store.DB(), e.Name())
		if err != nil {
			t.Fatalf("migrationApplied(%q): %v", e.Name(), err)
		}
		if !wasApplied {
			t.Fatalf("expected %q to be recorded in the ledger after boot", e.Name())
		}
		if err := store.applyOne(ctx, store.DB(), e.Name()); err != nil {
			t.Fatalf("applyOne(%q) on an already-recorded migration must skip, got: %v", e.Name(), err)
		}
	}
	if applied == 0 {
		t.Fatal("no embedded .sql migrations found — the test asserted nothing")
	}

	// And the skip did not duplicate the ledger row (the INSERT never ran).
	for _, e := range names {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".sql") {
			continue
		}
		var rows int
		if err := store.DB().QueryRowContext(ctx,
			fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE name = ?", migrationsTable), e.Name(),
		).Scan(&rows); err != nil {
			t.Fatalf("count ledger rows for %q: %v", e.Name(), err)
		}
		if rows != 1 {
			t.Fatalf("ledger holds %d rows for %q, want exactly 1", rows, e.Name())
		}
	}
}

// TestMigrationHandleIsSeparateAndClosed pins the mechanism decision (c)(6) chose: the
// migration pass runs on its OWN sql.Open with busy_timeout(30000), and the regime pool the
// application queries use keeps busy_timeout(5000). Asserting the two DSNs rather than a
// live PRAGMA is deliberate — the migration handle is closed before this test can observe a
// connection from it, which is exactly the property being pinned.
func TestMigrationHandleIsSeparateAndClosed(t *testing.T) {
	if !strings.Contains(migrationDSNSuffix, "busy_timeout(30000)") {
		t.Fatalf("migration DSN lost its 30s busy_timeout: %q", migrationDSNSuffix)
	}
	if !strings.Contains(regimeDSNSuffix, "busy_timeout(5000)") {
		t.Fatalf("regime DSN must stay at 5s for parity with the TS side: %q", regimeDSNSuffix)
	}
	if migrationDSNSuffix == regimeDSNSuffix {
		t.Fatal("migration and regime DSNs must differ in exactly the busy_timeout")
	}
	// Same file, same journal mode, same _txlock — only the timeout differs.
	if strings.Replace(migrationDSNSuffix, "busy_timeout(30000)", "busy_timeout(5000)", 1) != regimeDSNSuffix {
		t.Fatalf("migration DSN diverged from the regime DSN beyond busy_timeout:\n mig=%q\n reg=%q",
			migrationDSNSuffix, regimeDSNSuffix)
	}

	// The store still works after the migration handle was opened and closed at boot.
	store := newTestStore(t)
	var mode string
	if err := store.DB().QueryRow("PRAGMA journal_mode").Scan(&mode); err != nil {
		t.Fatalf("PRAGMA journal_mode: %v", err)
	}
	if mode != "wal" {
		t.Fatalf("regime handle lost WAL after the migration pass: %q", mode)
	}
}

// TestConcurrentBoot is the CROSS-LANGUAGE half of T28's proof of decision (b)(4).
//
// THE WINDOW. Both appliers run at boot over ONE ledger in ONE file, in whatever order the two
// processes happen to start. If the "is it applied?" question is answered OUTSIDE the write
// transaction — as this loop's lock-free pre-check deliberately is — then two cold boots can both
// answer "no", serialize on the write lock, and the loser re-executes the file. Migration 0000 is
// 25 CREATE TABLE with no IF NOT EXISTS and 0001 is ALTER TABLE ... ADD, so that is a hard error,
// not a no-op. applyOne closes it by RE-ASKING the ledger as its first statement inside the tx.
//
// A SEQUENTIAL TEST CANNOT SEE IT: whoever boots second hits the fast path and never opens the
// window. Every racer here must observe an EMPTY ledger before any of them takes the write lock,
// which is what the filesystem barrier arranges — the TS child pays its whole start-up cost (bun,
// module graph, libsql load, opening the file), creates its --ready file, and only then spins on
// --start. This process creates --start and releases its own goroutines from the same instant.
//
// AND IT IS CROSS-LANGUAGE ON PURPOSE. The Go appliers alone would only prove modernc interlocks
// with modernc. The property the phase actually ships is that a modernc BEGIN IMMEDIATE and a
// libsql BEGIN IMMEDIATE interlock over the same file — different bindings, different processes,
// one SQLite write lock. So the peer here is the real TS applier
// (packages/api/typescript/scripts/apply-migrations-once.ts), spawned as a real process.
//
// Run it repeatedly — the race is probabilistic: go test ./core/db/sqlite/... -run ConcurrentBoot -count=20
func TestConcurrentBoot(t *testing.T) {
	const goRacers = 3

	bun, err := exec.LookPath("bun")
	if err != nil {
		// NOT t.Skip: skipping turns "the cross-language race was never exercised" into a green
		// run, which is the exact class of vacuous pass this phase's gates exist to reject.
		t.Fatalf("bun is required for the cross-language half of this test: %v", err)
	}
	applier, err := filepath.Abs(filepath.Join("..", "..", "..", "..", "typescript", "scripts", "apply-migrations-once.ts"))
	if err != nil {
		t.Fatalf("resolve applier script: %v", err)
	}
	if _, err := os.Stat(applier); err != nil {
		t.Fatalf("TS applier script missing at %q: %v", applier, err)
	}

	dir := t.TempDir()
	readyFile := filepath.Join(dir, "ready-ts")
	startFile := filepath.Join(dir, "start")

	child := exec.Command(bun, applier, "--data-dir", dir, "--ready", readyFile, "--start", startFile)
	var childOut strings.Builder
	child.Stdout = &childOut
	child.Stderr = &childOut
	if err := child.Start(); err != nil {
		t.Fatalf("spawn TS applier: %v", err)
	}
	defer func() { _ = child.Process.Kill() }()

	deadline := time.Now().Add(60 * time.Second)
	for {
		if _, err := os.Stat(readyFile); err == nil {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("TS applier never reached the barrier; output so far:\n%s", childOut.String())
		}
		time.Sleep(2 * time.Millisecond)
	}

	// Every Go racer is parked on `release` BEFORE the TS child is let go, so the whole field
	// starts from one instant and all of them see the empty ledger.
	release := make(chan struct{})
	errs := make(chan error, goRacers)
	for i := 0; i < goRacers; i++ {
		go func() {
			<-release
			store, err := NewSqliteStore(dir)
			if err != nil {
				errs <- err
				return
			}
			_ = store.Close()
			errs <- nil
		}()
	}

	if err := os.WriteFile(startFile, []byte("go"), 0o644); err != nil {
		t.Fatalf("write start barrier: %v", err)
	}
	close(release)

	for i := 0; i < goRacers; i++ {
		if err := <-errs; err != nil {
			t.Fatalf("go applier %d failed: %v", i, err)
		}
	}
	if err := child.Wait(); err != nil {
		t.Fatalf("TS applier exited non-zero (%v); output:\n%s", err, childOut.String())
	}
	if !strings.Contains(childOut.String(), "APPLIER_APPLIED") {
		t.Fatalf("TS applier did not report success; output:\n%s", childOut.String())
	}

	// Post-conditions, read on a handle none of the racers used.
	db, err := sql.Open("sqlite", "file:"+filepath.Join(dir, dbFileName())+regimeDSNSuffix)
	if err != nil {
		t.Fatalf("open verification handle: %v", err)
	}
	defer func() { _ = db.Close() }()

	var ledgerRows int
	if err := db.QueryRow(fmt.Sprintf("SELECT COUNT(*) FROM %s", migrationsTable)).Scan(&ledgerRows); err != nil {
		t.Fatalf("count ledger: %v", err)
	}
	// One row per embedded .sql file — NOT one per racer, which is what a re-apply would leave.
	wantLedger := 0
	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		t.Fatalf("ReadDir(migrations): %v", err)
	}
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			wantLedger++
		}
	}
	if ledgerRows != wantLedger {
		t.Fatalf("ledger holds %d rows, want %d (one per migration file)", ledgerRows, wantLedger)
	}

	var tables int
	if err := db.QueryRow(
		"SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> " +
			"'" + migrationsTable + "'",
	).Scan(&tables); err != nil {
		t.Fatalf("count tables: %v", err)
	}
	// 29 drizzle tables (ONB-1 T2 added owner_onboardings, migration 0017 — was 28 after SP2 T2's
	// authentication_device_tokens + authentication_device_codes in 0016). No gateway-adapter
	// tables here: that schema is upgraded by the channel module's own store, which this test
	// does not boot.
	if tables != 29 {
		t.Fatalf("found %d application tables, want 29", tables)
	}

	var foreign int
	if err := db.QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'").Scan(&foreign); err != nil {
		t.Fatalf("check for the drizzle migrator ledger: %v", err)
	}
	if foreign != 0 {
		t.Fatal("__drizzle_migrations exists — the drizzle migrator is forbidden on the shared file (it is a second ledger the Go side cannot see)")
	}
}

// TOCTOU REGRESSION. acquireDataDirLock publishes the lockfile in two steps — create with O_EXCL,
// then write the pid. A racer that reads it BETWEEN them sees an EMPTY file, reads pid 0, judges a
// LIVE owner stale, and deletes its lock; the next racer to lose the re-create reports
// "already held by a running process (pid 0)". That is exactly how TestConcurrentBoot went red on
// the Linux runner. Same process on purpose: every acquire here must take the same-pid idempotent
// branch, so ANY error is the window and nothing else.
func TestAcquireDataDirLock_ConcurrentAcquiresInOneProcess(t *testing.T) {
	lockPath := filepath.Join(t.TempDir(), "codm.db.lock")

	const racers = 8
	start := make(chan struct{})
	results := make(chan error, racers)
	releases := make(chan func(), racers)

	for i := 0; i < racers; i++ {
		go func() {
			<-start
			release, err := acquireDataDirLock(lockPath)
			if err == nil {
				releases <- release
			}
			results <- err
		}()
	}
	close(start)

	var failures []error
	for i := 0; i < racers; i++ {
		if err := <-results; err != nil {
			failures = append(failures, err)
		}
	}
	close(releases)
	for release := range releases {
		release()
	}
	if len(failures) > 0 {
		t.Fatalf("%d/%d concurrent acquires from THIS process were refused; first: %v", len(failures), racers, failures[0])
	}
}
