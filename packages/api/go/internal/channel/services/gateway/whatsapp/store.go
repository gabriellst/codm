package whatsapp

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"

	"go.mau.fi/whatsmeow/store/sqlstore"
	waLog "go.mau.fi/whatsmeow/util/log"

	_ "github.com/jackc/pgx/v5/stdlib"

	"template/core-go/config"
)

// NewSQLStore creates a whatsmeow sqlstore.Container backed by Postgres.
//
// The session store is deliberately separate from the app database (its own
// URL / schema) so the whatsmeow-owned tables never collide with the domain
// schema. It defaults to the app DATABASE_URL when the gateway-specific URL is
// unset — the "same data-dir family" reconciliation for a single-operator
// local daemon. (A file-backed SQLite store, per the desktop spec, is a
// follow-up: it needs a pure-Go sqlite driver dependency that must be vendored
// before offline builds can use it.)
func NewSQLStore(cfg *config.Config) (*sqlstore.Container, error) {
	dsn := cfg.WhatsmeowDatabaseURL
	if dsn == "" {
		dsn = cfg.DatabaseURL
	}

	// Ensure the target schema exists before whatsmeow runs its upgrades.
	if db, err := sql.Open("pgx", dsn); err == nil {
		if _, execErr := db.Exec("CREATE SCHEMA IF NOT EXISTS public"); execErr != nil {
			slog.Warn("whatsmeow store: CREATE SCHEMA failed", "error", execErr)
		}
		db.Close()
	} else {
		slog.Warn("whatsmeow store: failed to open db for schema init", "error", err)
	}

	container, err := sqlstore.New(context.Background(), "pgx", dsn, waLog.Stdout("whatsmeow-db", "WARN", true))
	if err != nil {
		return nil, fmt.Errorf("failed to create whatsmeow sqlstore: %w", err)
	}

	slog.Info("whatsmeow sqlstore initialized (postgres)")
	return container, nil
}
