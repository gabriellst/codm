package channel

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"

	"template/api-go/internal/channel/entities"
	"template/api-go/internal/channel/enums"
	"template/core-go/db/sqlite"
	sharedrepos "template/core-go/repositories"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// newSqliteChannelRepo wires the repository under test over a fresh store, plus
// the SQLite domain-event repository (the real one — Save must actually write
// shared_events/shared_outbox rows for the event assertions to mean anything).
func newSqliteChannelRepo(t *testing.T) (*SqliteChannelRepository, *sqliteChannelFixture) {
	t.Helper()
	store := newChannelSqliteStore(t)
	repo := NewSqliteChannelRepository(store, sharedrepos.NewSqliteDomainEventRepository(store))
	return repo, &sqliteChannelFixture{t: t, store: store}
}

type sqliteChannelFixture struct {
	t     *testing.T
	store *sqlite.SqliteStore
}

// countEvents returns how many shared_events rows carry the given entity id.
func (f *sqliteChannelFixture) countEvents(ctx context.Context, entityID string) int {
	f.t.Helper()
	var n int
	if err := f.store.DB().QueryRowContext(ctx,
		`SELECT COUNT(*) FROM shared_events WHERE entity_id = ?`, entityID,
	).Scan(&n); err != nil {
		f.t.Fatalf("count events: %v", err)
	}
	return n
}

