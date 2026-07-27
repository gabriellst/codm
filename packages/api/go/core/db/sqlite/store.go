// Package sqlite is the concrete SQLite substrate for the go-domain port: a
// single WAL database, pure-Go (modernc.org/sqlite, no cgo — the single static
// binary target, go-domain-design.md §1.3/§5.2), owning its whole lifecycle
// behind NewSqliteStore.
//
// The store ENCAPSULATES the data-dir dance the leaky CODEDM_DATA_DIR /
// CODEDM_MIGRATIONS_DIR pattern used to thread through callers: the constructor
// mkdirs the dir, opens the db in WAL with a busy timeout, applies the
// //go:embed migrations, and acquires a single-instance lock. Callers hand it a
// path (or "" for a per-platform default) and get a ready store — nothing about
// the filesystem layout, migrations, or locking leaks out.
package sqlite

import (
	"context"
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	sqlitedb "template/core-go/db/sqlite/gen"

	_ "modernc.org/sqlite"
)

// migrationsFS embeds the drizzle-kit-generated SQLite migrations at compile
// time — the //go:embed native path that makes the Bun wasm-embed pain disappear
// (go-domain-design.md §5.3). These are the VERBATIM drizzle output (backtick
// identifiers + `--> statement-breakpoint` separators); the store applies them by
// splitting on the breakpoint marker. sqlc reads a normalized transcript instead
// (schema.sql) because its parser rejects this dialect — see sqlc.yaml.
//
//go:embed migrations/*.sql
var migrationsFS embed.FS

const (
	// dbFileName is the single WAL database file inside the data dir.
	dbFileName = "codedm.db"
	// migrationsTable is the store's own applied-migrations ledger, making boot
	// idempotent: a squashed migration applied once is skipped on every reboot.
	//
	// The DDL that creates it (applyMigrations, below) is BYTE-IDENTICAL to the one
	// the TS daemon runs against the same file. `CREATE TABLE IF NOT EXISTS` is a
	// no-op for whoever arrives second, so "one ledger, two writers" is only true
	// while the two strings stay equal — do not reformat it.
	migrationsTable = "_sqlite_migrations"
	// statementBreakpoint is drizzle-kit's inter-statement separator.
	statementBreakpoint = "--> statement-breakpoint"

	// regimeDSNSuffix is the DSN every application query runs under.
	// migrationDSNSuffix differs in exactly one number: a migration may legitimately
	// wait out a long writer at boot, application queries may not. Both are spelled
	// out instead of built from a shared fmt template on purpose — the busy_timeout
	// of each handle is a load-bearing number that this phase's gates (and the TS
	// side's pragma order) grep for, and a %d would hide it.
	regimeDSNSuffix    = "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_txlock=immediate"
	migrationDSNSuffix = "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(30000)&_txlock=immediate"

	// migrationSlowWait is the threshold past which a migration is reported as having
	// waited on another writer. It is the regime busy_timeout: anything slower than
	// that would have FAILED on the regime handle, so it is exactly the interesting line.
	migrationSlowWait = 5 * time.Second
)

// SqliteStore is a live, migrated, single-instance-locked SQLite database plus
// the sqlc-generated typed queries over it. Construct with NewSqliteStore; always
// Close it (releases the lock and closes the db).
type SqliteStore struct {
	db      *sql.DB
	queries *sqlitedb.Queries
	path    string
	release func()
}

