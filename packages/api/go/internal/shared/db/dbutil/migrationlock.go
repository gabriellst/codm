package dbutil

import (
	"context"
	"database/sql"
)

// migrationLockKey is an arbitrary, process-wide constant identifying the
// advisory lock that guards the migration step. Any value works as long as
// every caller uses the same one.
const migrationLockKey = 727274

// LockMigrations serializes migrate.Up() across parallel test binaries that
// share a single Postgres database.
//
// `go test` runs each package's test binary concurrently. Every integration
// helper runs the full migration set, and several migrations target the global
// `shared` schema (e.g. CREATE INDEX ... ON shared.events). `CREATE ... IF NOT
// EXISTS` is NOT concurrency-safe: two sessions both observe the object as
// absent, both insert into pg_class, and one fails with
//
//	duplicate key value violates unique constraint "pg_class_relname_nsp_index"
//
// The per-test schema isolation does not cover these globally-qualified
// objects, so the migration step must be serialized. A session-level advisory
// lock lets the first binary create the shared DDL while the rest wait, then
// re-run the migrations as no-ops.
//
// The returned function releases the lock and the dedicated connection; call it
// once migrations have run (the actual test queries hit the per-test schema and
// do not need the lock).
func LockMigrations(ctx context.Context, db *sql.DB) (func(), error) {
	conn, err := db.Conn(ctx)
	if err != nil {
		return nil, err
	}
	if _, err := conn.ExecContext(ctx, "SELECT pg_advisory_lock($1)", migrationLockKey); err != nil {
		_ = conn.Close()
		return nil, err
	}
	return func() {
		_, _ = conn.ExecContext(ctx, "SELECT pg_advisory_unlock($1)", migrationLockKey)
		_ = conn.Close()
	}, nil
}