// makeSqliteChannelEntity builds a minimal Channel aggregate. NewChannel emits a
// ChannelCreatedEvent, so the first Save writes exactly one event row.
func makeSqliteChannelEntity(name, ownerID string) *entities.Channel {
	ch, err := entities.NewChannel(entities.NewChannelParams{
		Name:     name,
		Platform: enums.PlatformWhatsApp,
		OwnerID:  ownerID,
	})
	if err != nil {
		panic(fmt.Sprintf("makeSqliteChannelEntity: %v", err))
	}
	return ch
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

func TestSqliteChannelRepository_Find_Miss(t *testing.T) {
	repo, _ := newSqliteChannelRepo(t)

	ch, err := repo.Find(context.Background(), uuid.New().String())
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if ch != nil {
		t.Fatalf("expected nil for missing channel, got %+v", ch)
	}
}

func TestSqliteChannelRepository_Find_EmptyID(t *testing.T) {
	repo, _ := newSqliteChannelRepo(t)

	ch, err := repo.Find(context.Background(), "")
	if err != nil {
		t.Fatalf("Find empty id: %v", err)
	}
	if ch != nil {
		t.Fatalf("expected nil for empty id, got %+v", ch)
	}
}

func TestSqliteChannelRepository_SaveAndFind(t *testing.T) {
	repo, _ := newSqliteChannelRepo(t)
	ctx := context.Background()

	ent := makeSqliteChannelEntity("test-channel-save", "owner-save-001")
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
	// Timestamps round-trip through INTEGER unix-millis: assert the value came
	// back, not just that the column existed.
	if want := ent.CreatedAt.UTC().Truncate(time.Millisecond); !got.CreatedAt.Equal(want) {
		t.Errorf("CreatedAt: want %v, got %v", want, got.CreatedAt)
	}
	if string(got.Credentials) != "{}" {
		t.Errorf("Credentials: want %q, got %q", "{}", string(got.Credentials))
	}
}

func TestSqliteChannelRepository_Save_EmitsEvents(t *testing.T) {
	repo, fx := newSqliteChannelRepo(t)
	ctx := context.Background()

	ent := makeSqliteChannelEntity("test-channel-events", "owner-events-001")
	if err := repo.Save(ctx, ent); err != nil {
		t.Fatalf("Save: %v", err)
	}
	if got := fx.countEvents(ctx, ent.ID.String()); got != 1 {
		t.Errorf("expected 1 event after first Save, got %d", got)
	}

	// SetConnected raises a second event.
	ent.SetConnected("1234567890@s.whatsapp.net")
	if err := repo.Save(ctx, ent); err != nil {
		t.Fatalf("Save (connected): %v", err)
	}
	if got := fx.countEvents(ctx, ent.ID.String()); got != 2 {
		t.Errorf("expected 2 events after SetConnected + Save, got %d", got)
	}
}

func TestSqliteChannelRepository_Save_UpdateBumpsVersion(t *testing.T) {
	repo, _ := newSqliteChannelRepo(t)
	ctx := context.Background()

	ent := makeSqliteChannelEntity("test-channel-version", "owner-ver-001")
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

func TestSqliteChannelRepository_FindByName_Hit(t *testing.T) {
	repo, _ := newSqliteChannelRepo(t)
	ctx := context.Background()

	ent := makeSqliteChannelEntity("my-named-channel", "owner-name-001")
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

func TestSqliteChannelRepository_FindByName_Miss(t *testing.T) {
	repo, _ := newSqliteChannelRepo(t)

	got, err := repo.FindByName(context.Background(), "nonexistent-channel")
	if err != nil {
		t.Fatalf("FindByName: %v", err)
	}
	if got != nil {
		t.Fatalf("expected nil for missing name, got %+v", got)
	}
}

func TestSqliteChannelRepository_FindByName_DeletedIsNil(t *testing.T) {
	repo, _ := newSqliteChannelRepo(t)
	ctx := context.Background()

	ent := makeSqliteChannelEntity("to-be-deleted", "owner-del-001")
	if err := repo.Save(ctx, ent); err != nil {
		t.Fatalf("Save: %v", err)
	}
	if err := repo.Delete(ctx, ent.ID.String()); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	got, err := repo.FindByName(ctx, "to-be-deleted")
	if err != nil {
		t.Fatalf("FindByName after delete: %v", err)
	}
	if got != nil {
		t.Fatalf("expected nil after delete, got %+v", got)
	}
}

// A channel whose status IS the DELETED sentinel must be invisible to
// FindByName / FindByOwnerAndPlatform even though the row still exists — this is
// the `status != ?` half of those queries, which the delete-the-row test cannot
// exercise.
func TestSqliteChannelRepository_FindByName_DeletedStatusIsNil(t *testing.T) {
	repo, _ := newSqliteChannelRepo(t)
	ctx := context.Background()

	ent := makeSqliteChannelEntity("soft-deleted-channel", "owner-softdel-001")
	if err := repo.Save(ctx, ent); err != nil {
		t.Fatalf("Save: %v", err)
	}

	ent.Status = enums.ChannelStatusDeleted
	if err := repo.Save(ctx, ent); err != nil {
		t.Fatalf("Save (deleted status): %v", err)
	}

	byName, err := repo.FindByName(ctx, "soft-deleted-channel")
	if err != nil {
		t.Fatalf("FindByName: %v", err)
	}
	if byName != nil {
		t.Errorf("expected nil for DELETED status, got %+v", byName)
	}

	byOwner, err := repo.FindByOwnerAndPlatform(ctx, "owner-softdel-001", string(enums.PlatformWhatsApp))
	if err != nil {
		t.Fatalf("FindByOwnerAndPlatform: %v", err)
	}
	if byOwner != nil {
		t.Errorf("expected nil for DELETED status, got %+v", byOwner)
	}

	// Find by id still resolves it — no status filter there.
	byID, err := repo.Find(ctx, ent.ID.String())
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if byID == nil {
		t.Fatal("Find by id must still return a DELETED channel")
	}
}

func TestSqliteChannelRepository_FindByOwnerAndPlatform(t *testing.T) {
	repo, _ := newSqliteChannelRepo(t)
	ctx := context.Background()

	ownerID := "owner-oap-" + uuid.New().String()[:4]
	ent := makeSqliteChannelEntity("oap-channel", ownerID)
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

// FindByOwnerAndPlatform returns the MOST RECENTLY CREATED match — the
// ORDER BY created_at DESC LIMIT 1 tail of the query.
func TestSqliteChannelRepository_FindByOwnerAndPlatform_PicksNewest(t *testing.T) {
	repo, _ := newSqliteChannelRepo(t)
	ctx := context.Background()

	ownerID := "owner-newest-" + uuid.New().String()[:4]
	base := time.Now().UTC()

	older := makeSqliteChannelEntity("older-channel", ownerID)
	older.CreatedAt = base
	if err := repo.Save(ctx, older); err != nil {
		t.Fatalf("Save older: %v", err)
	}
	newer := makeSqliteChannelEntity("newer-channel", ownerID)
	newer.CreatedAt = base.Add(5 * time.Millisecond)
	if err := repo.Save(ctx, newer); err != nil {
		t.Fatalf("Save newer: %v", err)
	}

	got, err := repo.FindByOwnerAndPlatform(ctx, ownerID, "WHATSAPP")
	if err != nil {
		t.Fatalf("FindByOwnerAndPlatform: %v", err)
	}
	if got == nil {
		t.Fatal("expected channel, got nil")
	}
	if got.ID.String() != newer.ID.String() {
		t.Errorf("expected the newest channel %q, got %q", newer.Name, got.Name)
	}
}

func TestSqliteChannelRepository_FindByOwnerAndPlatform_Miss(t *testing.T) {
	repo, _ := newSqliteChannelRepo(t)

	got, err := repo.FindByOwnerAndPlatform(context.Background(), "nonexistent-owner", "WHATSAPP")
	if err != nil {
		t.Fatalf("FindByOwnerAndPlatform: %v", err)
	}
	if got != nil {
		t.Fatalf("expected nil, got %+v", got)
	}
}

func TestSqliteChannelRepository_Delete_NoOp(t *testing.T) {
	repo, _ := newSqliteChannelRepo(t)

	if err := repo.Delete(context.Background(), uuid.New().String()); err != nil {
		t.Fatalf("Delete non-existent: %v", err)
	}
}

func TestSqliteChannelRepository_Delete_RemovesRow(t *testing.T) {
	repo, _ := newSqliteChannelRepo(t)
	ctx := context.Background()

	ent := makeSqliteChannelEntity("del-row-channel", "owner-delrow-001")
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

func TestSqliteChannelRepository_FindAll_PaginationAndCount(t *testing.T) {
	repo, _ := newSqliteChannelRepo(t)
	ctx := context.Background()

	ownerID := "owner-all-" + uuid.New().String()[:4]

	// Distinct created_at values guarantee stable DESC ordering without sleeping.
	// Millisecond spacing is the resolution the SQLite column stores.
	base := time.Now().UTC()
	for i := 0; i < 5; i++ {
		ent := makeSqliteChannelEntity(fmt.Sprintf("findall-channel-%d-%s", i, uuid.New().String()[:4]), ownerID)
		ent.CreatedAt = base.Add(time.Duration(i) * time.Millisecond)
		if err := repo.Save(ctx, ent); err != nil {
			t.Fatalf("Save %d: %v", i, err)
		}
	}

	// A channel for a different owner must not leak into the results.
	other := makeSqliteChannelEntity("other-owner-ch", "other-owner-"+uuid.New().String()[:4])
	if err := repo.Save(ctx, other); err != nil {
		t.Fatalf("Save other owner: %v", err)
	}

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

	// Pages must not overlap — proves LIMIT/OFFSET bound in the right order.
	seen := map[string]bool{}
	for _, ch := range append(append([]*entities.Channel{}, page1...), page2...) {
		if seen[ch.ID.String()] {
			t.Errorf("channel %q appears on both pages", ch.Name)
		}
		seen[ch.ID.String()] = true
	}
}

func TestSqliteChannelRepository_FindAll_ExcludesDeleted(t *testing.T) {
	repo, _ := newSqliteChannelRepo(t)
	ctx := context.Background()

	ownerID := "owner-excldel-" + uuid.New().String()[:4]

	var toDelete *entities.Channel
	for i := 0; i < 4; i++ {
		ent := makeSqliteChannelEntity(fmt.Sprintf("excldel-ch-%d-%s", i, uuid.New().String()[:4]), ownerID)
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

func TestSqliteChannelRepository_FindAll_Empty(t *testing.T) {
	repo, _ := newSqliteChannelRepo(t)

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

// FindAllActive is the startup reconnect query: CONNECTED/CONNECTING only, and
// only channels that actually carry a stored session (owner_remote_id != ”).
func TestSqliteChannelRepository_FindAllActive(t *testing.T) {
	repo, _ := newSqliteChannelRepo(t)
	ctx := context.Background()

	// CONNECTED with a session — must appear.
	connected := makeSqliteChannelEntity("active-connected", "owner-active")
	connected.SetConnected("111@s.whatsapp.net")
	if err := repo.Save(ctx, connected); err != nil {
		t.Fatalf("Save connected: %v", err)
	}

	// CONNECTING with a session — must appear.
	connecting := makeSqliteChannelEntity("active-connecting", "owner-active")
	connecting.SetConnected("222@s.whatsapp.net")
	connecting.SetConnecting()
	if err := repo.Save(ctx, connecting); err != nil {
		t.Fatalf("Save connecting: %v", err)
	}

	// CONNECTED but no stored session — excluded by owner_remote_id != ''.
	noSession := makeSqliteChannelEntity("active-nosession", "owner-active")
	noSession.SetConnected("")
	if err := repo.Save(ctx, noSession); err != nil {
		t.Fatalf("Save no-session: %v", err)
	}

	// CREATED — excluded by the status filter.
	created := makeSqliteChannelEntity("active-created", "owner-active")
	if err := repo.Save(ctx, created); err != nil {
		t.Fatalf("Save created: %v", err)
	}

	got, err := repo.FindAllActive(ctx)
	if err != nil {
		t.Fatalf("FindAllActive: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 active channels, got %d", len(got))
	}
	names := map[string]bool{}
	for _, ch := range got {
		names[ch.Name] = true
	}
	if !names["active-connected"] || !names["active-connecting"] {
		t.Errorf("unexpected active set: %v", names)
	}
}
