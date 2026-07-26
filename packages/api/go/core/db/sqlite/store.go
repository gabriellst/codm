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
	migrationsTable = "_sqlite_migrations"
	// statementBreakpoint is drizzle-kit's inter-statement separator.
	statementBreakpoint = "--> statement-breakpoint"
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
	dsn := "file:" + dbPath + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_txlock=immediate"
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
func (s *SqliteStore) applyMigrations(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx, fmt.Sprintf(
		"CREATE TABLE IF NOT EXISTS %s (name TEXT PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL)",
		migrationsTable,
	)); err != nil {
		return fmt.Errorf("sqlite store: create migrations ledger: %w", err)
	}

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
		applied, err := s.migrationApplied(ctx, name)
		if err != nil {
			return err
		}
		if applied {
			continue
		}
		if err := s.applyOne(ctx, name); err != nil {
			return err
		}
	}
	return nil
}

func (s *SqliteStore) migrationApplied(ctx context.Context, name string) (bool, error) {
	var one int
	err := s.db.QueryRowContext(ctx,
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
func (s *SqliteStore) applyOne(ctx context.Context, name string) error {
	raw, err := migrationsFS.ReadFile(filepath.Join("migrations", name))
	if err != nil {
		return fmt.Errorf("sqlite store: read migration %q: %w", name, err)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("sqlite store: begin tx for %q: %w", name, err)
	}
	defer func() { _ = tx.Rollback() }()

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
