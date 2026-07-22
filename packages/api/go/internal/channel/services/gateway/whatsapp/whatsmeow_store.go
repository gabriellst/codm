package whatsapp

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"

	"go.mau.fi/whatsmeow/store/sqlstore"
	waLog "go.mau.fi/whatsmeow/util/log"

	"template/api-go/internal/shared/config"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// NewSQLStore creates a whatsmeow sqlstore.Container using PostgreSQL.
func NewSQLStore(cfg *config.Config) (*sqlstore.Container, error) {
	db, err := sql.Open("pgx", cfg.WhatsmeowDatabaseURL)
	if err != nil {
		slog.Warn("whatsmeow store: failed to open db for schema init", "error", err)
	} else {
		if _, execErr := db.Exec("CREATE SCHEMA IF NOT EXISTS public"); execErr != nil {
			slog.Warn("whatsmeow store: CREATE SCHEMA failed", "error", execErr)
		}
		db.Close()
	}

	store, err := sqlstore.New(context.Background(), "pgx", cfg.WhatsmeowDatabaseURL, waLog.Stdout("whatsmeow-db", string(cfg.WhatsmeowLogLevel), true))
	if err != nil {
		return nil, fmt.Errorf("failed to create whatsmeow sqlstore: %w", err)
	}

	slog.Info("whatsmeow sqlstore initialized (postgres)")
	return store, nil
}
