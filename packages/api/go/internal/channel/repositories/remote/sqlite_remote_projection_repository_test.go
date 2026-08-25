package remote

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	channelenums "template/api-go/internal/channel/enums"
	"template/api-go/internal/channel/projections"
	"template/core-go/db/sqlite"
)

// newSqliteRemoteProjectionRepo is the common fixture: a fresh store plus the
// repository under test.
func newSqliteRemoteProjectionRepo(t *testing.T) (*SqliteRemoteProjectionRepository, *sqlite.SqliteStore) {
	t.Helper()
	store := newRemoteSqliteStore(t)
	return NewSqliteRemoteProjectionRepository(store), store
}

// ---------------------------------------------------------------------------
// Reads / whole-row writes
// ---------------------------------------------------------------------------

func TestSqliteRemoteProjectionRepository_Find_Miss(t *testing.T) {
	repo, _ := newSqliteRemoteProjectionRepo(t)

	rem, err := repo.Find(context.Background(), uuid.New().String(), "nobody@s.whatsapp.net")
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if rem != nil {
		t.Fatalf("expected nil for missing remote, got %+v", rem)
	}
}

func TestSqliteRemoteProjectionRepository_SaveAndFind(t *testing.T) {
	repo, _ := newSqliteRemoteProjectionRepo(t)
	ctx := context.Background()

	channelID := uuid.New().String()
	remoteID := "6281234@s.whatsapp.net"
	pinned := time.Now().UTC().Truncate(time.Millisecond)
	muted := pinned.Add(time.Hour)

	proj := makeSqliteRemoteProjection(channelID, remoteID, channelenums.RemoteTypeUser)
	proj.IsBlocked = true
	proj.MarkedAsUnread = true
	proj.Archived = true
	proj.UnreadMessageCount = 7
	proj.PinnedAt = &pinned
	proj.MuteExpiration = &muted

	if err := repo.Save(ctx, proj); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got, err := repo.Find(ctx, channelID, remoteID)
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if got == nil {
		t.Fatal("expected remote projection, got nil")
	}
	if got.RemoteID != remoteID {
		t.Errorf("RemoteID: want %q, got %q", remoteID, got.RemoteID)
	}
	if got.Name != proj.Name {
		t.Errorf("Name: want %q, got %q", proj.Name, got.Name)
	}
	if got.AvatarURL != proj.AvatarURL {
		t.Errorf("AvatarURL: want %q, got %q", proj.AvatarURL, got.AvatarURL)
	}
	if got.Platform != proj.Platform {
		t.Errorf("Platform: want %q, got %q", proj.Platform, got.Platform)
	}
	// Every boolean crosses the Go bool <-> INTEGER 0/1 boundary.
	if !got.IsBlocked || !got.MarkedAsUnread || !got.Archived {
		t.Errorf("booleans lost in round-trip: blocked=%v unread=%v archived=%v",
			got.IsBlocked, got.MarkedAsUnread, got.Archived)
	}
	if got.UnreadMessageCount != 7 {
		t.Errorf("UnreadMessageCount: want 7, got %d", got.UnreadMessageCount)
	}
	if got.PinnedAt == nil || !got.PinnedAt.Equal(pinned) {
		t.Errorf("PinnedAt: want %v, got %v", pinned, got.PinnedAt)
	}
	if got.MuteExpiration == nil || !got.MuteExpiration.Equal(muted) {
		t.Errorf("MuteExpiration: want %v, got %v", muted, got.MuteExpiration)
	}
	if got.LastMessageAt != nil || got.LastMessageID != nil || got.DeletedAt != nil {
		t.Errorf("expected unset nullable columns to be nil, got %+v", got)
	}
}

// AvatarURL uses "" as the absent state; it must land as SQL NULL and come back
// as "" (dbutil.NullStr on the way in, the Valid check on the way out).
func TestSqliteRemoteProjectionRepository_Save_EmptyAvatarRoundTrips(t *testing.T) {
	repo, store := newSqliteRemoteProjectionRepo(t)
	ctx := context.Background()

	channelID := uuid.New().String()
	remoteID := "628404@s.whatsapp.net"
	proj := makeSqliteRemoteProjection(channelID, remoteID, channelenums.RemoteTypeUser)
	proj.AvatarURL = ""
	require.NoError(t, repo.Save(ctx, proj))

	var isNull bool
	require.NoError(t, store.DB().QueryRowContext(ctx,
		`SELECT avatar_url IS NULL FROM gateway_remotes WHERE channel_id = ? AND remote_id = ?`,
		channelID, remoteID,
	).Scan(&isNull))
	assert.True(t, isNull, "an empty AvatarURL must be stored as NULL")

	got, err := repo.Find(ctx, channelID, remoteID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "", got.AvatarURL)
}

