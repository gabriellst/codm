package whatsapp

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"

	"go.mau.fi/whatsmeow/store/sqlstore"
	waLog "go.mau.fi/whatsmeow/util/log"
	"go.uber.org/fx"

	"template/core-go/config"
	"template/core-go/db/sqlite"

	_ "modernc.org/sqlite"
)

// WhatsmeowStore is whatsmeow's device/session container plus the dedicated
// *sql.DB it runs on. Both point at the SHARED SQLite file — the same codm.db
// the domain repositories, the event store and the outbox use — so a channel's
// session lives in the one store the console reads, not in a second database
// nobody else can see.
//
// The handle is DEDICATED (not SqliteStore.DB()) for one reason: whatsmeow's
// schema is foreign-key-bearing and its Upgrade refuses to run unless
// `PRAGMA foreign_keys` is ON, while the domain store deliberately keeps FKs OFF
// so the squashed drizzle migration can create tables in any order. Pragmas are
// per-connection in SQLite, so a second pool with foreign_keys(1) over the same
// file satisfies whatsmeow without disturbing what the domain migrations rely on.
// WAL makes two pools over one file safe; busy_timeout lets a writer wait out the
// other's lock instead of failing SQLITE_BUSY immediately.
type WhatsmeowStore struct {
	Container *sqlstore.Container
	DB        *sql.DB
}

// NewWhatsmeowStore opens the dedicated FK-on handle on the shared store's file
// and upgrades whatsmeow's own tables (whatsmeow_device, whatsmeow_*_keys,
// whatsmeow_app_state_*, tracked by its own whatsmeow_version ledger — no
// collision with the drizzle-owned tables). Close is registered on the fx
// lifecycle, so shutdown releases the pool.
//
// No data-dir appears here: the path comes from the already-constructed
// SqliteStore, the single owner of the filesystem layout.
func NewWhatsmeowStore(lc fx.Lifecycle, store *sqlite.SqliteStore, cfg *config.Config) (*WhatsmeowStore, error) {
	dsn := "file:" + store.Path() +
		"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)"

	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("whatsmeow store: open %q: %w", store.Path(), err)
	}
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("whatsmeow store: ping %q: %w", store.Path(), err)
	}

	// "sqlite" parses to whatsmeow's SQLite dialect (dbutil.ParseDialect matches on
	// the "sqlite" prefix) — that is what rewrites its $N queries to ?N and what
	// makes Upgrade check the foreign_keys pragma.
	container := sqlstore.NewWithDB(db, "sqlite",
		waLog.Stdout("whatsmeow-db", string(cfg.WhatsmeowLogLevel), true))
	if err := container.Upgrade(context.Background()); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("whatsmeow store: upgrade schema: %w", err)
	}

	lc.Append(fx.Hook{OnStop: func(context.Context) error {
		slog.Info("whatsmeow store closing")
		return db.Close()
	}})

	slog.Info("whatsmeow sqlstore initialized (shared sqlite)", "path", store.Path())
	return &WhatsmeowStore{Container: container, DB: db}, nil
}