// NewSqliteStore opens (creating if absent) the codedm SQLite store under
// dataDir. When dataDir is "", a per-platform default under the user config dir
// is used. The constructor is the whole lifecycle: it resolves + mkdirs the dir,
// acquires a single-instance lock, opens the db in WAL mode with a busy timeout,
// and applies the embedded migrations. On any failure it unwinds cleanly (lock
// released, db closed) so a failed construction leaks nothing.
func NewSqliteStore(dataDir string) (*SqliteStore, error) {
	dir, err := resolveDataDir(dataDir)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("sqlite store: mkdir data dir %q: %w", dir, err)
	}

	dbPath := filepath.Join(dir, dbFileName)

	// Single-instance lock BEFORE opening — mirror the TS DataDirLock: fail loud
	// on a second live owner instead of silently sharing the file.
	release, err := acquireDataDirLock(dbPath + ".lock")
	if err != nil {
		return nil, err
	}

	// WAL: the multi-process-safe journal mode the outbox-as-transport story
	// relies on (go-domain-design.md §1.3). busy_timeout lets a writer wait out a
	// short lock instead of failing SQLITE_BUSY immediately. foreign_keys stays
	// OFF (SQLite default) so the squashed migration can create tables in any
	// order regardless of FK references. _txlock=immediate makes every write
	// transaction BEGIN IMMEDIATE — the write lock is taken up front rather than on
	// first write, which is what the SqliteUnitOfWork and the outbox claim loops
	// want (no deferred→upgrade SQLITE_BUSY window). Read-only transactions
	// (BeginTx with ReadOnly) still begin deferred; there are none today.
	dsn := "file:" + dbPath + regimeDSNSuffix
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		release()
		return nil, fmt.Errorf("sqlite store: open %q: %w", dbPath, err)
	}
	if err := db.Ping(); err != nil {
		_ = db.Close()
		release()
		return nil, fmt.Errorf("sqlite store: ping %q: %w", dbPath, err)
	}

	store := &SqliteStore{
		db:      db,
		queries: sqlitedb.New(db),
		path:    dbPath,
		release: release,
	}

	if err := store.applyMigrations(context.Background()); err != nil {
		_ = db.Close()
		release()
		return nil, err
	}

	return store, nil
}

// DB returns the underlying *sql.DB — for hand-written dynamic queries and for
// the sqlc Queries' DBTX (transactions via db.BeginTx).
func (s *SqliteStore) DB() *sql.DB { return s.db }

// Queries returns the sqlc-generated typed queries bound to this store's db.
func (s *SqliteStore) Queries() *sqlitedb.Queries { return s.queries }

// Path is the absolute path to the SQLite database file.
func (s *SqliteStore) Path() string { return s.path }

// Close closes the database and releases the single-instance lock. Safe to call
// once; idempotent releases are handled by the lock.
func (s *SqliteStore) Close() error {
	err := s.db.Close()
	if s.release != nil {
		s.release()
	}
	return err
}

// applyMigrations applies every embedded migration not yet recorded in the
// ledger, each in its own transaction, in lexical filename order. Idempotent:
// already-applied migrations are skipped, so re-running on every boot over a
// populated db is a no-op.
//
// TWO WRITERS, ONE LEDGER. The TS daemon runs the SAME applier over the SAME file,
// in whatever order the two processes happen to boot. That is not a problem as long
// as the "is it applied?" question is answered ATOMICALLY with the apply — see
// applyOne. This function's own pre-check is only a lock-free fast path.
func (s *SqliteStore) applyMigrations(ctx context.Context) error {
	// A DEDICATED handle for the whole migration pass. Pragmas are per CONNECTION and
	// the regime DSN pins busy_timeout at 5000 (parity with the TS side), so "raise it
	// to 30s just for the migration" cannot be done on the regime pool without either
	// contaminating a pooled connection or changing the value globally. Instead: a
	// second sql.Open on the SAME file, DSN identical except busy_timeout(30000),
	// closed before any application query ever runs. A stuck writer therefore holds
	// boot for 30s instead of failing at 5s — deliberate, and logged below.
	migDB, err := sql.Open("sqlite", "file:"+s.path+migrationDSNSuffix)
	if err != nil {
		return fmt.Errorf("sqlite store: open migration handle %q: %w", s.path, err)
	}
	defer func() { _ = migDB.Close() }()

	// VERBATIM the DDL the TS applier runs. See migrationsTable — the two strings
	// being equal is what makes "one ledger" true; CREATE TABLE IF NOT EXISTS makes
	// whoever loses the race a no-op instead of an error.
	if _, err := migDB.ExecContext(ctx, fmt.Sprintf(
		"CREATE TABLE IF NOT EXISTS %s (name TEXT PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL)",
		migrationsTable,
	)); err != nil {
		return fmt.Errorf("sqlite store: create migrations ledger: %w", err)
	}

	// The set to apply is derived from readdir → filter .sql → sort, NOT from
	// drizzle-kit's meta/_journal.json. The journal is drizzle-kit bookkeeping and
	// stays out of the runtime — which is why the //go:embed dir legitimately has no
	// meta/. The TS applier derives its set the same way, so the two agree by
	// construction and the ledger key is the full filename, `.sql` included.
	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("sqlite store: read embedded migrations: %w", err)
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)

	for _, name := range names {
		// LOCK-FREE FAST PATH — cheap, and NOT authoritative. Do not "clean this up"
		// into the only check: the authoritative one lives inside applyOne's write
		// transaction, and this one exists purely so a warm boot does zero BEGINs.
		applied, err := s.migrationApplied(ctx, migDB, name)
		if err != nil {
			return err
		}
		if applied {
			continue
		}
		started := time.Now()
		if err := s.applyOne(ctx, migDB, name); err != nil {
			return err
		}
		if waited := time.Since(started); waited > migrationSlowWait {
			slog.Warn("sqlite store: migration waited on another writer past the regime busy_timeout",
				"migration", name, "elapsed", waited, "busyTimeout", migrationDSNSuffix)
		}
	}
	return nil
}