func TestSqliteRemoteProjectionRepository_Save_Upsert(t *testing.T) {
	repo, _ := newSqliteRemoteProjectionRepo(t)
	ctx := context.Background()

	channelID := uuid.New().String()
	remoteID := "6285555@s.whatsapp.net"
	proj := makeSqliteRemoteProjection(channelID, remoteID, channelenums.RemoteTypeUser)

	if err := repo.Save(ctx, proj); err != nil {
		t.Fatalf("first Save: %v", err)
	}

	proj.Name = "Updated Name"
	proj.UnreadMessageCount = 5
	if err := repo.Save(ctx, proj); err != nil {
		t.Fatalf("second Save: %v", err)
	}

	got, err := repo.Find(ctx, channelID, remoteID)
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if got.Name != "Updated Name" {
		t.Errorf("Name: want Updated Name, got %q", got.Name)
	}
	if got.UnreadMessageCount != 5 {
		t.Errorf("UnreadMessageCount: want 5, got %d", got.UnreadMessageCount)
	}
	if got.Version < 2 {
		t.Errorf("version should be >= 2 after upsert, got %d", got.Version)
	}
}

func TestSqliteRemoteProjectionRepository_InsertIfNew_FirstWriteWins(t *testing.T) {
	repo, _ := newSqliteRemoteProjectionRepo(t)
	ctx := context.Background()

	channelID := uuid.New().String()
	remoteID := "628777@s.whatsapp.net"

	first := makeSqliteRemoteProjection(channelID, remoteID, channelenums.RemoteTypeUser)
	first.Name = "First Writer"
	inserted, err := repo.InsertIfNew(ctx, first)
	require.NoError(t, err)
	assert.True(t, inserted, "first InsertIfNew must insert")

	second := makeSqliteRemoteProjection(channelID, remoteID, channelenums.RemoteTypeUser)
	second.Name = "Late remote_created"
	inserted, err = repo.InsertIfNew(ctx, second)
	require.NoError(t, err)
	assert.False(t, inserted, "second InsertIfNew must report a conflict")

	got, err := repo.Find(ctx, channelID, remoteID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "First Writer", got.Name,
		"a late remote_created must never overwrite an earlier write")
}

func TestSqliteRemoteProjectionRepository_UpsertAll_Idempotent(t *testing.T) {
	repo, _ := newSqliteRemoteProjectionRepo(t)
	ctx := context.Background()

	channelID := uuid.New().String()
	remotes := make([]*projections.Remote, 10)
	for i := range remotes {
		remotes[i] = makeSqliteRemoteProjection(channelID,
			uuid.New().String()+"@s.whatsapp.net", channelenums.RemoteTypeUser)
	}

	if err := repo.UpsertAll(ctx, remotes); err != nil {
		t.Fatalf("first UpsertAll: %v", err)
	}
	if err := repo.UpsertAll(ctx, remotes); err != nil {
		t.Fatalf("second UpsertAll (idempotent): %v", err)
	}

	result, err := repo.FindAllByChannel(ctx, channelID)
	if err != nil {
		t.Fatalf("FindAllByChannel: %v", err)
	}
	if len(result) != 10 {
		t.Errorf("expected 10 remotes, got %d", len(result))
	}
}

func TestSqliteRemoteProjectionRepository_UpsertAll_LargeBatch(t *testing.T) {
	repo, _ := newSqliteRemoteProjectionRepo(t)
	ctx := context.Background()

	channelID := uuid.New().String()
	// 600 rows — exceeds the 500-row chunk, so the loop must split the batch.
	remotes := make([]*projections.Remote, 600)
	for i := range remotes {
		remotes[i] = makeSqliteRemoteProjection(channelID,
			uuid.New().String()+"@s.whatsapp.net", channelenums.RemoteTypeUser)
	}

	if err := repo.UpsertAll(ctx, remotes); err != nil {
		t.Fatalf("UpsertAll large batch: %v", err)
	}

	result, err := repo.FindAllByChannel(ctx, channelID)
	if err != nil {
		t.Fatalf("FindAllByChannel: %v", err)
	}
	if len(result) != 600 {
		t.Errorf("expected 600 remotes, got %d", len(result))
	}
}

// UpsertContactSnapshot writes only the contact-owned columns: every derived
// column must survive the conflict untouched.
func TestSqliteRemoteProjectionRepository_UpsertContactSnapshot_PreservesDerived(t *testing.T) {
	repo, _ := newSqliteRemoteProjectionRepo(t)
	ctx := context.Background()

	channelID := uuid.New().String()
	remoteID := "628321@s.whatsapp.net"
	lastAt := time.Now().UTC().Truncate(time.Millisecond)
	lastID := uuid.New().String()
	pinnedAt := lastAt.Add(-time.Hour)

	existing := makeSqliteRemoteProjection(channelID, remoteID, channelenums.RemoteTypeUser)
	existing.Name = "Old Name"
	existing.UnreadMessageCount = 4
	existing.LastMessageAt = &lastAt
	existing.LastMessageID = &lastID
	existing.PinnedAt = &pinnedAt
	existing.Archived = true
	require.NoError(t, repo.Save(ctx, existing))

	snapshot := makeSqliteRemoteProjection(channelID, remoteID, channelenums.RemoteTypeUser)
	snapshot.Name = "New Name From Contacts"
	snapshot.AvatarURL = "https://example.com/new.jpg"
	require.NoError(t, repo.UpsertContactSnapshot(ctx, []*projections.Remote{snapshot}))

	got, err := repo.Find(ctx, channelID, remoteID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "New Name From Contacts", got.Name)
	assert.Equal(t, "https://example.com/new.jpg", got.AvatarURL)
	assert.Equal(t, 4, got.UnreadMessageCount, "unread must survive a contact snapshot")
	require.NotNil(t, got.LastMessageID)
	assert.Equal(t, lastID, *got.LastMessageID, "preview must survive a contact snapshot")
	require.NotNil(t, got.PinnedAt)
	assert.True(t, got.Archived, "archived must survive a contact snapshot")
}

