package channel

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"testing"

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

	// Build the schema from the committed contract snapshot (schema.sql).
	// ApplySchema touches the global `shared` schema (not concurrency-safe),
	// so serialize against parallel test binaries via LockMigrations.
	unlock, err := dbutil.LockMigrations(context.Background(), db)
	if err != nil {
		db.Close()
		t.Fatalf("LockMigrations: %v", err)
	}
	if err := sqldb.ApplySchema(db, schema); err != nil {
		unlock()
		db.Close()
		t.Fatalf("ApplySchema: %v", err)
	}
	unlock()

	cleanup := func() {
		_, _ = db.Exec(fmt.Sprintf("DROP SCHEMA IF EXISTS %s CASCADE", schema))
		db.Close()
	}
	return db, cleanup
}
