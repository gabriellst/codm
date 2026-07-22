package remote

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

	"template/api-go/internal/channel/entities"
	channelenums "template/api-go/internal/channel/enums"
	"template/api-go/internal/channel/projections"
	"template/api-go/internal/shared/db/dbutil"
	sqldb "template/api-go/internal/shared/db/sql"
	sharedrepos "template/api-go/internal/shared/repositories"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// newRemoteTestDB opens an isolated schema and runs migrations.
// Skips if DATABASE_URL is not set.
func newRemoteTestDB(t *testing.T) (*sql.DB, func()) {
	t.Helper()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set, skipping integration test")
	}

	schema := fmt.Sprintf("test_remote_%s", uuid.New().String()[:8])

	u, _ := url.Parse(dbURL)
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

	fs := sqldb.MigrationsFS()
	src, err := iofs.New(fs, "migrations")
	if err != nil {
		db.Close()
		t.Fatalf("iofs.New: %v", err)
	}
	drv, err := postgres.WithInstance(db, &postgres.Config{SchemaName: schema, MigrationsTable: "schema_migrations"})
	if err != nil {
		db.Close()
		t.Fatalf("postgres.WithInstance: %v", err)
	}
	m, err := migrate.NewWithInstance("iofs", src, "postgres", drv)
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

// seedChannel inserts a row into the channels projection table so that
// pg_remote_repository's Find can join on it for owner_id.
func seedChannel(t *testing.T, db *sql.DB, channelID, ownerID string) {
	t.Helper()
	now := time.Now().UTC()
	_, err := db.Exec(
		`INSERT INTO channels (id, owner_id, platform, name, status, created_at, updated_at, version)
		 VALUES ($1,$2,'WHATSAPP',$3,'CREATED',$4,$4,1)
		 ON CONFLICT (id) DO NOTHING`,
		channelID, ownerID, fmt.Sprintf("test-%s", channelID), now,
	)
	if err != nil {
		t.Fatalf("seedChannel: %v", err)
	}
}

