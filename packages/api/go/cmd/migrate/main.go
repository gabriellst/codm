package main

import (
	"database/sql"
	"log/slog"
	"os"

	"template/core-go/config"
	migratedb "template/core-go/db/sql"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		slog.Error("load config", "error", err)
		os.Exit(1)
	}

	db, err := sql.Open("pgx", migratedb.WithSearchPath(cfg.DatabaseURL, cfg.ServiceName))
	if err != nil {
		slog.Error("open database", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		slog.Error("ping database", "error", err)
		os.Exit(1)
	}

	if err := migratedb.RunMigrations(db, cfg); err != nil {
		slog.Error("run migrations", "error", err)
		os.Exit(1)
	}

	slog.Info("migrations applied", "schema", cfg.ServiceName)
}