func (s *SqliteStore) migrationApplied(ctx context.Context, db *sql.DB, name string) (bool, error) {
	var one int
	err := db.QueryRowContext(ctx,
		fmt.Sprintf("SELECT 1 FROM %s WHERE name = ?", migrationsTable), name,
	).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("sqlite store: check migration %q: %w", name, err)
	}
	return true, nil
}

// applyOne runs a single migration file's statements plus the ledger insert in
// one transaction — all-or-nothing.
//
// The FIRST thing it does inside that transaction is re-ask the ledger. The DSN
// carries _txlock=immediate, so BeginTx takes the write lock up front: from that
// point the answer cannot change under us, and the other process is either already
// recorded (we skip) or blocked behind us (it will skip). Without this re-check two
// boots that both passed the lock-free pre-check would BOTH execute the file, and
// the loser dies — migration 0000 is 25 CREATE TABLE with no IF NOT EXISTS and 0001
// is ALTER TABLE ... ADD, so re-execution is a fatal error, not a no-op.
func (s *SqliteStore) applyOne(ctx context.Context, db *sql.DB, name string) error {
	raw, err := migrationsFS.ReadFile(filepath.Join("migrations", name))
	if err != nil {
		return fmt.Errorf("sqlite store: read migration %q: %w", name, err)
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("sqlite store: begin tx for %q: %w", name, err)
	}
	defer func() { _ = tx.Rollback() }()

	// AUTHORITATIVE check — same query text as migrationApplied, run on the tx.
	var one int
	switch err := tx.QueryRowContext(ctx,
		fmt.Sprintf("SELECT 1 FROM %s WHERE name = ?", migrationsTable), name,
	).Scan(&one); {
	case err == nil:
		// The other writer got there between our pre-check and this BEGIN. Commit the
		// (empty) transaction to release the write lock promptly and report success.
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("sqlite store: commit skip of migration %q: %w", name, err)
		}
		return nil
	case !errors.Is(err, sql.ErrNoRows):
		return fmt.Errorf("sqlite store: re-check migration %q: %w", name, err)
	}

	for _, stmt := range strings.Split(string(raw), statementBreakpoint) {
		stmt = strings.TrimSpace(stmt)
		if stmt == "" {
			continue
		}
		if _, err := tx.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("sqlite store: apply migration %q statement %.60q: %w", name, stmt, err)
		}
	}

	if _, err := tx.ExecContext(ctx,
		fmt.Sprintf("INSERT INTO %s (name, applied_at) VALUES (?, ?)", migrationsTable),
		name, time.Now().UnixMilli(),
	); err != nil {
		return fmt.Errorf("sqlite store: record migration %q: %w", name, err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("sqlite store: commit migration %q: %w", name, err)
	}
	return nil
}

// resolveDataDir expands a leading ~ and resolves to an absolute path. An empty
// input selects a per-platform default under the user config dir, so a caller can
// pass nothing and still get a stable, OS-appropriate location.
func resolveDataDir(raw string) (string, error) {
	if raw == "" {
		base, err := os.UserConfigDir()
		if err != nil {
			return "", fmt.Errorf("sqlite store: resolve default data dir: %w", err)
		}
		return filepath.Join(base, "codedm"), nil
	}
	if strings.HasPrefix(raw, "~") {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("sqlite store: expand ~: %w", err)
		}
		return filepath.Join(home, strings.TrimPrefix(raw, "~")), nil
	}
	abs, err := filepath.Abs(raw)
	if err != nil {
		return "", fmt.Errorf("sqlite store: resolve data dir %q: %w", raw, err)
	}
	return abs, nil
}
