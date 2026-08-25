package remote

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/google/uuid"

	"template/api-go/internal/channel/entities"
	channelenums "template/api-go/internal/channel/enums"
	sharedrepos "template/core-go/repositories"
)

// ---------------------------------------------------------------------------
// Tests — SqliteRemoteRepository (write side of the Remote aggregate)
// ---------------------------------------------------------------------------

func TestSqliteRemoteRepository_Find_Miss(t *testing.T) {
	store := newRemoteSqliteStore(t)
	repo := NewSqliteRemoteRepository(store, sharedrepos.NewSqliteDomainEventRepository(store, "gateway"))

	remote, err := repo.Find(context.Background(), uuid.New().String(), "nonexistent@s.whatsapp.net")
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if remote != nil {
		t.Fatalf("expected nil for missing remote, got %+v", remote)
	}
}

func TestSqliteRemoteRepository_Find_Hit(t *testing.T) {
	store := newRemoteSqliteStore(t)
	ctx := context.Background()

	channelID := uuid.New().String()
	remoteID := "6281234567890@s.whatsapp.net"
	seedSqliteChannel(t, store, channelID, "owner-xyz")
	seedSqliteRemote(t, store, channelID, remoteID, channelenums.RemoteTypeUser)

	repo := NewSqliteRemoteRepository(store, sharedrepos.NewSqliteDomainEventRepository(store, "gateway"))
	remote, err := repo.Find(ctx, channelID, remoteID)
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
		t.Errorf("RemoteType: want USER, got %q", remote.RemoteType())
	}
	// owner_id is not denormalized onto gateway_remotes — it must arrive through
	// the LEFT JOIN onto gateway_channels.
	if remote.OwnerID() != "owner-xyz" {
		t.Errorf("OwnerID: want %q (joined from gateway_channels), got %q", "owner-xyz", remote.OwnerID())
	}
	// Booleans are INTEGER 0/1 in SQLite; a defaulted row must read back false.
	if remote.Archived() || remote.MarkedAsUnread() {
		t.Errorf("expected archived/marked_as_unread false, got %v/%v", remote.Archived(), remote.MarkedAsUnread())
	}
	if remote.PinnedAt() != nil || remote.DeletedAt() != nil || remote.MuteExpiration() != nil {
		t.Error("expected nullable timestamps to be nil on a fresh row")
	}
}

// A remote whose channel row is missing still resolves — COALESCE(c.owner_id, ”)
// keeps the LEFT JOIN from turning a projector-created orphan into a 404.
func TestSqliteRemoteRepository_Find_MissingChannelYieldsEmptyOwner(t *testing.T) {
	store := newRemoteSqliteStore(t)

	channelID := uuid.New().String()
	remoteID := "628000@s.whatsapp.net"
	seedSqliteRemote(t, store, channelID, remoteID, channelenums.RemoteTypeUser)

	repo := NewSqliteRemoteRepository(store, sharedrepos.NewSqliteDomainEventRepository(store, "gateway"))
	remote, err := repo.Find(context.Background(), channelID, remoteID)
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if remote == nil {
		t.Fatal("expected remote aggregate even without a channel row")
	}
	if remote.OwnerID() != "" {
		t.Errorf("OwnerID: want empty, got %q", remote.OwnerID())
	}
}

func TestSqliteRemoteRepository_Save_AppendsEventsAndUpserts(t *testing.T) {
	store := newRemoteSqliteStore(t)
	ctx := context.Background()

	channelID := uuid.New()
	remoteID := "628999999999@s.whatsapp.net"
	ownerID := "owner-save-test"
	seedSqliteChannel(t, store, channelID.String(), ownerID)

	repo := NewSqliteRemoteRepository(store, sharedrepos.NewSqliteDomainEventRepository(store, "gateway"))

	// Platform is mandatory here (the pg test omitted it): gateway_remotes CHECKs
	// platform IN ('WHATSAPP','INTERNAL'), so an empty value is rejected.
	rem, err := entities.NewRemote(entities.NewRemoteParams{
		ChannelID:  channelID,
		RemoteID:   remoteID,
		RemoteType: channelenums.RemoteTypeUser,
		OwnerID:    ownerID,
		Platform:   channelenums.PlatformWhatsApp,
	})
	if err != nil {
		t.Fatalf("NewRemote: %v", err)
	}
	if err := repo.Save(ctx, rem); err != nil {
		t.Fatalf("Save: %v", err)
	}

	var eventCount int
	if err := store.DB().QueryRowContext(ctx,
		`SELECT COUNT(*) FROM shared_events WHERE entity_id = ?`, rem.ID.String(),
	).Scan(&eventCount); err != nil {
		t.Fatalf("count events: %v", err)
	}
	if eventCount != 1 {
		t.Errorf("expected 1 domain event, got %d", eventCount)
	}

	var dbRemoteID string
	if err := store.DB().QueryRowContext(ctx,
		`SELECT remote_id FROM gateway_remotes WHERE channel_id = ? AND remote_id = ?`,
		channelID.String(), remoteID,
	).Scan(&dbRemoteID); err != nil {
		t.Fatalf("verify gateway_remotes row: %v", err)
	}
	if dbRemoteID != remoteID {
		t.Errorf("remote_id in DB: want %q, got %q", remoteID, dbRemoteID)
	}
}

