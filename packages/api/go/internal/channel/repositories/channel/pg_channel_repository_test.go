package instance

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"

	"template/api-go/internal/channel/entities"
	"template/api-go/internal/channel/enums"
	sharedenums "template/api-go/internal/shared/enums"
	sharedrepos "template/api-go/internal/shared/repositories"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// makeChannelEntity builds a minimal Channel aggregate for testing.
// NewChannel emits a ChannelCreatedEvent, so Save will write one event row.
func makeChannelEntity(name, ownerID string) *entities.Channel {
	ch, err := entities.NewChannel(entities.NewChannelParams{
		Name:     name,
		Platform: sharedenums.Platform("WHATSAPP"),
		OwnerID:  ownerID,
	})
	if err != nil {
		panic(fmt.Sprintf("makeChannelEntity: %v", err))
	}
	return ch
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

func TestPgChannelRepository_Find_Miss(t *testing.T) {
	db, cleanup := newChannelTestDB(t)
	defer cleanup()

	domainRepo := sharedrepos.NewPgDomainEventRepository(db)
	repo := NewPgChannelRepository(db, domainRepo)

	ch, err := repo.Find(context.Background(), uuid.New().String())
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if ch != nil {
		t.Fatalf("expected nil for missing channel, got %+v", ch)
	}
}

func TestPgChannelRepository_Find_EmptyID(t *testing.T) {
	db, cleanup := newChannelTestDB(t)
	defer cleanup()

	domainRepo := sharedrepos.NewPgDomainEventRepository(db)
	repo := NewPgChannelRepository(db, domainRepo)

	ch, err := repo.Find(context.Background(), "")
	if err != nil {
		t.Fatalf("Find empty id: %v", err)
	}
	if ch != nil {
		t.Fatalf("expected nil for empty id, got %+v", ch)
	}
}

func TestPgChannelRepository_SaveAndFind(t *testing.T) {
	db, cleanup := newChannelTestDB(t)
	defer cleanup()

	domainRepo := sharedrepos.NewPgDomainEventRepository(db)
	repo := NewPgChannelRepository(db, domainRepo)
	ctx := context.Background()

	ent := makeChannelEntity("test-channel-save", "owner-save-001")

	if err := repo.Save(ctx, ent); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got, err := repo.Find(ctx, ent.ID.String())
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if got == nil {
		t.Fatal("expected channel, got nil")
	}
	if got.ID.String() != ent.ID.String() {
		t.Errorf("ID: want %q, got %q", ent.ID.String(), got.ID.String())
	}
	if got.Name != ent.Name {
		t.Errorf("Name: want %q, got %q", ent.Name, got.Name)
	}
	if got.OwnerID != ent.OwnerID {
		t.Errorf("OwnerID: want %q, got %q", ent.OwnerID, got.OwnerID)
	}
	if got.Platform != ent.Platform {
		t.Errorf("Platform: want %q, got %q", ent.Platform, got.Platform)
	}
	if got.Status != enums.ChannelStatusCreated {
		t.Errorf("Status: want CREATED, got %q", got.Status)
	}
}

func TestPgChannelRepository_Save_EmitsEvents(t *testing.T) {
	db, cleanup := newChannelTestDB(t)
	defer cleanup()

	domainRepo := sharedrepos.NewPgDomainEventRepository(db)
	repo := NewPgChannelRepository(db, domainRepo)
	ctx := context.Background()

	ent := makeChannelEntity("test-channel-events", "owner-events-001")

	// NewChannel emits exactly one ChannelCreatedEvent.
	if err := repo.Save(ctx, ent); err != nil {
		t.Fatalf("Save: %v", err)
	}

	var eventCount int
	if err := db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM shared.events WHERE entity_id = $1`,
		ent.ID.String(),
	).Scan(&eventCount); err != nil {
		t.Fatalf("count events: %v", err)
	}
	if eventCount != 1 {
		t.Errorf("expected 1 event after first Save, got %d", eventCount)
	}

	// Calling SetConnected raises a second event.
	ent.SetConnected("1234567890@s.whatsapp.net")
	if err := repo.Save(ctx, ent); err != nil {
		t.Fatalf("Save (connected): %v", err)
	}

	if err := db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM shared.events WHERE entity_id = $1`,
		ent.ID.String(),
	).Scan(&eventCount); err != nil {
		t.Fatalf("count events after update: %v", err)
	}
	if eventCount != 2 {
		t.Errorf("expected 2 events after SetConnected + Save, got %d", eventCount)
	}
}

