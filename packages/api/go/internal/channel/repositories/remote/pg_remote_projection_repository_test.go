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
	sharedenums "template/api-go/internal/shared/enums"
)

// ---------------------------------------------------------------------------
// Tests — PgRemoteProjectionRepository
// ---------------------------------------------------------------------------

func TestPgRemoteProjectionRepository_Find_Miss(t *testing.T) {
	db, cleanup := newRemoteTestDB(t)
	defer cleanup()

	repo := NewPgRemoteProjectionRepository(db)
	rem, err := repo.Find(context.Background(), uuid.New().String(), "nobody@s.whatsapp.net")
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if rem != nil {
		t.Fatalf("expected nil for missing remote, got %+v", rem)
	}
}

func TestPgRemoteProjectionRepository_SaveAndFind(t *testing.T) {
	db, cleanup := newRemoteTestDB(t)
	defer cleanup()

	channelID := uuid.New().String()
	remoteID := "6281234@s.whatsapp.net"
	proj := makeRemoteProjection(channelID, remoteID, channelenums.RemoteTypeUser)

	repo := NewPgRemoteProjectionRepository(db)
	if err := repo.Save(context.Background(), proj); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got, err := repo.Find(context.Background(), channelID, remoteID)
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
}

func TestPgRemoteProjectionRepository_Save_Upsert(t *testing.T) {
	db, cleanup := newRemoteTestDB(t)
	defer cleanup()

	channelID := uuid.New().String()
	remoteID := "6285555@s.whatsapp.net"
	proj := makeRemoteProjection(channelID, remoteID, channelenums.RemoteTypeUser)

	repo := NewPgRemoteProjectionRepository(db)
	if err := repo.Save(context.Background(), proj); err != nil {
		t.Fatalf("first Save: %v", err)
	}

	proj.Name = "Updated Name"
	proj.UnreadMessageCount = 5
	if err := repo.Save(context.Background(), proj); err != nil {
		t.Fatalf("second Save: %v", err)
	}

	got, err := repo.Find(context.Background(), channelID, remoteID)
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

func TestPgRemoteProjectionRepository_UpsertAll_Idempotent(t *testing.T) {
	db, cleanup := newRemoteTestDB(t)
	defer cleanup()

	channelID := uuid.New().String()
	remotes := make([]*projections.Remote, 10)
	for i := range remotes {
		remotes[i] = makeRemoteProjection(channelID,
			uuid.New().String()+"@s.whatsapp.net",
			channelenums.RemoteTypeUser,
		)
	}

	repo := NewPgRemoteProjectionRepository(db)
	if err := repo.UpsertAll(context.Background(), remotes); err != nil {
		t.Fatalf("first UpsertAll: %v", err)
	}
	if err := repo.UpsertAll(context.Background(), remotes); err != nil {
		t.Fatalf("second UpsertAll (idempotent): %v", err)
	}

	result, err := repo.FindAllByChannel(context.Background(), channelID)
	if err != nil {
		t.Fatalf("FindAllByChannel: %v", err)
	}
	if len(result) != 10 {
		t.Errorf("expected 10 remotes, got %d", len(result))
	}
}

func TestPgRemoteProjectionRepository_UpsertAll_LargeBatch(t *testing.T) {
	db, cleanup := newRemoteTestDB(t)
	defer cleanup()

	channelID := uuid.New().String()
	// 600 rows — exceeds chunk size of 500, should split automatically.
	remotes := make([]*projections.Remote, 600)
	for i := range remotes {
		remotes[i] = makeRemoteProjection(channelID,
			uuid.New().String()+"@s.whatsapp.net",
			channelenums.RemoteTypeUser,
		)
	}

	repo := NewPgRemoteProjectionRepository(db)
	if err := repo.UpsertAll(context.Background(), remotes); err != nil {
		t.Fatalf("UpsertAll large batch: %v", err)
	}

	result, err := repo.FindAllByChannel(context.Background(), channelID)
	if err != nil {
		t.Fatalf("FindAllByChannel: %v", err)
	}
	if len(result) != 600 {
		t.Errorf("expected 600 remotes, got %d", len(result))
	}
}

func TestPgRemoteProjectionRepository_FindAllByChannel_EmptyMap(t *testing.T) {
	db, cleanup := newRemoteTestDB(t)
	defer cleanup()

	repo := NewPgRemoteProjectionRepository(db)
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

// TODO(task-7): rewrite via ApplyLatestMessage — today's test asserted
// the IncrementUnreadCount atomic op which was subsumed.
// func TestPgRemoteProjectionRepository_IncrementUnreadCount(t *testing.T) {
// 	db, cleanup := newRemoteTestDB(t)
// 	defer cleanup()
//
// 	channelID := uuid.New().String()
// 	remoteID := "6289876@s.whatsapp.net"
// 	proj := makeRemoteProjection(channelID, remoteID, channelenums.RemoteTypeUser)
//
// 	repo := NewPgRemoteProjectionRepository(db)
// 	if err := repo.Save(context.Background(), proj); err != nil {
// 		t.Fatalf("Save: %v", err)
// 	}
//
// 	const increments = 5
// 	for i := 0; i < increments; i++ {
// 		if err := repo.IncrementUnreadCount(context.Background(), channelID, remoteID); err != nil {
// 			t.Fatalf("IncrementUnreadCount %d: %v", i, err)
// 		}
// 	}
//
// 	got, err := repo.Find(context.Background(), channelID, remoteID)
// 	if err != nil {
// 		t.Fatalf("Find: %v", err)
// 	}
// 	if got.UnreadMessageCount != increments {
// 		t.Errorf("UnreadMessageCount: want %d, got %d", increments, got.UnreadMessageCount)
// 	}
// }

// TODO(task-7): rewrite via ApplyLatestMessage — concurrency tests subsumed into ApplyLatestMessages.
// func TestPgRemoteProjectionRepository_IncrementUnreadCount_Concurrent(t *testing.T) {
// 	db, cleanup := newRemoteTestDB(t)
// 	defer cleanup()
//
// 	channelID := uuid.New().String()
// 	remoteID := "6281111@s.whatsapp.net"
// 	proj := makeRemoteProjection(channelID, remoteID, channelenums.RemoteTypeUser)
//
// 	repo := NewPgRemoteProjectionRepository(db)
// 	if err := repo.Save(context.Background(), proj); err != nil {
// 		t.Fatalf("Save: %v", err)
// 	}
//
// 	const goroutines = 10
// 	var wg sync.WaitGroup
// 	for i := 0; i < goroutines; i++ {
// 		wg.Add(1)
// 		go func() {
// 			defer wg.Done()
// 			_ = repo.IncrementUnreadCount(context.Background(), channelID, remoteID)
// 		}()
// 	}
// 	wg.Wait()
//
// 	got, err := repo.Find(context.Background(), channelID, remoteID)
// 	if err != nil {
// 		t.Fatalf("Find: %v", err)
// 	}
// 	if got.UnreadMessageCount != goroutines {
// 		t.Errorf("concurrent increments: want %d, got %d", goroutines, got.UnreadMessageCount)
// 	}
// }

func TestPgRemoteProjectionRepository_ResetUnreadCount(t *testing.T) {
	db, cleanup := newRemoteTestDB(t)
	defer cleanup()

	channelID := uuid.New().String()
	remoteID := "6283333@s.whatsapp.net"
	proj := makeRemoteProjection(channelID, remoteID, channelenums.RemoteTypeUser)
	proj.UnreadMessageCount = 10
	proj.MarkedAsUnread = true

	repo := NewPgRemoteProjectionRepository(db)
	if err := repo.Save(context.Background(), proj); err != nil {
		t.Fatalf("Save: %v", err)
	}

	if err := repo.ResetUnreadCount(context.Background(), channelID, remoteID); err != nil {
		t.Fatalf("ResetUnreadCount: %v", err)
	}

	got, err := repo.Find(context.Background(), channelID, remoteID)
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if got.UnreadMessageCount != 0 {
		t.Errorf("UnreadMessageCount: want 0, got %d", got.UnreadMessageCount)
	}
	if got.MarkedAsUnread {
		t.Error("MarkedAsUnread should be FALSE after reset")
	}
}

// TODO(task-7): rewrite via ApplyLatestMessage — forward-only semantics now handled there.
// func TestPgRemoteProjectionRepository_UpdateLastMessageAt_ForwardOnly(t *testing.T) {
// 	db, cleanup := newRemoteTestDB(t)
// 	defer cleanup()
//
// 	channelID := uuid.New().String()
// 	remoteID := "6284444@s.whatsapp.net"
// 	proj := makeRemoteProjection(channelID, remoteID, channelenums.RemoteTypeUser)
//
// 	repo := NewPgRemoteProjectionRepository(db)
// 	if err := repo.Save(context.Background(), proj); err != nil {
// 		t.Fatalf("Save: %v", err)
// 	}
//
// 	t1 := time.Now().UTC().Truncate(time.Millisecond)
// 	t2 := t1.Add(-10 * time.Minute) // older
//
// 	if err := repo.UpdateLastMessageAt(context.Background(), channelID, remoteID, t1); err != nil {
// 		t.Fatalf("UpdateLastMessageAt t1: %v", err)
// 	}
// 	if err := repo.UpdateLastMessageAt(context.Background(), channelID, remoteID, t2); err != nil {
// 		t.Fatalf("UpdateLastMessageAt t2 (older): %v", err)
// 	}
//
// 	got, err := repo.Find(context.Background(), channelID, remoteID)
// 	if err != nil {
// 		t.Fatalf("Find: %v", err)
// 	}
// 	if got.LastMessageAt == nil {
// 		t.Fatal("LastMessageAt should be set")
// 	}
// 	if !got.LastMessageAt.Equal(t1) {
// 		t.Errorf("forward-only violated: want %v, got %v", t1, *got.LastMessageAt)
// 	}
// }

func TestPgRemoteProjectionRepository_UpdateMembership(t *testing.T) {
	db, cleanup := newRemoteTestDB(t)
	defer cleanup()

	channelID := uuid.New().String()
	groupID := "120363000000@g.us"
	proj := makeRemoteProjection(channelID, groupID, channelenums.RemoteTypeGroup)

	repo := NewPgRemoteProjectionRepository(db)
	if err := repo.Save(context.Background(), proj); err != nil {
		t.Fatalf("Save group: %v", err)
	}

	now := time.Now().UTC().Truncate(time.Millisecond)
	members := []MembershipRow{
		{MemberID: "m1@s.whatsapp.net", IsAdmin: true, JoinedAt: now},
		{MemberID: "m2@s.whatsapp.net", IsAdmin: false, JoinedAt: now},
	}
	if err := repo.UpdateMembership(context.Background(), channelID, groupID, members); err != nil {
		t.Fatalf("UpdateMembership: %v", err)
	}

	var count int
	_ = db.QueryRowContext(context.Background(),
		`SELECT count(*) FROM remote_memberships WHERE channel_id = $1 AND group_id = $2`,
		channelID, groupID,
	).Scan(&count)
	if count != 2 {
		t.Errorf("expected 2 members, got %d", count)
	}

	// Replace with a single member — old rows should be gone.
	if err := repo.UpdateMembership(context.Background(), channelID, groupID, []MembershipRow{
		{MemberID: "m3@s.whatsapp.net", IsAdmin: false, JoinedAt: now},
	}); err != nil {
		t.Fatalf("second UpdateMembership: %v", err)
	}

	_ = db.QueryRowContext(context.Background(),
		`SELECT count(*) FROM remote_memberships WHERE channel_id = $1 AND group_id = $2`,
		channelID, groupID,
	).Scan(&count)
	if count != 1 {
		t.Errorf("expected 1 member after replace, got %d", count)
	}
}

func TestPgRemoteProjectionRepository_UpdateMembership_EmptyRemovesAll(t *testing.T) {
	db, cleanup := newRemoteTestDB(t)
	defer cleanup()

	channelID := uuid.New().String()
	groupID := "120363111111@g.us"
	proj := makeRemoteProjection(channelID, groupID, channelenums.RemoteTypeGroup)

	repo := NewPgRemoteProjectionRepository(db)
	if err := repo.Save(context.Background(), proj); err != nil {
		t.Fatalf("Save: %v", err)
	}

	now := time.Now().UTC()
	_ = repo.UpdateMembership(context.Background(), channelID, groupID, []MembershipRow{
		{MemberID: "m1@s.whatsapp.net", IsAdmin: false, JoinedAt: now},
	})

	// Empty membership list = remove all.
	if err := repo.UpdateMembership(context.Background(), channelID, groupID, nil); err != nil {
		t.Fatalf("UpdateMembership with nil: %v", err)
	}

	var count int
	_ = db.QueryRowContext(context.Background(),
		`SELECT count(*) FROM remote_memberships WHERE channel_id = $1 AND group_id = $2`,
		channelID, groupID,
	).Scan(&count)
	if count != 0 {
		t.Errorf("expected 0 members after empty update, got %d", count)
	}
}

func TestPgRemoteProjectionRepository_List_CursorPagination(t *testing.T) {
	db, cleanup := newRemoteTestDB(t)
	defer cleanup()

	channelID := uuid.New().String()
	repo := NewPgRemoteProjectionRepository(db)

	// Insert 5 remotes with different last_message_at times.
	base := time.Now().UTC().Truncate(time.Second)
	for i := 0; i < 5; i++ {
		p := makeRemoteProjection(channelID, uuid.New().String()+"@s.whatsapp.net", channelenums.RemoteTypeUser)
		at := base.Add(time.Duration(i) * time.Minute)
		p.LastMessageAt = &at
		if err := repo.Save(context.Background(), p); err != nil {
			t.Fatalf("Save %d: %v", i, err)
		}
	}

	// First page: newest 3.
	first, err := repo.List(context.Background(), channelID, ListOptions{Limit: 3})
	if err != nil {
		t.Fatalf("List page 1: %v", err)
	}
	if len(first) != 3 {
		t.Fatalf("page 1: want 3, got %d", len(first))
	}

	// Cursor: before the oldest of the first page.
	cursor := first[len(first)-1].LastMessageAt
	second, err := repo.List(context.Background(), channelID, ListOptions{Limit: 3, Cursor: cursor})
	if err != nil {
		t.Fatalf("List page 2: %v", err)
	}
	if len(second) != 2 {
		t.Errorf("page 2: want 2, got %d", len(second))
	}
}

func TestApplyLatestMessage_ForwardOnly(t *testing.T) {
	db, cleanup := newRemoteTestDB(t)
	defer cleanup()
	ctx := context.Background()

	channelID := uuid.New().String()
	remoteID := "558399999999@s.whatsapp.net"
	repo := NewPgRemoteProjectionRepository(db)
	require.NoError(t, repo.Save(ctx, &projections.Remote{
		ChannelID: channelID,
		RemoteID:  remoteID,
		Type:      string(channelenums.RemoteTypeUser),
		Platform:  sharedenums.PlatformWhatsApp,
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

	// Apply newer first, then older.
	// Older must NOT overwrite preview, but unread MUST bump on both.
	require.NoError(t, repo.ApplyLatestMessage(ctx, newer))
	require.NoError(t, repo.ApplyLatestMessage(ctx, older))

	r, err := repo.Find(ctx, channelID, remoteID)
	require.NoError(t, err)
	require.NotNil(t, r.LastMessageID)
	assert.Equal(t, newerID, *r.LastMessageID,
		"older message must not win last_message_id")
	require.NotNil(t, r.LastMessageAt)
	assert.Equal(t, newer.OccurredAt, r.LastMessageAt.UTC())
	assert.Equal(t, 2, r.UnreadMessageCount,
		"unread always bumps on received, regardless of preview winner")
}

func TestApplyLatestMessage_SentDoesNotBumpUnread(t *testing.T) {
	db, cleanup := newRemoteTestDB(t)
	defer cleanup()
	ctx := context.Background()

	channelID := uuid.New().String()
	remoteID := "558388888888@s.whatsapp.net"
	repo := NewPgRemoteProjectionRepository(db)
	require.NoError(t, repo.Save(ctx, &projections.Remote{
		ChannelID: channelID,
		RemoteID:  remoteID,
		Type:      string(channelenums.RemoteTypeUser),
		Platform:  sharedenums.PlatformWhatsApp,
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

func TestApplyHistoricalMessages_DoesNotBumpUnread(t *testing.T) {
	db, cleanup := newRemoteTestDB(t)
	defer cleanup()
	ctx := context.Background()

	channelID := uuid.New().String()
	remoteA := "558311111111@s.whatsapp.net"
	remoteB := "558322222222@s.whatsapp.net"

	repo := NewPgRemoteProjectionRepository(db)

	// Seed remotes with existing non-zero unread to verify unread is preserved.
	existingAt := time.Date(2026, 4, 20, 10, 0, 0, 0, time.UTC)
	seed := func(rid string) {
		require.NoError(t, repo.Save(ctx, &projections.Remote{
			ChannelID:          channelID,
			RemoteID:           rid,
			Type:               string(channelenums.RemoteTypeUser),
			Platform:           sharedenums.PlatformWhatsApp,
			Name:               rid,
			UnreadMessageCount: 3,
			LastMessageAt:      &existingAt,
			CreatedAt:          time.Now().UTC(),
			UpdatedAt:          time.Now().UTC(),
		}))
	}
	seed(remoteA)
	seed(remoteB)

	// Batch:
	//   A: 1 received older than existing (must NOT win preview, must NOT bump unread)
	//      + 1 sent older than existing (must NOT win preview, must NOT bump unread)
	//   B: 1 received newer than existing (MUST win preview, must NOT bump unread)
	msgs := []*projections.Message{
		{
			ID:         uuid.New().String(),
			ChannelID:  channelID,
			RemoteID:   remoteA,
			Direction:  string(channelenums.DirectionReceived),
			OccurredAt: time.Date(2026, 4, 19, 10, 0, 0, 0, time.UTC),
		},
		{
			ID:         uuid.New().String(),
			ChannelID:  channelID,
			RemoteID:   remoteA,
			Direction:  string(channelenums.DirectionSent),
			OccurredAt: time.Date(2026, 4, 19, 11, 0, 0, 0, time.UTC),
		},
		{
			ID:         uuid.New().String(),
			ChannelID:  channelID,
			RemoteID:   remoteB,
			Direction:  string(channelenums.DirectionReceived),
			OccurredAt: time.Date(2026, 4, 25, 9, 0, 0, 0, time.UTC),
		},
	}
	require.NoError(t, repo.ApplyHistoricalMessages(ctx, msgs))

	// A: preview stays at existingAt; unread stays at 3 (historical never bumps)
	a, err := repo.Find(ctx, channelID, remoteA)
	require.NoError(t, err)
	assert.Equal(t, 3, a.UnreadMessageCount, "A: historical messages must not bump unread")
	require.NotNil(t, a.LastMessageAt)
	assert.Equal(t, existingAt, a.LastMessageAt.UTC(), "A: older batch must not win preview")

	// B: preview advances to newest msg id; unread stays at 3 (historical never bumps)
	b, err := repo.Find(ctx, channelID, remoteB)
	require.NoError(t, err)
	assert.Equal(t, 3, b.UnreadMessageCount, "B: historical messages must not bump unread")
	require.NotNil(t, b.LastMessageID)
	assert.Equal(t, msgs[2].ID, *b.LastMessageID, "B: preview advances to new message id")
}

func TestApplyHistoricalMessages_EmptySlice_NoOp(t *testing.T) {
	db, cleanup := newRemoteTestDB(t)
	defer cleanup()
	ctx := context.Background()

	repo := NewPgRemoteProjectionRepository(db)
	assert.NoError(t, repo.ApplyHistoricalMessages(ctx, nil))
	assert.NoError(t, repo.ApplyHistoricalMessages(ctx, []*projections.Message{}))
}

func TestRecomputePreviewIfLatest_GuardMatches_RecomputesToPrevious(t *testing.T) {
	db, cleanup := newRemoteTestDB(t)
	defer cleanup()
	ctx := context.Background()

	channelID := uuid.New().String()
	remoteID := "558355555555@s.whatsapp.net"
	repo := NewPgRemoteProjectionRepository(db)
	require.NoError(t, repo.Save(ctx, &projections.Remote{
		ChannelID: channelID,
		RemoteID:  remoteID,
		Type:      string(channelenums.RemoteTypeUser),
		Platform:  sharedenums.PlatformWhatsApp,
		Name:      "Carol",
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}))

	// Seed two messages directly via raw SQL for precise control over deleted_at.
	olderID := uuid.New().String()
	newerID := uuid.New().String()
	_, err := db.ExecContext(ctx,
		`INSERT INTO messages (id, channel_id, remote_id, platform_message_id, direction, platform, sender_remote_id, content, occurred_at, observed_at)
		 VALUES ($1, $2, $3, 'plat-older', 'RECEIVED', 'WHATSAPP', $3, '{"type":"TEXT","text":"old"}', $4, $4),
		        ($5, $2, $3, 'plat-newer', 'RECEIVED', 'WHATSAPP', $3, '{"type":"TEXT","text":"new"}', $6, $6)`,
		olderID, channelID, remoteID,
		time.Date(2026, 4, 23, 10, 0, 0, 0, time.UTC),
		newerID,
		time.Date(2026, 4, 24, 10, 0, 0, 0, time.UTC),
	)
	require.NoError(t, err)

	// Point the remote at the newer message.
	require.NoError(t, repo.ApplyLatestMessage(ctx, &projections.Message{
		ID:         newerID,
		ChannelID:  channelID,
		RemoteID:   remoteID,
		Direction:  string(channelenums.DirectionReceived),
		OccurredAt: time.Date(2026, 4, 24, 10, 0, 0, 0, time.UTC),
	}))
	// Soft-delete the newer message.
	_, err = db.ExecContext(ctx,
		`UPDATE messages SET deleted_at = NOW() WHERE id = $1`,
		newerID,
	)
	require.NoError(t, err)

	// Guard matches — recompute should walk back to the older message.
	require.NoError(t, repo.RecomputePreviewIfLatest(ctx, channelID, remoteID, newerID))

	r, err := repo.Find(ctx, channelID, remoteID)
	require.NoError(t, err)
	require.NotNil(t, r.LastMessageID, "preview should fall back to older message, not clear")
	assert.Equal(t, olderID, *r.LastMessageID)
}

func TestRecomputePreviewIfLatest_GuardDoesNotMatch_NoOp(t *testing.T) {
	db, cleanup := newRemoteTestDB(t)
	defer cleanup()
	ctx := context.Background()

	channelID := uuid.New().String()
	remoteID := "558366666666@s.whatsapp.net"
	repo := NewPgRemoteProjectionRepository(db)
	require.NoError(t, repo.Save(ctx, &projections.Remote{
		ChannelID: channelID,
		RemoteID:  remoteID,
		Type:      string(channelenums.RemoteTypeUser),
		Platform:  sharedenums.PlatformWhatsApp,
		Name:      "Dan",
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}))

	currentID := uuid.New().String()
	staleID := uuid.New().String()
	_, err := db.ExecContext(ctx,
		`INSERT INTO messages (id, channel_id, remote_id, platform_message_id, direction, platform, sender_remote_id, content, occurred_at, observed_at)
		 VALUES ($1, $2, $3, 'plat-cur', 'RECEIVED', 'WHATSAPP', $3, '{"type":"TEXT","text":"cur"}', $4, $4)`,
		currentID, channelID, remoteID,
		time.Date(2026, 4, 24, 10, 0, 0, 0, time.UTC),
	)
	require.NoError(t, err)

	require.NoError(t, repo.ApplyLatestMessage(ctx, &projections.Message{
		ID:         currentID,
		ChannelID:  channelID,
		RemoteID:   remoteID,
		Direction:  string(channelenums.DirectionReceived),
		OccurredAt: time.Date(2026, 4, 24, 10, 0, 0, 0, time.UTC),
	}))

	// Ask to recompute with a stale expectation → no-op.
	require.NoError(t, repo.RecomputePreviewIfLatest(ctx, channelID, remoteID, staleID))

	r, err := repo.Find(ctx, channelID, remoteID)
	require.NoError(t, err)
	require.NotNil(t, r.LastMessageID)
	assert.Equal(t, currentID, *r.LastMessageID, "preview unchanged — guard didn't match")
}

func TestRecomputePreviewIfLatest_NoMessagesLeft_Clears(t *testing.T) {
	db, cleanup := newRemoteTestDB(t)
	defer cleanup()
	ctx := context.Background()

	channelID := uuid.New().String()
	remoteID := "558377777777@s.whatsapp.net"
	repo := NewPgRemoteProjectionRepository(db)
	require.NoError(t, repo.Save(ctx, &projections.Remote{
		ChannelID: channelID,
		RemoteID:  remoteID,
		Type:      string(channelenums.RemoteTypeUser),
		Platform:  sharedenums.PlatformWhatsApp,
		Name:      "Eve",
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}))

	onlyID := uuid.New().String()
	_, err := db.ExecContext(ctx,
		`INSERT INTO messages (id, channel_id, remote_id, platform_message_id, direction, platform, sender_remote_id, content, occurred_at, observed_at)
		 VALUES ($1, $2, $3, 'plat-only', 'RECEIVED', 'WHATSAPP', $3, '{"type":"TEXT","text":"hi"}', $4, $4)`,
		onlyID, channelID, remoteID,
		time.Date(2026, 4, 24, 10, 0, 0, 0, time.UTC),
	)
	require.NoError(t, err)

	require.NoError(t, repo.ApplyLatestMessage(ctx, &projections.Message{
		ID:         onlyID,
		ChannelID:  channelID,
		RemoteID:   remoteID,
		Direction:  string(channelenums.DirectionReceived),
		OccurredAt: time.Date(2026, 4, 24, 10, 0, 0, 0, time.UTC),
	}))
	// Soft-delete the only message.
	_, err = db.ExecContext(ctx,
		`UPDATE messages SET deleted_at = NOW() WHERE id = $1`,
		onlyID,
	)
	require.NoError(t, err)

	require.NoError(t, repo.RecomputePreviewIfLatest(ctx, channelID, remoteID, onlyID))

	r, err := repo.Find(ctx, channelID, remoteID)
	require.NoError(t, err)
	assert.Nil(t, r.LastMessageID, "preview should clear to NULL when no non-deleted message remains")
	assert.Nil(t, r.LastMessageAt, "last_message_at should also clear")
}

// -------------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------------

func makeRemoteProjection(channelID, remoteID string, rt channelenums.RemoteType) *projections.Remote {
	now := time.Now().UTC().Truncate(time.Millisecond)
	return &projections.Remote{
		ChannelID: channelID,
		RemoteID:  remoteID,
		Type:      string(rt),
		Platform:  sharedenums.PlatformWhatsApp,
		Name:      "Test Remote",
		AvatarURL: "https://example.com/avatar.jpg",
		IsBlocked: false,
		CreatedAt: now,
		UpdatedAt: now,
		Version:   1,
	}
}