func TestSqliteRemoteRepository_Save_UpdatesInvariantsOnConflict(t *testing.T) {
	store := newRemoteSqliteStore(t)
	ctx := context.Background()

	channelID := uuid.New()
	remoteID := "6287777777777@s.whatsapp.net"
	ownerID := "owner-update-test"
	seedSqliteChannel(t, store, channelID.String(), ownerID)

	repo := NewSqliteRemoteRepository(store, sharedrepos.NewSqliteDomainEventRepository(store, "gateway"))

	rem, err := entities.NewRemote(entities.NewRemoteParams{
		ChannelID:  channelID,
		RemoteID:   remoteID,
		RemoteType: channelenums.RemoteTypeUser,
		OwnerID:    ownerID,
		Platform:   channelenums.PlatformWhatsApp,
	})
	if err != nil {
		t.Fatalf("NewRemote: %v", err)
	}
	if err := repo.Save(ctx, rem); err != nil {
		t.Fatalf("first Save: %v", err)
	}

	loaded, err := repo.Find(ctx, channelID.String(), remoteID)
	if err != nil || loaded == nil {
		t.Fatalf("Find: err=%v remote=%v", err, loaded)
	}
	pinAt := time.Now().UTC().Truncate(time.Millisecond)
	if err := loaded.Pin(pinAt); err != nil {
		t.Fatalf("Pin: %v", err)
	}
	if err := repo.Save(ctx, loaded); err != nil {
		t.Fatalf("second Save after Pin: %v", err)
	}

	var pinnedAt sql.NullInt64
	var version int64
	if err := store.DB().QueryRowContext(ctx,
		`SELECT pinned_at, version FROM gateway_remotes WHERE channel_id = ? AND remote_id = ?`,
		channelID.String(), remoteID,
	).Scan(&pinnedAt, &version); err != nil {
		t.Fatalf("read row: %v", err)
	}
	if !pinnedAt.Valid {
		t.Fatal("expected pinned_at to be set after Pin")
	}
	if pinnedAt.Int64 != pinAt.UnixMilli() {
		t.Errorf("pinned_at: want %d, got %d", pinAt.UnixMilli(), pinnedAt.Int64)
	}
	if version != 2 {
		t.Errorf("version after conflicting Save: want 2, got %d", version)
	}
}

// The aggregate Save must not clobber projection-owned columns: `name` is bound
// as ” on insert and left untouched on conflict.
func TestSqliteRemoteRepository_Save_PreservesProjectionName(t *testing.T) {
	store := newRemoteSqliteStore(t)
	ctx := context.Background()

	channelID := uuid.New()
	remoteID := "628123123123@s.whatsapp.net"
	seedSqliteChannel(t, store, channelID.String(), "owner-name-preserve")

	// A projector wrote the display name first.
	projRepo := NewSqliteRemoteProjectionRepository(store)
	proj := makeSqliteRemoteProjection(channelID.String(), remoteID, channelenums.RemoteTypeUser)
	proj.Name = "Alice Cooper"
	if err := projRepo.Save(ctx, proj); err != nil {
		t.Fatalf("projection Save: %v", err)
	}

	repo := NewSqliteRemoteRepository(store, sharedrepos.NewSqliteDomainEventRepository(store, "gateway"))
	rem, err := repo.Find(ctx, channelID.String(), remoteID)
	if err != nil || rem == nil {
		t.Fatalf("Find: err=%v remote=%v", err, rem)
	}
	if err := rem.Archive(); err != nil {
		t.Fatalf("Archive: %v", err)
	}
	if err := repo.Save(ctx, rem); err != nil {
		t.Fatalf("Save: %v", err)
	}

	after, err := projRepo.Find(ctx, channelID.String(), remoteID)
	if err != nil || after == nil {
		t.Fatalf("projection Find: err=%v remote=%v", err, after)
	}
	if after.Name != "Alice Cooper" {
		t.Errorf("aggregate Save clobbered the projection name: got %q", after.Name)
	}
	if !after.Archived {
		t.Error("expected archived=true after Archive + Save")
	}
}

func TestSqliteRemoteRepository_DeterministicEntityID(t *testing.T) {
	store := newRemoteSqliteStore(t)
	ctx := context.Background()

	channelID := uuid.New().String()
	remoteID := "62811111111@s.whatsapp.net"
	seedSqliteChannel(t, store, channelID, "owner-det")
	seedSqliteRemote(t, store, channelID, remoteID, channelenums.RemoteTypeUser)

	repo := NewSqliteRemoteRepository(store, sharedrepos.NewSqliteDomainEventRepository(store, "gateway"))

	r1, err := repo.Find(ctx, channelID, remoteID)
	if err != nil {
		t.Fatalf("Find r1: %v", err)
	}
	r2, err := repo.Find(ctx, channelID, remoteID)
	if err != nil {
		t.Fatalf("Find r2: %v", err)
	}
	if r1 == nil || r2 == nil {
		t.Fatal("expected non-nil remotes")
	}
	if r1.ID.String() != r2.ID.String() {
		t.Errorf("entity IDs differ between calls: %q vs %q", r1.ID, r2.ID)
	}
}
