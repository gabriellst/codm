// Package sql provides the Postgres database client and migration runner.
//
// Migrations are owned by Drizzle (packages/contracts/). The embedded
// migrations/ directory is reserved for SQL test fixtures only — see
// migrations/README.md for details.
package sql

import (
	"database/sql"
	"embed"
	"fmt"

	"template/core-go/config"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
)

// migrationsFS embeds the migrations directory (fixtures only — no Drizzle-owned SQL).
//
//go:embed migrations
var migrationsFS embed.FS

// MigrationsFS returns the embedded migrations filesystem.
// Exported so that integration tests can embed SQL fixtures without duplicating
// the embed directive.
func MigrationsFS() embed.FS { return migrationsFS }

// RunMigrations applies any embedded *.sql files in the migrations/ directory to
// the given schema. This is a no-op when the directory contains only the README
// (no SQL files to apply).
func RunMigrations(db *sql.DB, cfg *config.Config) error {
	schema := cfg.OtelServiceName

	if _, err := db.Exec(fmt.Sprintf("CREATE SCHEMA IF NOT EXISTS %s", schema)); err != nil {
		return fmt.Errorf("create schema: %w", err)
	}

	source, err := iofs.New(migrationsFS, "migrations")
	if err != nil {
		return fmt.Errorf("migrate source: %w", err)
	}

	driver, err := postgres.WithInstance(db, &postgres.Config{
		SchemaName:      schema,
		MigrationsTable: "schema_migrations",
	})
	if err != nil {
		return fmt.Errorf("migrate driver: %w", err)
	}

	m, err := migrate.NewWithInstance("iofs", source, "postgres", driver)
	if err != nil {
		return fmt.Errorf("migrate new: %w", err)
	}

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("migrate up: %w", err)
	}

	return nil
}