func TestPgChannelRepository_Save_UpdateBumpsVersion(t *testing.T) {
	db, cleanup := newChannelTestDB(t)
	defer cleanup()

	domainRepo := sharedrepos.NewPgDomainEventRepository(db)
	repo := NewPgChannelRepository(db, domainRepo)
	ctx := context.Background()

	ent := makeChannelEntity("test-channel-version", "owner-ver-001")
	if err := repo.Save(ctx, ent); err != nil {
		t.Fatalf("initial Save: %v", err)
	}

	v1, err := repo.Find(ctx, ent.ID.String())
	if err != nil || v1 == nil {
		t.Fatalf("Find after first save: %v, %v", v1, err)
	}

	ent.SetConnected("jid@s.whatsapp.net")
	if err := repo.Save(ctx, ent); err != nil {
		t.Fatalf("second Save: %v", err)
	}

	v2, err := repo.Find(ctx, ent.ID.String())
	if err != nil || v2 == nil {
		t.Fatalf("Find after second save: %v, %v", v2, err)
	}

	if v2.Version <= v1.Version {
		t.Errorf("version should increase: before=%d after=%d", v1.Version, v2.Version)
	}
	if v2.Status != enums.ChannelStatusConnected {
		t.Errorf("status after SetConnected: want CONNECTED, got %q", v2.Status)
	}
	if v2.OwnerRemoteID != "jid@s.whatsapp.net" {
		t.Errorf("OwnerRemoteID: want %q, got %q", "jid@s.whatsapp.net", v2.OwnerRemoteID)
	}
}

func TestPgChannelRepository_FindByName_Hit(t *testing.T) {
	db, cleanup := newChannelTestDB(t)
	defer cleanup()

	domainRepo := sharedrepos.NewPgDomainEventRepository(db)
	repo := NewPgChannelRepository(db, domainRepo)
	ctx := context.Background()

	ent := makeChannelEntity("my-named-channel", "owner-name-001")
	if err := repo.Save(ctx, ent); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got, err := repo.FindByName(ctx, "my-named-channel")
	if err != nil {
		t.Fatalf("FindByName: %v", err)
	}
	if got == nil {
		t.Fatal("expected channel, got nil")
	}
	if got.Name != "my-named-channel" {
		t.Errorf("Name: want %q, got %q", "my-named-channel", got.Name)
	}
}

func TestPgChannelRepository_FindByName_Miss(t *testing.T) {
	db, cleanup := newChannelTestDB(t)
	defer cleanup()

	domainRepo := sharedrepos.NewPgDomainEventRepository(db)
	repo := NewPgChannelRepository(db, domainRepo)

	got, err := repo.FindByName(context.Background(), "nonexistent-channel")
	if err != nil {
		t.Fatalf("FindByName: %v", err)
	}
	if got != nil {
		t.Fatalf("expected nil for missing name, got %+v", got)
	}
}

func TestPgChannelRepository_FindByName_DeletedIsNil(t *testing.T) {
	db, cleanup := newChannelTestDB(t)
	defer cleanup()

	domainRepo := sharedrepos.NewPgDomainEventRepository(db)
	repo := NewPgChannelRepository(db, domainRepo)
	ctx := context.Background()

	ent := makeChannelEntity("to-be-deleted", "owner-del-001")
	if err := repo.Save(ctx, ent); err != nil {
		t.Fatalf("Save: %v", err)
	}
	if err := repo.Delete(ctx, ent.ID.String()); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	// After Delete the row is gone, so FindByName should return nil.
	got, err := repo.FindByName(ctx, "to-be-deleted")
	if err != nil {
		t.Fatalf("FindByName after delete: %v", err)
	}
	if got != nil {
		t.Fatalf("expected nil after delete, got %+v", got)
	}
}

func TestPgChannelRepository_FindByOwnerAndPlatform(t *testing.T) {
	db, cleanup := newChannelTestDB(t)
	defer cleanup()

	domainRepo := sharedrepos.NewPgDomainEventRepository(db)
	repo := NewPgChannelRepository(db, domainRepo)
	ctx := context.Background()

	ownerID := "owner-oap-" + uuid.New().String()[:4]
	ent := makeChannelEntity("oap-channel", ownerID)
	if err := repo.Save(ctx, ent); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got, err := repo.FindByOwnerAndPlatform(ctx, ownerID, "WHATSAPP")
	if err != nil {
		t.Fatalf("FindByOwnerAndPlatform: %v", err)
	}
	if got == nil {
		t.Fatal("expected channel, got nil")
	}
	if got.OwnerID != ownerID {
		t.Errorf("OwnerID: want %q, got %q", ownerID, got.OwnerID)
	}
}

func TestPgChannelRepository_FindByOwnerAndPlatform_Miss(t *testing.T) {
	db, cleanup := newChannelTestDB(t)
	defer cleanup()

	domainRepo := sharedrepos.NewPgDomainEventRepository(db)
	repo := NewPgChannelRepository(db, domainRepo)

	got, err := repo.FindByOwnerAndPlatform(context.Background(), "nonexistent-owner", "WHATSAPP")
	if err != nil {
		t.Fatalf("FindByOwnerAndPlatform: %v", err)
	}
	if got != nil {
		t.Fatalf("expected nil, got %+v", got)
	}
}

func TestPgChannelRepository_Delete_NoOp(t *testing.T) {
	db, cleanup := newChannelTestDB(t)
	defer cleanup()

	domainRepo := sharedrepos.NewPgDomainEventRepository(db)
	repo := NewPgChannelRepository(db, domainRepo)

	// Deleting a non-existent channel must not error.
	if err := repo.Delete(context.Background(), uuid.New().String()); err != nil {
		t.Fatalf("Delete non-existent: %v", err)
	}
}