// seedRemoteProjection inserts a minimal row into remotes (used so that
// Find can read invariant fields without going through Save).
func seedRemoteProjection(t *testing.T, db *sql.DB, channelID, remoteID string, rt channelenums.RemoteType) {
	t.Helper()
	now := time.Now().UTC()
	_, err := db.Exec(
		`INSERT INTO remotes
		   (channel_id, remote_id, type, platform, name, created_at, updated_at, version)
		 VALUES ($1,$2,$3,'WHATSAPP','',$4,$4,1)
		 ON CONFLICT (channel_id, remote_id) DO NOTHING`,
		channelID, remoteID, string(rt), now,
	)
	if err != nil {
		t.Fatalf("seedRemoteProjection: %v", err)
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

func TestPgRemoteRepository_Find_Miss(t *testing.T) {
	db, cleanup := newRemoteTestDB(t)
	defer cleanup()

	repo := NewPgRemoteRepository(db, sharedrepos.NewPgDomainEventRepository(db))
	remote, err := repo.Find(context.Background(), uuid.New().String(), "nonexistent@s.whatsapp.net")
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if remote != nil {
		t.Fatalf("expected nil for missing remote, got %+v", remote)
	}
}

func TestPgRemoteRepository_Find_Hit(t *testing.T) {
	db, cleanup := newRemoteTestDB(t)
	defer cleanup()

	channelID := uuid.New().String()
	remoteID := "6281234567890@s.whatsapp.net"
	seedChannel(t, db, channelID, "owner-xyz")
	seedRemoteProjection(t, db, channelID, remoteID, channelenums.RemoteTypeUser)

	repo := NewPgRemoteRepository(db, sharedrepos.NewPgDomainEventRepository(db))
	remote, err := repo.Find(context.Background(), channelID, remoteID)
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if remote == nil {
		t.Fatal("expected remote aggregate, got nil")
	}
	if remote.RemoteID() != remoteID {
		t.Errorf("RemoteID: want %q, got %q", remoteID, remote.RemoteID())
	}
	if remote.RemoteType() != channelenums.RemoteTypeUser {
		t.Errorf("RemoteType: want user, got %q", remote.RemoteType())
	}
}

func TestPgRemoteRepository_Save_AppendsEventsAndUpserts(t *testing.T) {
	db, cleanup := newRemoteTestDB(t)
	defer cleanup()

	channelID := uuid.New()
	remoteID := "628999999999@s.whatsapp.net"
	ownerID := "owner-save-test"
	seedChannel(t, db, channelID.String(), ownerID)

	domainEventRepo := sharedrepos.NewPgDomainEventRepository(db)
	repo := NewPgRemoteRepository(db, domainEventRepo)

	// NewRemote raises a RemoteCreatedEvent.
	rem, err := entities.NewRemote(entities.NewRemoteParams{
		ChannelID:  channelID,
		RemoteID:   remoteID,
		RemoteType: channelenums.RemoteTypeUser,
		OwnerID:    ownerID,
	})
	if err != nil {
		t.Fatalf("NewRemote: %v", err)
	}

	if err := repo.Save(context.Background(), rem); err != nil {
		t.Fatalf("Save: %v", err)
	}

	// Verify domain event was persisted.
	var eventCount int
	_ = db.QueryRowContext(context.Background(),
		`SELECT count(*) FROM shared.events WHERE entity_id = $1`,
		rem.ID.String(),
	).Scan(&eventCount)
	if eventCount < 1 {
		t.Errorf("expected at least 1 domain event, got %d", eventCount)
	}

	// Verify the projection row exists.
	var dbRemoteID string
	err = db.QueryRowContext(context.Background(),
		`SELECT remote_id FROM remotes WHERE channel_id = $1 AND remote_id = $2`,
		channelID.String(), remoteID,
	).Scan(&dbRemoteID)
	if err != nil {
		t.Fatalf("verify remotes row: %v", err)
	}
	if dbRemoteID != remoteID {
		t.Errorf("remote_id in DB: want %q, got %q", remoteID, dbRemoteID)
	}
}

func TestPgRemoteRepository_Save_UpdatesInvariantsOnConflict(t *testing.T) {
	db, cleanup := newRemoteTestDB(t)
	defer cleanup()

	channelID := uuid.New()
	remoteID := "6287777777777@s.whatsapp.net"
	ownerID := "owner-update-test"
	seedChannel(t, db, channelID.String(), ownerID)

	domainEventRepo := sharedrepos.NewPgDomainEventRepository(db)
	repo := NewPgRemoteRepository(db, domainEventRepo)

	// First save.
	rem, _ := entities.NewRemote(entities.NewRemoteParams{
		ChannelID:  channelID,
		RemoteID:   remoteID,
		RemoteType: channelenums.RemoteTypeUser,
		OwnerID:    ownerID,
	})
	if err := repo.Save(context.Background(), rem); err != nil {
		t.Fatalf("first Save: %v", err)
	}

	// Load and pin.
	loaded, err := repo.Find(context.Background(), channelID.String(), remoteID)
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if err := loaded.Pin(time.Now().UTC()); err != nil {
		t.Fatalf("Pin: %v", err)
	}
	if err := repo.Save(context.Background(), loaded); err != nil {
		t.Fatalf("second Save after Pin: %v", err)
	}

	// Verify pinned_at is set.
	var pinnedAt sql.NullTime
	_ = db.QueryRowContext(context.Background(),
		`SELECT pinned_at FROM remotes WHERE channel_id = $1 AND remote_id = $2`,
		channelID.String(), remoteID,
	).Scan(&pinnedAt)
	if !pinnedAt.Valid {
		t.Error("expected pinned_at to be set after Pin")
	}
}

func TestPgRemoteRepository_DeterministicEntityID(t *testing.T) {
	db, cleanup := newRemoteTestDB(t)
	defer cleanup()

	channelID := uuid.New().String()
	remoteID := "62811111111@s.whatsapp.net"
	seedChannel(t, db, channelID, "owner-det")
	seedRemoteProjection(t, db, channelID, remoteID, channelenums.RemoteTypeUser)

	repo := NewPgRemoteRepository(db, sharedrepos.NewPgDomainEventRepository(db))

	r1, _ := repo.Find(context.Background(), channelID, remoteID)
	r2, _ := repo.Find(context.Background(), channelID, remoteID)

	if r1 == nil || r2 == nil {
		t.Fatal("expected non-nil remotes")
	}
	if r1.ID.String() != r2.ID.String() {
		t.Errorf("entity IDs differ between calls: %q vs %q", r1.ID, r2.ID)
	}
}

// makeChannelProjectionForRemote is a helper for seeding projections.Remote.
func makeChannelProjectionForRemote(channelID, remoteID string) *projections.Remote {
	now := time.Now().UTC().Truncate(time.Millisecond)
	return &projections.Remote{
		ChannelID: channelID,
		RemoteID:  remoteID,
		Type:      string(channelenums.RemoteTypeUser),
		Name:      "Test Contact",
		CreatedAt: now,
		UpdatedAt: now,
		Version:   1,
	}
}
