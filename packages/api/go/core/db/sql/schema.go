package sql

import (
	"context"
	"database/sql"
	_ "embed"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"
)

// schemaSQL is the committed contract snapshot — the schema-only pg_dump of the
// Drizzle-owned `gateway` + `shared` schemas (see sqlc.yaml for the regen
// command). It is the SINGLE schema source: the Go side no longer owns a
// parallel golang-migrate set. Tests build their schema from this snapshot so
// what the suite exercises is exactly the contract shape.
//
//go:embed schema.sql
var schemaSQL string

// ApplySchema materializes the contract schema into `schema` (a fresh, isolated
// per-test schema) plus the global `shared` schema, from the committed
// schema.sql snapshot — the replacement for RunMigrations/MigrationsFS in the
// test harness.
//
// Routing mirrors the previous golang-migrate behavior:
//   - gateway objects are de-qualified (`gateway.` stripped) so they land in
//     `schema` via search_path — giving each test binary an isolated copy.
//   - `shared.*` objects stay schema-qualified and live in one global `shared`
//     schema, coexisting across parallel test binaries. Re-creates on the 2nd+
//     binary raise "already exists"; those are swallowed (see isAlreadyExists),
//     which is why callers still serialize via dbutil.LockMigrations.
func ApplySchema(db *sql.DB, schema string) error {
	ctx := context.Background()

	conn, err := db.Conn(ctx)
	if err != nil {
		return fmt.Errorf("apply schema: acquire conn: %w", err)
	}
	defer conn.Close()

	if _, err := conn.ExecContext(ctx, fmt.Sprintf("CREATE SCHEMA IF NOT EXISTS %s", schema)); err != nil {
		return fmt.Errorf("apply schema: create schema %q: %w", schema, err)
	}
	if _, err := conn.ExecContext(ctx, "CREATE SCHEMA IF NOT EXISTS shared"); err != nil {
		return fmt.Errorf("apply schema: create shared schema: %w", err)
	}
	// Pin unqualified DDL to the target schema for this connection. gateway
	// objects (de-qualified below) resolve here; `shared.*` stays explicit.
	if _, err := conn.ExecContext(ctx, fmt.Sprintf("SET search_path TO %s, shared, public", schema)); err != nil {
		return fmt.Errorf("apply schema: set search_path: %w", err)
	}

	for _, stmt := range schemaStatements(schemaSQL) {
		if _, err := conn.ExecContext(ctx, stmt); err != nil {
			if isAlreadyExists(err) {
				// Global `shared` object already built by a parallel binary.
				continue
			}
			return fmt.Errorf("apply schema: exec %.80q: %w", stmt, err)
		}
	}

	return nil
}

// schemaStatements turns the pg_dump snapshot into executable statements routed
// for a per-test schema: comment/SET/meta noise dropped, CREATE SCHEMA lines
// dropped (handled explicitly above), gateway qualifier stripped, and CREATE
// TABLE/INDEX made idempotent so a re-run against the global `shared` schema is
// a no-op rather than an error.
func schemaStatements(dump string) []string {
	var kept []string
	for _, line := range strings.Split(dump, "\n") {
		trimmed := strings.TrimSpace(line)
		switch {
		case trimmed == "":
			continue
		case strings.HasPrefix(trimmed, "--"):
			continue
		case strings.HasPrefix(trimmed, `\`):
			continue
		case strings.HasPrefix(trimmed, "SET "):
			continue
		case strings.HasPrefix(trimmed, "SELECT pg_catalog.set_config"):
			continue
		case strings.HasPrefix(trimmed, "CREATE SCHEMA "):
			continue
		}
		kept = append(kept, line)
	}

	body := strings.Join(kept, "\n")
	body = strings.ReplaceAll(body, "gateway.", "")
	body = strings.ReplaceAll(body, "CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ")
	body = strings.ReplaceAll(body, "CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ")
	body = strings.ReplaceAll(body, "CREATE UNIQUE INDEX ", "CREATE UNIQUE INDEX IF NOT EXISTS ")

	var stmts []string
	for _, raw := range strings.Split(body, ";") {
		stmt := strings.TrimSpace(raw)
		if stmt != "" {
			stmts = append(stmts, stmt)
		}
	}
	return stmts
}

// isAlreadyExists reports whether err is a Postgres "already exists" class error
// (duplicate schema/table/index/object) — expected when a parallel test binary
// already created a global `shared` object.
func isAlreadyExists(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "42P06", // duplicate_schema
			"42P07", // duplicate_table (also indexes)
			"42710", // duplicate_object (named constraints re-added)
			"42P16", // invalid_table_definition (PRIMARY KEY re-added: "multiple primary keys")
			"42701": // duplicate_column (ALTER ... ADD COLUMN re-run)
			return true
		}
	}
	return false
}
