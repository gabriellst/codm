package repositories

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

	"template/api-go/internal/channel/enums"
	ctxevents "template/api-go/internal/channel/events"
	"template/api-go/internal/shared/db/dbutil"
	sqldb "template/api-go/internal/shared/db/sql"
	"template/core-go/types"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// newEmbeddedTestDB opens a connection to the test database and runs migrations
// in a unique schema so parallel test runs don't collide. It returns the *sql.DB
// and a cleanup function that drops the test schema and closes the connection.
//
// Follows the same skip convention as embedded_test.go: skips the test if
// DATABASE_URL is not set in the environment.
func newEmbeddedTestDB(t *testing.T) (*sql.DB, func()) {
	t.Helper()

	dbURL := os.Getenv("CHANNEL_TEST_DATABASE_URL")
	if dbURL == "" {
		t.Skip("CHANNEL_TEST_DATABASE_URL not set (dedicated throwaway DB) — skipping pg integration test")
	}

	// Use a unique schema per test invocation to allow parallel runs.
	schema := fmt.Sprintf("test_repo_%s", uuid.New().String()[:8])

	// Append search_path to the DSN so the pgx driver uses the test schema.
	u, err := url.Parse(dbURL)
	if err != nil {
		// Fall back to appending a query parameter if parsing fails.
		u = &url.URL{RawQuery: ""}
	}
	q := u.Query()
	q.Set("search_path", schema+",public")
	u.RawQuery = q.Encode()
	dsn := u.String()

	db, openErr := sql.Open("pgx", dsn)
	if openErr != nil {
		t.Fatalf("sql.Open: %v", openErr)
	}

	if err := db.Ping(); err != nil {
		db.Close()
		t.Fatalf("db.Ping: %v", err)
	}

	// Create schema and run migrations using the embedded FS from the sql package.
	if _, err := db.Exec(fmt.Sprintf("CREATE SCHEMA IF NOT EXISTS %s", schema)); err != nil {
		db.Close()
		t.Fatalf("create schema %s: %v", schema, err)
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

func makeGatewayConnectedEvents(n int, ownerID string) []types.DomainEventI {
	events := make([]types.DomainEventI, n)
	for i := 0; i < n; i++ {
		channelID := uuid.New()
		payload := ctxevents.GatewayConnectedPayload{
			ChannelID: channelID,
			Platform:  enums.PlatformWhatsApp,
			OwnerID:   ownerID,
		}
		events[i] = types.NewDomainEvent("channel.gateway_connected", channelID, ownerID, payload)
	}
	return events
}

func TestSaveAll_BatchInsert(t *testing.T) {
	db, cleanup := newEmbeddedTestDB(t)
	defer cleanup()
	repo := NewPgDomainEventRepository(db)

	// Use a unique owner_id per test invocation so parallel test-package runs
	// don't collide on the shared.events count (the table is schema-qualified
	// and bypasses per-test-schema isolation).
	ownerID := uuid.New().String()
	events := makeGatewayConnectedEvents(1000, ownerID)
	if err := repo.SaveAll(context.Background(), events); err != nil {
		t.Fatalf("SaveAll failed: %v", err)
	}

	var count int
	if err := db.QueryRowContext(context.Background(),
		`SELECT count(*) FROM shared.events WHERE owner_id = $1`,
		ownerID).Scan(&count); err != nil {
		t.Fatalf("count events: %v", err)
	}
	if count != 1000 {
		t.Fatalf("expected 1000 events rows, got %d", count)
	}

	if err := db.QueryRowContext(context.Background(),
		`SELECT count(*) FROM shared.outbox WHERE owner_id = $1`,
		ownerID).Scan(&count); err != nil {
		t.Fatalf("count outbox: %v", err)
	}
	if count != 1000 {
		t.Fatalf("expected 1000 outbox rows, got %d", count)
	}
}

func TestSaveAll_Idempotent(t *testing.T) {
	db, cleanup := newEmbeddedTestDB(t)
	defer cleanup()
	repo := NewPgDomainEventRepository(db)

	// Unique owner_id per invocation — parallel runs share shared.events.
	ownerID := uuid.New().String()
	events := makeGatewayConnectedEvents(5, ownerID)
	if err := repo.SaveAll(context.Background(), events); err != nil {
		t.Fatalf("first SaveAll: %v", err)
	}
	// ID collision → ON CONFLICT DO NOTHING.
	if err := repo.SaveAll(context.Background(), events); err != nil {
		t.Fatalf("second SaveAll: %v", err)
	}

	var count int
	_ = db.QueryRowContext(context.Background(),
		`SELECT count(*) FROM shared.events WHERE owner_id = $1`,
		ownerID).Scan(&count)
	if count != 5 {
		t.Fatalf("expected 5 events after duplicate save, got %d", count)
	}
}

func TestSaveAll_Empty(t *testing.T) {
	db, cleanup := newEmbeddedTestDB(t)
	defer cleanup()
	repo := NewPgDomainEventRepository(db)
	if err := repo.SaveAll(context.Background(), nil); err != nil {
		t.Fatalf("empty SaveAll: %v", err)
	}
}
