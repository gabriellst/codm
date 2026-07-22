package instance

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/google/uuid"

	"template/api-go/internal/channel/projections"
	"template/api-go/internal/shared/db/dbutil"
	sqldb "template/api-go/internal/shared/db/sql"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// newChannelTestDB opens an isolated test schema, runs all migrations, and
// returns *sql.DB plus a cleanup function. Skips the test when DATABASE_URL
// is not set — matches the convention used in pg_domain_event_repository_batch_test.go.
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

// makeChannelProjection builds a minimal *projections.Channel for testing.
func makeChannelProjection(ownerID string) *projections.Channel {
	now := time.Now().UTC().Truncate(time.Millisecond)
	return &projections.Channel{
		ID:          uuid.New().String(),
		OwnerID:     ownerID,
		Platform:    "WHATSAPP",
		Status:      "CREATED",
		ConnectedAt: nil,
		CreatedAt:   now,
		UpdatedAt:   now,
		Version:     1,
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

func TestPgChannelProjectionRepository_Find_Miss(t *testing.T) {
	db, cleanup := newChannelTestDB(t)
	defer cleanup()

	repo := NewPgChannelProjectionRepository(db)
	ch, err := repo.Find(context.Background(), uuid.New().String())
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if ch != nil {
		t.Fatalf("expected nil for missing channel, got %+v", ch)
	}
}

func TestPgChannelProjectionRepository_SaveAndFind(t *testing.T) {
	db, cleanup := newChannelTestDB(t)
	defer cleanup()

	repo := NewPgChannelProjectionRepository(db)
	proj := makeChannelProjection("owner-001")

	if err := repo.Save(context.Background(), proj); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got, err := repo.Find(context.Background(), proj.ID)
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if got == nil {
		t.Fatal("expected channel projection, got nil")
	}
	if got.ID != proj.ID {
		t.Errorf("ID: want %q, got %q", proj.ID, got.ID)
	}
	if got.OwnerID != proj.OwnerID {
		t.Errorf("OwnerID: want %q, got %q", proj.OwnerID, got.OwnerID)
	}
	if got.Platform != proj.Platform {
		t.Errorf("Platform: want %q, got %q", proj.Platform, got.Platform)
	}
	if got.Status != proj.Status {
		t.Errorf("Status: want %q, got %q", proj.Status, got.Status)
	}
	if got.ConnectedAt != nil {
		t.Errorf("ConnectedAt: expected nil, got %v", got.ConnectedAt)
	}
}

func TestPgChannelProjectionRepository_Save_Idempotent(t *testing.T) {
	db, cleanup := newChannelTestDB(t)
	defer cleanup()

	repo := NewPgChannelProjectionRepository(db)
	proj := makeChannelProjection("owner-002")

	if err := repo.Save(context.Background(), proj); err != nil {
		t.Fatalf("first Save: %v", err)
	}

	// Update status and save again — ON CONFLICT should update.
	proj.Status = "CONNECTED"
	now := time.Now().UTC()
	proj.ConnectedAt = &now

	if err := repo.Save(context.Background(), proj); err != nil {
		t.Fatalf("second Save: %v", err)
	}

	got, err := repo.Find(context.Background(), proj.ID)
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if got.Status != "CONNECTED" {
		t.Errorf("Status after update: want CONNECTED, got %q", got.Status)
	}
	if got.ConnectedAt == nil {
		t.Error("ConnectedAt should be set after update")
	}
	if got.Version < 2 {
		t.Errorf("version should be >= 2 after update, got %d", got.Version)
	}
}

func TestPgChannelProjectionRepository_ListByOwner(t *testing.T) {
	db, cleanup := newChannelTestDB(t)
	defer cleanup()

	repo := NewPgChannelProjectionRepository(db)
	ownerID := "owner-list-" + uuid.New().String()[:4]

	// Insert 3 channels for this owner and 1 for another.
	for i := 0; i < 3; i++ {
		p := makeChannelProjection(ownerID)
		if err := repo.Save(context.Background(), p); err != nil {
			t.Fatalf("Save %d: %v", i, err)
		}
	}
	other := makeChannelProjection("other-owner")
	if err := repo.Save(context.Background(), other); err != nil {
		t.Fatalf("Save other: %v", err)
	}

	list, err := repo.ListByOwner(context.Background(), ownerID)
	if err != nil {
		t.Fatalf("ListByOwner: %v", err)
	}
	if len(list) != 3 {
		t.Errorf("expected 3 channels, got %d", len(list))
	}
	for _, ch := range list {
		if ch.OwnerID != ownerID {
			t.Errorf("unexpected owner %q in list", ch.OwnerID)
		}
	}
}

func TestPgChannelProjectionRepository_ListByOwner_Empty(t *testing.T) {
	db, cleanup := newChannelTestDB(t)
	defer cleanup()

	repo := NewPgChannelProjectionRepository(db)
	list, err := repo.ListByOwner(context.Background(), "nonexistent-owner")
	if err != nil {
		t.Fatalf("ListByOwner: %v", err)
	}
	if list != nil && len(list) != 0 {
		t.Errorf("expected empty list, got %d items", len(list))
	}
}

func TestPgChannelProjectionRepository_NullableTimestamps(t *testing.T) {
	db, cleanup := newChannelTestDB(t)
	defer cleanup()

	repo := NewPgChannelProjectionRepository(db)
	proj := makeChannelProjection("owner-nullable")

	connectedAt := time.Now().UTC().Truncate(time.Millisecond)
	disconnectedAt := connectedAt.Add(time.Hour)
	proj.ConnectedAt = &connectedAt
	proj.DisconnectedAt = &disconnectedAt
	proj.Status = "DISCONNECTED"

	if err := repo.Save(context.Background(), proj); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got, err := repo.Find(context.Background(), proj.ID)
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if got.ConnectedAt == nil {
		t.Error("ConnectedAt should be set")
	} else if !got.ConnectedAt.Equal(connectedAt) {
		t.Errorf("ConnectedAt: want %v, got %v", connectedAt, *got.ConnectedAt)
	}
	if got.DisconnectedAt == nil {
		t.Error("DisconnectedAt should be set")
	}
}
