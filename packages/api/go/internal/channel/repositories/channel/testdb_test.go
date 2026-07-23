package channel

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"testing"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/google/uuid"

	"template/core-go/db/dbutil"
	sqldb "template/core-go/db/sql"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// newChannelTestDB opens an isolated test schema, runs all migrations, and
// returns *sql.DB plus a cleanup function. Skips the test when
// CHANNEL_TEST_DATABASE_URL is not set (dedicated throwaway DB).
func newChannelTestDB(t *testing.T) (*sql.DB, func()) {
	t.Helper()

	dbURL := os.Getenv("CHANNEL_TEST_DATABASE_URL")
	if dbURL == "" {
		t.Skip("CHANNEL_TEST_DATABASE_URL not set (dedicated throwaway DB) — skipping pg integration test")
	}

	schema := fmt.Sprintf("test_chan_proj_%s", uuid.New().String()[:8])

	u, err := url.Parse(dbURL)
	if err != nil {
		u = &url.URL{RawQuery: ""}
	}
	q := u.Query()
	q.Set("search_path", schema+",public")
	u.RawQuery = q.Encode()

	db, err := sql.Open("pgx", u.String())
	if err != nil {
		t.Fatalf("sql.Open: %v", err)
	}
	if err := db.Ping(); err != nil {
		db.Close()
		t.Fatalf("db.Ping: %v", err)
	}

	if _, err := db.Exec(fmt.Sprintf("CREATE SCHEMA IF NOT EXISTS %s", schema)); err != nil {
		db.Close()
		t.Fatalf("create schema: %v", err)
	}

	migrationsFS := sqldb.MigrationsFS()
	source, err := iofs.New(migrationsFS, "migrations")
	if err != nil {
		db.Close()
		t.Fatalf("iofs.New: %v", err)
	}
	driver, err := postgres.WithInstance(db, &postgres.Config{
		SchemaName:      schema,
		MigrationsTable: "schema_migrations",
	})
	if err != nil {
		db.Close()
		t.Fatalf("postgres.WithInstance: %v", err)
	}
	m, err := migrate.NewWithInstance("iofs", source, "postgres", driver)
	if err != nil {
		db.Close()
		t.Fatalf("migrate.NewWithInstance: %v", err)
	}
	unlock, err := dbutil.LockMigrations(context.Background(), db)
	if err != nil {
		db.Close()
		t.Fatalf("LockMigrations: %v", err)
	}
	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		unlock()
		db.Close()
		t.Fatalf("migrate.Up: %v", err)
	}
	unlock()

	cleanup := func() {
		_, _ = db.Exec(fmt.Sprintf("DROP SCHEMA IF EXISTS %s CASCADE", schema))
		db.Close()
	}
	return db, cleanup
}
