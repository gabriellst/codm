package sql

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"net/url"
	"time"

	"go.uber.org/fx"

	"template/api-go/internal/shared/config"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func NewPostgresDB(lc fx.Lifecycle, cfg *config.Config) (*sql.DB, error) {
	dsn := WithSearchPath(cfg.DatabaseURL, cfg.ServiceName)

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open postgres database: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to ping postgres database: %w", err)
	}

	slog.Info("postgres database opened", "url", cfg.DatabaseURL)

	lc.Append(fx.Hook{
		OnStop: func(ctx context.Context) error {
			slog.Info("closing postgres database")
			return db.Close()
		},
	})

	return db, nil
}

// WithSearchPath ensures search_path is set in the DSN so every pooled connection uses it.
func WithSearchPath(dsn, schema string) string {
	u, err := url.Parse(dsn)
	if err != nil {
		return dsn
	}
	q := u.Query()
	q.Set("search_path", schema+",public")
	u.RawQuery = q.Encode()
	return u.String()
}