// A contact snapshot for a remote that does not exist yet inserts the row.
func TestSqliteRemoteProjectionRepository_UpsertContactSnapshot_Inserts(t *testing.T) {
	repo, _ := newSqliteRemoteProjectionRepo(t)
	ctx := context.Background()

	channelID := uuid.New().String()
	remoteID := "628654@s.whatsapp.net"
	snapshot := makeSqliteRemoteProjection(channelID, remoteID, channelenums.RemoteTypeUser)
	snapshot.Name = "Fresh Contact"
	require.NoError(t, repo.UpsertContactSnapshot(ctx, []*projections.Remote{snapshot}))

	got, err := repo.Find(ctx, channelID, remoteID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "Fresh Contact", got.Name)
	assert.Nil(t, got.LastMessageAt, "a freshly snapshotted contact has no preview yet")
}

func TestSqliteRemoteProjectionRepository_FindAllByChannel_EmptyMap(t *testing.T) {
	repo, _ := newSqliteRemoteProjectionRepo(t)

	result, err := repo.FindAllByChannel(context.Background(), uuid.New().String())
	if err != nil {
		t.Fatalf("FindAllByChannel: %v", err)
	}
	if result == nil {
		t.Error("expected non-nil empty map, got nil")
	}
	if len(result) != 0 {
		t.Errorf("expected empty map, got %d entries", len(result))
	}
}

func TestSqliteRemoteProjectionRepository_ResetUnreadCount(t *testing.T) {
	repo, _ := newSqliteRemoteProjectionRepo(t)
	ctx := context.Background()

	channelID := uuid.New().String()
	remoteID := "6283333@s.whatsapp.net"
	proj := makeSqliteRemoteProjection(channelID, remoteID, channelenums.RemoteTypeUser)
	proj.UnreadMessageCount = 10
	proj.MarkedAsUnread = true

	if err := repo.Save(ctx, proj); err != nil {
		t.Fatalf("Save: %v", err)
	}
	if err := repo.ResetUnreadCount(ctx, channelID, remoteID); err != nil {
		t.Fatalf("ResetUnreadCount: %v", err)
	}

	got, err := repo.Find(ctx, channelID, remoteID)
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if got.UnreadMessageCount != 0 {
		t.Errorf("UnreadMessageCount: want 0, got %d", got.UnreadMessageCount)
	}
	if got.MarkedAsUnread {
		t.Error("MarkedAsUnread should be false after reset")
	}
}

