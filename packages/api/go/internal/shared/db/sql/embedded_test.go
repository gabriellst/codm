package sql

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"testing"

	"go.uber.org/fx"
	"go.uber.org/fx/fxtest"

	"template/api-go/internal/shared/config"
	"template/api-go/internal/shared/db/dbutil"
)

func TestNewPostgresDB_FullLifecycle(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set, skipping integration test")
	}

	cfg := &config.Config{
		DatabaseURL: dbURL,
		ServiceName: "test_channel",
	}

	var db *sql.DB

	app := fxtest.New(t,
		fx.Supply(cfg),
		fx.Provide(NewPostgresDB),
		fx.Populate(&db),
	)
	app.RequireStart()
	defer app.RequireStop()

	// This test uses a fixed schema name (cfg.ServiceName), so it must drop it
	// on exit — otherwise the schema leaks across runs. Registered after the
	// RequireStop defer so it runs first (LIFO), while db is still open.
	defer func() {
		_, _ = db.Exec(fmt.Sprintf("DROP SCHEMA IF EXISTS %s CASCADE", cfg.ServiceName))
	}()

	if db == nil {
		t.Fatal("expected non-nil *sql.DB")
	}

	// RunMigrations replays the full migration set, including DDL on the global
	// `shared` schema (e.g. CREATE INDEX ... ON shared.events) that is not
	// concurrency-safe. Serialize it against the parallel repository test
	// binaries sharing this database. See dbutil.LockMigrations.
	unlock, lockErr := dbutil.LockMigrations(context.Background(), db)
	if lockErr != nil {
		t.Fatalf("LockMigrations: %v", lockErr)
	}
	err := RunMigrations(db, cfg)
	unlock()
	if err != nil {
		t.Fatalf("failed to run migrations: %v", err)
	}

	var tableCount int
	err = db.QueryRow(
		"SELECT count(*) FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'",
		cfg.ServiceName,
	).Scan(&tableCount)
	if err != nil {
		t.Fatalf("failed to query information_schema: %v", err)
	}

	if tableCount == 0 {
		t.Fatal("expected at least one table after migrations")
	}
}