func TestPgChannelRepository_Delete_RemovesRow(t *testing.T) {
	db, cleanup := newChannelTestDB(t)
	defer cleanup()

	domainRepo := sharedrepos.NewPgDomainEventRepository(db)
	repo := NewPgChannelRepository(db, domainRepo)
	ctx := context.Background()

	ent := makeChannelEntity("del-row-channel", "owner-delrow-001")
	if err := repo.Save(ctx, ent); err != nil {
		t.Fatalf("Save: %v", err)
	}
	if err := repo.Delete(ctx, ent.ID.String()); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	got, err := repo.Find(ctx, ent.ID.String())
	if err != nil {
		t.Fatalf("Find after delete: %v", err)
	}
	if got != nil {
		t.Fatalf("expected nil after delete, got %+v", got)
	}
}

func TestPgChannelRepository_FindAll_PaginationAndCount(t *testing.T) {
	db, cleanup := newChannelTestDB(t)
	defer cleanup()

	domainRepo := sharedrepos.NewPgDomainEventRepository(db)
	repo := NewPgChannelRepository(db, domainRepo)
	ctx := context.Background()

	ownerID := "owner-all-" + uuid.New().String()[:4]

	// Insert 5 channels for this owner.
	// Pre-compute distinct created_at timestamps to guarantee stable ordering
	// without relying on time.Sleep.
	base := time.Now().UTC()
	for i := 0; i < 5; i++ {
		name := fmt.Sprintf("findall-channel-%d-%s", i, uuid.New().String()[:4])
		ent := makeChannelEntity(name, ownerID)
		ent.CreatedAt = base.Add(time.Duration(i) * time.Millisecond)
		if err := repo.Save(ctx, ent); err != nil {
			t.Fatalf("Save %d: %v", i, err)
		}
	}

	// Insert 1 channel for a different owner — must not appear in results.
	other := makeChannelEntity("other-owner-ch", "other-owner-"+uuid.New().String()[:4])
	if err := repo.Save(ctx, other); err != nil {
		t.Fatalf("Save other owner: %v", err)
	}

	// Page 1: first 3.
	page1, total, err := repo.FindAll(ctx, ownerID, 3, 0)
	if err != nil {
		t.Fatalf("FindAll page 1: %v", err)
	}
	if total != 5 {
		t.Errorf("total: want 5, got %d", total)
	}
	if len(page1) != 3 {
		t.Errorf("page 1 len: want 3, got %d", len(page1))
	}
	for _, ch := range page1 {
		if ch.OwnerID != ownerID {
			t.Errorf("unexpected ownerID %q in page 1", ch.OwnerID)
		}
	}

	// Page 2: remaining 2.
	page2, total2, err := repo.FindAll(ctx, ownerID, 3, 3)
	if err != nil {
		t.Fatalf("FindAll page 2: %v", err)
	}
	if total2 != 5 {
		t.Errorf("total page 2: want 5, got %d", total2)
	}
	if len(page2) != 2 {
		t.Errorf("page 2 len: want 2, got %d", len(page2))
	}
}

func TestPgChannelRepository_FindAll_ExcludesDeleted(t *testing.T) {
	db, cleanup := newChannelTestDB(t)
	defer cleanup()

	domainRepo := sharedrepos.NewPgDomainEventRepository(db)
	repo := NewPgChannelRepository(db, domainRepo)
	ctx := context.Background()

	ownerID := "owner-excldel-" + uuid.New().String()[:4]

	// Insert 3 live + 1 that gets deleted.
	var toDelete *entities.Channel
	for i := 0; i < 4; i++ {
		name := fmt.Sprintf("excldel-ch-%d-%s", i, uuid.New().String()[:4])
		ent := makeChannelEntity(name, ownerID)
		if err := repo.Save(ctx, ent); err != nil {
			t.Fatalf("Save %d: %v", i, err)
		}
		if i == 3 {
			toDelete = ent
		}
	}
	if err := repo.Delete(ctx, toDelete.ID.String()); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	all, total, err := repo.FindAll(ctx, ownerID, 10, 0)
	if err != nil {
		t.Fatalf("FindAll: %v", err)
	}
	if total != 3 {
		t.Errorf("total: want 3 (deleted excluded), got %d", total)
	}
	if len(all) != 3 {
		t.Errorf("len: want 3, got %d", len(all))
	}
	for _, ch := range all {
		if ch.ID.String() == toDelete.ID.String() {
			t.Error("deleted channel should not appear in FindAll results")
		}
	}
}

func TestPgChannelRepository_FindAll_Empty(t *testing.T) {
	db, cleanup := newChannelTestDB(t)
	defer cleanup()

	domainRepo := sharedrepos.NewPgDomainEventRepository(db)
	repo := NewPgChannelRepository(db, domainRepo)

	items, total, err := repo.FindAll(context.Background(), "nonexistent-owner", 10, 0)
	if err != nil {
		t.Fatalf("FindAll empty: %v", err)
	}
	if total != 0 {
		t.Errorf("total: want 0, got %d", total)
	}
	if len(items) != 0 {
		t.Errorf("len: want 0, got %d", len(items))
	}
}