func TestSqliteRemoteProjectionRepository_UpdateAvatar(t *testing.T) {
	repo, _ := newSqliteRemoteProjectionRepo(t)
	ctx := context.Background()

	channelID := uuid.New().String()
	remoteID := "628222@s.whatsapp.net"
	require.NoError(t, repo.Save(ctx, makeSqliteRemoteProjection(channelID, remoteID, channelenums.RemoteTypeUser)))

	require.NoError(t, repo.UpdateAvatar(ctx, channelID, remoteID, "https://example.com/updated.png"))

	got, err := repo.Find(ctx, channelID, remoteID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "https://example.com/updated.png", got.AvatarURL)

	// Missing row: no-op, not an error.
	assert.NoError(t, repo.UpdateAvatar(ctx, channelID, "ghost@s.whatsapp.net", "https://example.com/x.png"))
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

func TestSqliteRemoteProjectionRepository_List_CursorPagination(t *testing.T) {
	repo, _ := newSqliteRemoteProjectionRepo(t)
	ctx := context.Background()

	channelID := uuid.New().String()
	base := time.Now().UTC().Truncate(time.Second)
	for i := 0; i < 5; i++ {
		p := makeSqliteRemoteProjection(channelID, uuid.New().String()+"@s.whatsapp.net", channelenums.RemoteTypeUser)
		at := base.Add(time.Duration(i) * time.Minute)
		p.LastMessageAt = &at
		if err := repo.Save(ctx, p); err != nil {
			t.Fatalf("Save %d: %v", i, err)
		}
	}

	first, err := repo.List(ctx, channelID, ListOptions{Limit: 3})
	if err != nil {
		t.Fatalf("List page 1: %v", err)
	}
	if len(first) != 3 {
		t.Fatalf("page 1: want 3, got %d", len(first))
	}
	// Newest first — the DESC ordering must survive the NULLS-LAST translation.
	if !first[0].LastMessageAt.Equal(base.Add(4 * time.Minute)) {
		t.Errorf("page 1 head: want %v, got %v", base.Add(4*time.Minute), first[0].LastMessageAt)
	}

	cursor := first[len(first)-1].LastMessageAt
	second, err := repo.List(ctx, channelID, ListOptions{Limit: 3, Cursor: cursor})
	if err != nil {
		t.Fatalf("List page 2: %v", err)
	}
	if len(second) != 2 {
		t.Errorf("page 2: want 2, got %d", len(second))
	}
}

// Postgres said `DESC NULLS LAST`; SQLite sorts NULL lowest, so plain DESC gives
// the same order. This pins that equivalence.
func TestSqliteRemoteProjectionRepository_List_NullPreviewSortsLast(t *testing.T) {
	repo, _ := newSqliteRemoteProjectionRepo(t)
	ctx := context.Background()

	channelID := uuid.New().String()
	at := time.Now().UTC().Truncate(time.Millisecond)

	withPreview := makeSqliteRemoteProjection(channelID, "with@s.whatsapp.net", channelenums.RemoteTypeUser)
	withPreview.LastMessageAt = &at
	require.NoError(t, repo.Save(ctx, withPreview))
	require.NoError(t, repo.Save(ctx,
		makeSqliteRemoteProjection(channelID, "without@s.whatsapp.net", channelenums.RemoteTypeUser)))

	got, err := repo.List(ctx, channelID, ListOptions{Limit: 10})
	require.NoError(t, err)
	require.Len(t, got, 2)
	assert.Equal(t, "with@s.whatsapp.net", got[0].RemoteID, "a remote with a preview must sort first")
	assert.Nil(t, got[1].LastMessageAt, "the NULL preview must sort last")
}

func TestSqliteRemoteProjectionRepository_List_Filters(t *testing.T) {
	repo, _ := newSqliteRemoteProjectionRepo(t)
	ctx := context.Background()

	channelID := uuid.New().String()
	pinnedAt := time.Now().UTC().Truncate(time.Millisecond)

	user := makeSqliteRemoteProjection(channelID, "alice@s.whatsapp.net", channelenums.RemoteTypeUser)
	user.Name = "Alice Cooper"
	require.NoError(t, repo.Save(ctx, user))

	group := makeSqliteRemoteProjection(channelID, "12036300@g.us", channelenums.RemoteTypeGroup)
	group.Name = "Bob and friends"
	group.PinnedAt = &pinnedAt
	require.NoError(t, repo.Save(ctx, group))

	byType, err := repo.List(ctx, channelID, ListOptions{Type: channelenums.RemoteTypeGroup})
	require.NoError(t, err)
	require.Len(t, byType, 1)
	assert.Equal(t, group.RemoteID, byType[0].RemoteID)

	// LIKE is case-insensitive for ASCII in SQLite, which is what replaces the
	// Postgres ILIKE.
	bySearch, err := repo.List(ctx, channelID, ListOptions{Search: "alice"})
	require.NoError(t, err)
	require.Len(t, bySearch, 1)
	assert.Equal(t, user.RemoteID, bySearch[0].RemoteID)

	onlyPinned, err := repo.List(ctx, channelID, ListOptions{OnlyPinned: true})
	require.NoError(t, err)
	require.Len(t, onlyPinned, 1)
	assert.Equal(t, group.RemoteID, onlyPinned[0].RemoteID)

	// Filters compose.
	none, err := repo.List(ctx, channelID, ListOptions{Type: channelenums.RemoteTypeUser, OnlyPinned: true})
	require.NoError(t, err)
	assert.Empty(t, none)
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

func TestSqliteRemoteProjectionRepository_UpdateMembership(t *testing.T) {
	repo, store := newSqliteRemoteProjectionRepo(t)
	ctx := context.Background()

	channelID := uuid.New().String()
	groupID := "120363000000@g.us"
	if err := repo.Save(ctx, makeSqliteRemoteProjection(channelID, groupID, channelenums.RemoteTypeGroup)); err != nil {
		t.Fatalf("Save group: %v", err)
	}

	now := time.Now().UTC().Truncate(time.Millisecond)
	members := []MembershipRow{
		{MemberID: "m1@s.whatsapp.net", IsAdmin: true, JoinedAt: now},
		{MemberID: "m2@s.whatsapp.net", IsAdmin: false, JoinedAt: now},
	}
	if err := repo.UpdateMembership(ctx, channelID, groupID, members); err != nil {
		t.Fatalf("UpdateMembership: %v", err)
	}
	if got := countSqliteMemberships(t, store, channelID, groupID); got != 2 {
		t.Errorf("expected 2 members, got %d", got)
	}

	// is_admin crosses the bool <-> INTEGER boundary.
	var isAdmin int64
	if err := store.DB().QueryRowContext(ctx,
		`SELECT is_admin FROM gateway_remote_memberships
		 WHERE channel_id = ? AND group_id = ? AND member_id = ?`,
		channelID, groupID, "m1@s.whatsapp.net",
	).Scan(&isAdmin); err != nil {
		t.Fatalf("read is_admin: %v", err)
	}
	if isAdmin != 1 {
		t.Errorf("is_admin: want 1, got %d", isAdmin)
	}

	// Replacing the list drops the old rows.
	if err := repo.UpdateMembership(ctx, channelID, groupID, []MembershipRow{
		{MemberID: "m3@s.whatsapp.net", IsAdmin: false, JoinedAt: now},
	}); err != nil {
		t.Fatalf("second UpdateMembership: %v", err)
	}
	if got := countSqliteMemberships(t, store, channelID, groupID); got != 1 {
		t.Errorf("expected 1 member after replace, got %d", got)
	}
}

func TestSqliteRemoteProjectionRepository_UpdateMembership_EmptyRemovesAll(t *testing.T) {
	repo, store := newSqliteRemoteProjectionRepo(t)
	ctx := context.Background()

	channelID := uuid.New().String()
	groupID := "120363111111@g.us"
	if err := repo.Save(ctx, makeSqliteRemoteProjection(channelID, groupID, channelenums.RemoteTypeGroup)); err != nil {
		t.Fatalf("Save: %v", err)
	}

	now := time.Now().UTC()
	if err := repo.UpdateMembership(ctx, channelID, groupID, []MembershipRow{
		{MemberID: "m1@s.whatsapp.net", IsAdmin: false, JoinedAt: now},
	}); err != nil {
		t.Fatalf("seed UpdateMembership: %v", err)
	}

	if err := repo.UpdateMembership(ctx, channelID, groupID, nil); err != nil {
		t.Fatalf("UpdateMembership with nil: %v", err)
	}
	if got := countSqliteMemberships(t, store, channelID, groupID); got != 0 {
		t.Errorf("expected 0 members after empty update, got %d", got)
	}
}

func TestSqliteRemoteProjectionRepository_AddRemoveMember(t *testing.T) {
	repo, store := newSqliteRemoteProjectionRepo(t)
	ctx := context.Background()

	channelID := uuid.New().String()
	groupID := "120363222222@g.us"
	require.NoError(t, repo.Save(ctx, makeSqliteRemoteProjection(channelID, groupID, channelenums.RemoteTypeGroup)))

	now := time.Now().UTC().Truncate(time.Millisecond)
	member := MembershipRow{MemberID: "m9@s.whatsapp.net", IsAdmin: false, JoinedAt: now}
	require.NoError(t, repo.AddMember(ctx, channelID, groupID, member))

	// Replaying with a promotion upserts rather than erroring on the PK.
	member.IsAdmin = true
	require.NoError(t, repo.AddMember(ctx, channelID, groupID, member))
	assert.Equal(t, 1, countSqliteMemberships(t, store, channelID, groupID))

	var isAdmin int64
	require.NoError(t, store.DB().QueryRowContext(ctx,
		`SELECT is_admin FROM gateway_remote_memberships
		 WHERE channel_id = ? AND group_id = ? AND member_id = ?`,
		channelID, groupID, member.MemberID,
	).Scan(&isAdmin))
	assert.EqualValues(t, 1, isAdmin, "AddMember must upsert the admin flag")

	require.NoError(t, repo.RemoveMember(ctx, channelID, groupID, member.MemberID))
	assert.Equal(t, 0, countSqliteMemberships(t, store, channelID, groupID))

	// Removing an absent member is idempotent.
	assert.NoError(t, repo.RemoveMember(ctx, channelID, groupID, member.MemberID))
}

func TestSqliteRemoteProjectionRepository_BulkUpdateMemberships(t *testing.T) {
	repo, store := newSqliteRemoteProjectionRepo(t)
	ctx := context.Background()

	channelID := uuid.New().String()
	groupA := "120363aaaa@g.us"
	groupB := "120363bbbb@g.us"
	for _, g := range []string{groupA, groupB} {
		require.NoError(t, repo.Save(ctx, makeSqliteRemoteProjection(channelID, g, channelenums.RemoteTypeGroup)))
	}

	now := time.Now().UTC().Truncate(time.Millisecond)
	require.NoError(t, repo.BulkUpdateMemberships(ctx, channelID, map[string][]MembershipRow{
		groupA: {
			{MemberID: "a1@s.whatsapp.net", IsAdmin: true, JoinedAt: now},
			{MemberID: "a2@s.whatsapp.net", IsAdmin: false, JoinedAt: now},
		},
		groupB: {{MemberID: "b1@s.whatsapp.net", IsAdmin: false, JoinedAt: now}},
	}))
	assert.Equal(t, 2, countSqliteMemberships(t, store, channelID, groupA))
	assert.Equal(t, 1, countSqliteMemberships(t, store, channelID, groupB))

	// A second pass wipes every membership for the channel first, so a group
	// absent from the new map ends up empty.
	require.NoError(t, repo.BulkUpdateMemberships(ctx, channelID, map[string][]MembershipRow{
		groupA: {{MemberID: "a9@s.whatsapp.net", IsAdmin: false, JoinedAt: now}},
	}))
	assert.Equal(t, 1, countSqliteMemberships(t, store, channelID, groupA))
	assert.Equal(t, 0, countSqliteMemberships(t, store, channelID, groupB),
		"a group missing from the new map must be cleared")

	// An empty map is a no-op, NOT a wipe.
	require.NoError(t, repo.BulkUpdateMemberships(ctx, channelID, nil))
	assert.Equal(t, 1, countSqliteMemberships(t, store, channelID, groupA))
}

// ---------------------------------------------------------------------------
// Apply* — folding message facts into the projection
// ---------------------------------------------------------------------------

func TestSqliteApplyLatestMessage_ForwardOnly(t *testing.T) {
	repo, _ := newSqliteRemoteProjectionRepo(t)
	ctx := context.Background()

	channelID := uuid.New().String()
	remoteID := "558399999999@s.whatsapp.net"
	require.NoError(t, repo.Save(ctx, &projections.Remote{
		ChannelID: channelID,
		RemoteID:  remoteID,
		Type:      string(channelenums.RemoteTypeUser),
		Platform:  channelenums.PlatformWhatsApp,
		Name:      "Alice",
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}))

	newerID := uuid.New().String()
	olderID := uuid.New().String()
	newer := &projections.Message{
		ID:         newerID,
		ChannelID:  channelID,
		RemoteID:   remoteID,
		Direction:  string(channelenums.DirectionReceived),
		OccurredAt: time.Date(2026, 4, 24, 12, 0, 0, 0, time.UTC),
	}
	older := &projections.Message{
		ID:         olderID,
		ChannelID:  channelID,
		RemoteID:   remoteID,
		Direction:  string(channelenums.DirectionReceived),
		OccurredAt: time.Date(2026, 4, 24, 11, 0, 0, 0, time.UTC),
	}

	// Apply newer first, then older: the older must NOT overwrite the preview,
	// but unread MUST bump on both.
	require.NoError(t, repo.ApplyLatestMessage(ctx, newer))
	require.NoError(t, repo.ApplyLatestMessage(ctx, older))

	r, err := repo.Find(ctx, channelID, remoteID)
	require.NoError(t, err)
	require.NotNil(t, r.LastMessageID)
	assert.Equal(t, newerID, *r.LastMessageID, "older message must not win last_message_id")
	require.NotNil(t, r.LastMessageAt)
	assert.Equal(t, newer.OccurredAt, r.LastMessageAt.UTC())
	assert.Equal(t, 2, r.UnreadMessageCount,
		"unread always bumps on received, regardless of preview winner")
}

func TestSqliteApplyLatestMessage_SentDoesNotBumpUnread(t *testing.T) {
	repo, _ := newSqliteRemoteProjectionRepo(t)
	ctx := context.Background()

	channelID := uuid.New().String()
	remoteID := "558388888888@s.whatsapp.net"
	require.NoError(t, repo.Save(ctx, &projections.Remote{
		ChannelID: channelID,
		RemoteID:  remoteID,
		Type:      string(channelenums.RemoteTypeUser),
		Platform:  channelenums.PlatformWhatsApp,
		Name:      "Bob",
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}))

	sent := &projections.Message{
		ID:         uuid.New().String(),
		ChannelID:  channelID,
		RemoteID:   remoteID,
		Direction:  string(channelenums.DirectionSent),
		OccurredAt: time.Date(2026, 4, 24, 13, 0, 0, 0, time.UTC),
	}
	require.NoError(t, repo.ApplyLatestMessage(ctx, sent))

	r, err := repo.Find(ctx, channelID, remoteID)
	require.NoError(t, err)
	assert.Equal(t, 0, r.UnreadMessageCount, "sent must not bump unread")
	require.NotNil(t, r.LastMessageID)
	assert.Equal(t, sent.ID, *r.LastMessageID)
}

func TestSqliteApplyHistoricalMessages_DoesNotBumpUnread(t *testing.T) {
	repo, _ := newSqliteRemoteProjectionRepo(t)
	ctx := context.Background()

	channelID := uuid.New().String()
	remoteA := "558311111111@s.whatsapp.net"
	remoteB := "558322222222@s.whatsapp.net"

	existingAt := time.Date(2026, 4, 20, 10, 0, 0, 0, time.UTC)
	seed := func(rid string) {
		require.NoError(t, repo.Save(ctx, &projections.Remote{
			ChannelID:          channelID,
			RemoteID:           rid,
			Type:               string(channelenums.RemoteTypeUser),
			Platform:           channelenums.PlatformWhatsApp,
			Name:               rid,
			UnreadMessageCount: 3,
			LastMessageAt:      &existingAt,
			CreatedAt:          time.Now().UTC(),
			UpdatedAt:          time.Now().UTC(),
		}))
	}
	seed(remoteA)
	seed(remoteB)

	// A: one received + one sent, both OLDER than existing (must not win the
	//    preview, must not bump unread).
	// B: one received NEWER than existing (must win the preview, must not bump).
	msgs := []*projections.Message{
		{
			ID: uuid.New().String(), ChannelID: channelID, RemoteID: remoteA,
			Direction:  string(channelenums.DirectionReceived),
			OccurredAt: time.Date(2026, 4, 19, 10, 0, 0, 0, time.UTC),
		},
		{
			ID: uuid.New().String(), ChannelID: channelID, RemoteID: remoteA,
			Direction:  string(channelenums.DirectionSent),
			OccurredAt: time.Date(2026, 4, 19, 11, 0, 0, 0, time.UTC),
		},
		{
			ID: uuid.New().String(), ChannelID: channelID, RemoteID: remoteB,
			Direction:  string(channelenums.DirectionReceived),
			OccurredAt: time.Date(2026, 4, 25, 9, 0, 0, 0, time.UTC),
		},
	}
	require.NoError(t, repo.ApplyHistoricalMessages(ctx, msgs))

	a, err := repo.Find(ctx, channelID, remoteA)
	require.NoError(t, err)
	assert.Equal(t, 3, a.UnreadMessageCount, "A: historical messages must not bump unread")
	require.NotNil(t, a.LastMessageAt)
	assert.Equal(t, existingAt, a.LastMessageAt.UTC(), "A: older batch must not win preview")

	b, err := repo.Find(ctx, channelID, remoteB)
	require.NoError(t, err)
	assert.Equal(t, 3, b.UnreadMessageCount, "B: historical messages must not bump unread")
	require.NotNil(t, b.LastMessageID)
	assert.Equal(t, msgs[2].ID, *b.LastMessageID, "B: preview advances to new message id")
}

func TestSqliteApplyHistoricalMessages_EmptySlice_NoOp(t *testing.T) {
	repo, _ := newSqliteRemoteProjectionRepo(t)
	ctx := context.Background()

	assert.NoError(t, repo.ApplyHistoricalMessages(ctx, nil))
	assert.NoError(t, repo.ApplyHistoricalMessages(ctx, []*projections.Message{}))
}

// ---------------------------------------------------------------------------
// Preview recompute / backfill
// ---------------------------------------------------------------------------

func TestSqliteRecomputePreviewIfLatest_GuardMatches_RecomputesToPrevious(t *testing.T) {
	repo, store := newSqliteRemoteProjectionRepo(t)
	ctx := context.Background()

	channelID := uuid.New().String()
	remoteID := "558355555555@s.whatsapp.net"
	require.NoError(t, repo.Save(ctx, &projections.Remote{
		ChannelID: channelID,
		RemoteID:  remoteID,
		Type:      string(channelenums.RemoteTypeUser),
		Platform:  channelenums.PlatformWhatsApp,
		Name:      "Carol",
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}))

	olderID := uuid.New().String()
	newerID := uuid.New().String()
	olderAt := time.Date(2026, 4, 23, 10, 0, 0, 0, time.UTC)
	newerAt := time.Date(2026, 4, 24, 10, 0, 0, 0, time.UTC)
	seedSqliteMessage(t, store, olderID, channelID, remoteID, "plat-older", olderAt)
	seedSqliteMessage(t, store, newerID, channelID, remoteID, "plat-newer", newerAt)

	require.NoError(t, repo.ApplyLatestMessage(ctx, &projections.Message{
		ID: newerID, ChannelID: channelID, RemoteID: remoteID,
		Direction: string(channelenums.DirectionReceived), OccurredAt: newerAt,
	}))
	softDeleteSqliteMessage(t, store, newerID)

	// Guard matches — the preview walks back to the older message.
	require.NoError(t, repo.RecomputePreviewIfLatest(ctx, channelID, remoteID, newerID))

	r, err := repo.Find(ctx, channelID, remoteID)
	require.NoError(t, err)
	require.NotNil(t, r.LastMessageID, "preview should fall back to the older message, not clear")
	assert.Equal(t, olderID, *r.LastMessageID)
	require.NotNil(t, r.LastMessageAt)
	assert.Equal(t, olderAt, r.LastMessageAt.UTC())
}

func TestSqliteRecomputePreviewIfLatest_GuardDoesNotMatch_NoOp(t *testing.T) {
	repo, store := newSqliteRemoteProjectionRepo(t)
	ctx := context.Background()

	channelID := uuid.New().String()
	remoteID := "558366666666@s.whatsapp.net"
	require.NoError(t, repo.Save(ctx, &projections.Remote{
		ChannelID: channelID,
		RemoteID:  remoteID,
		Type:      string(channelenums.RemoteTypeUser),
		Platform:  channelenums.PlatformWhatsApp,
		Name:      "Dan",
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}))

	currentID := uuid.New().String()
	staleID := uuid.New().String()
	at := time.Date(2026, 4, 24, 10, 0, 0, 0, time.UTC)
	seedSqliteMessage(t, store, currentID, channelID, remoteID, "plat-cur", at)

	require.NoError(t, repo.ApplyLatestMessage(ctx, &projections.Message{
		ID: currentID, ChannelID: channelID, RemoteID: remoteID,
		Direction: string(channelenums.DirectionReceived), OccurredAt: at,
	}))

	// Stale expectation → the WHERE guard matches nothing.
	require.NoError(t, repo.RecomputePreviewIfLatest(ctx, channelID, remoteID, staleID))

	r, err := repo.Find(ctx, channelID, remoteID)
	require.NoError(t, err)
	require.NotNil(t, r.LastMessageID)
	assert.Equal(t, currentID, *r.LastMessageID, "preview unchanged — guard did not match")
}

func TestSqliteRecomputePreviewIfLatest_NoMessagesLeft_Clears(t *testing.T) {
	repo, store := newSqliteRemoteProjectionRepo(t)
	ctx := context.Background()

	channelID := uuid.New().String()
	remoteID := "558377777777@s.whatsapp.net"
	require.NoError(t, repo.Save(ctx, &projections.Remote{
		ChannelID: channelID,
		RemoteID:  remoteID,
		Type:      string(channelenums.RemoteTypeUser),
		Platform:  channelenums.PlatformWhatsApp,
		Name:      "Eve",
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}))

	onlyID := uuid.New().String()
	at := time.Date(2026, 4, 24, 10, 0, 0, 0, time.UTC)
	seedSqliteMessage(t, store, onlyID, channelID, remoteID, "plat-only", at)

	require.NoError(t, repo.ApplyLatestMessage(ctx, &projections.Message{
		ID: onlyID, ChannelID: channelID, RemoteID: remoteID,
		Direction: string(channelenums.DirectionReceived), OccurredAt: at,
	}))
	softDeleteSqliteMessage(t, store, onlyID)

	require.NoError(t, repo.RecomputePreviewIfLatest(ctx, channelID, remoteID, onlyID))

	r, err := repo.Find(ctx, channelID, remoteID)
	require.NoError(t, err)
	assert.Nil(t, r.LastMessageID, "preview should clear to NULL when no non-deleted message remains")
	assert.Nil(t, r.LastMessageAt, "last_message_at should also clear")
}

// BackfillLastMessagePreview replaced an UPDATE ... FROM with correlated
// subqueries, so it needs its own coverage: rows with messages advance, rows
// without messages are untouched, and rows already ahead do not roll back.
func TestSqliteBackfillLastMessagePreview(t *testing.T) {
	repo, store := newSqliteRemoteProjectionRepo(t)
	ctx := context.Background()

	channelID := uuid.New().String()
	otherChannel := uuid.New().String()
	withMsgs := "5583100@s.whatsapp.net"
	noMsgs := "5583200@s.whatsapp.net"
	ahead := "5583300@s.whatsapp.net"
	foreign := "5583400@s.whatsapp.net"

	mk := func(ch, rid string) *projections.Remote {
		return makeSqliteRemoteProjection(ch, rid, channelenums.RemoteTypeUser)
	}
	require.NoError(t, repo.Save(ctx, mk(channelID, withMsgs)))
	require.NoError(t, repo.Save(ctx, mk(channelID, noMsgs)))
	require.NoError(t, repo.Save(ctx, mk(otherChannel, foreign)))

	aheadAt := time.Date(2026, 5, 1, 10, 0, 0, 0, time.UTC)
	aheadMsgID := uuid.New().String()
	aheadRow := mk(channelID, ahead)
	aheadRow.LastMessageAt = &aheadAt
	aheadRow.LastMessageID = &aheadMsgID
	require.NoError(t, repo.Save(ctx, aheadRow))

	oldAt := time.Date(2026, 4, 1, 10, 0, 0, 0, time.UTC)
	newAt := time.Date(2026, 4, 2, 10, 0, 0, 0, time.UTC)
	newestID := uuid.New().String()
	seedSqliteMessage(t, store, uuid.New().String(), channelID, withMsgs, "p-old", oldAt)
	seedSqliteMessage(t, store, newestID, channelID, withMsgs, "p-new", newAt)
	// Older than the `ahead` remote already points at — must not roll it back.
	seedSqliteMessage(t, store, uuid.New().String(), channelID, ahead, "p-ahead", oldAt)
	// A message on another channel must never leak across.
	seedSqliteMessage(t, store, uuid.New().String(), otherChannel, foreign, "p-foreign", newAt)

	require.NoError(t, repo.BackfillLastMessagePreview(ctx, channelID))

	got, err := repo.Find(ctx, channelID, withMsgs)
	require.NoError(t, err)
	require.NotNil(t, got.LastMessageAt)
	assert.Equal(t, newAt, got.LastMessageAt.UTC(), "backfill picks MAX(occurred_at)")
	require.NotNil(t, got.LastMessageID)
	assert.Equal(t, newestID, *got.LastMessageID, "backfill picks the newest message id")

	none, err := repo.Find(ctx, channelID, noMsgs)
	require.NoError(t, err)
	assert.Nil(t, none.LastMessageAt, "a remote with no messages must stay NULL")

	unchanged, err := repo.Find(ctx, channelID, ahead)
	require.NoError(t, err)
	require.NotNil(t, unchanged.LastMessageAt)
	assert.Equal(t, aheadAt, unchanged.LastMessageAt.UTC(), "forward-only: an ahead preview must not roll back")

	// Running it twice must be a no-op.
	require.NoError(t, repo.BackfillLastMessagePreview(ctx, channelID))
	again, err := repo.Find(ctx, channelID, withMsgs)
	require.NoError(t, err)
	require.NotNil(t, again.LastMessageAt)
	assert.Equal(t, newAt, again.LastMessageAt.UTC())

	// The other channel is untouched by a scoped backfill.
	other, err := repo.Find(ctx, otherChannel, foreign)
	require.NoError(t, err)
	assert.Nil(t, other.LastMessageAt, "backfill must be scoped to its channel")
}

// The membership DELETE+INSERT joins an ambient unit of work rather than opening
// its own transaction — a rollback must therefore undo it.
func TestSqliteRemoteProjectionRepository_UpdateMembership_JoinsAmbientTx(t *testing.T) {
	repo, store := newSqliteRemoteProjectionRepo(t)
	ctx := context.Background()

	channelID := uuid.New().String()
	groupID := "120363cccc@g.us"
	require.NoError(t, repo.Save(ctx, makeSqliteRemoteProjection(channelID, groupID, channelenums.RemoteTypeGroup)))

	uow := newSqliteTestUnitOfWork(store)
	wantErr := errAbortUnit
	err := uow.Execute(ctx, func(txCtx context.Context) error {
		if err := repo.UpdateMembership(txCtx, channelID, groupID, []MembershipRow{
			{MemberID: "rollback@s.whatsapp.net", IsAdmin: true, JoinedAt: time.Now().UTC()},
		}); err != nil {
			return err
		}
		return wantErr
	})
	require.ErrorIs(t, err, wantErr)

	assert.Equal(t, 0, countSqliteMemberships(t, store, channelID, groupID),
		"the membership write must have rolled back with the unit of work")
}
