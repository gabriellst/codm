package sql

import (
	"database/sql"
	"os"
	"testing"

	"go.uber.org/fx"
	"go.uber.org/fx/fxtest"

	"template/core-go/config"
)

func TestNewPostgresDB_FullLifecycle(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set, skipping integration test")
	}

	cfg := &config.Config{
		DatabaseURL:     dbURL,
		OtelServiceName: "test_channel",
	}

	var db *sql.DB

	app := fxtest.New(t,
		fx.Supply(cfg),
		fx.Provide(NewPostgresDB),
		fx.Populate(&db),
	)
	app.RequireStart()
	defer app.RequireStop()

	if db == nil {
		t.Fatal("expected non-nil *sql.DB")
	}

	err := RunMigrations(db, cfg)
	if err != nil {
		t.Fatalf("failed to run migrations: %v", err)
	}

	var tableCount int
	err = db.QueryRow(
		"SELECT count(*) FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'",
		cfg.OtelServiceName,
	).Scan(&tableCount)
	if err != nil {
		t.Fatalf("failed to query information_schema: %v", err)
	}

	if tableCount == 0 {
		t.Fatal("expected at least one table after migrations")
	}
}
