package message

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	channelenums "template/api-go/internal/channel/enums"
	"template/api-go/internal/channel/projections"
)

// ---------------------------------------------------------------------------
// Tests — PgMessageProjectionRepository
// ---------------------------------------------------------------------------

func TestPgMessageProjectionRepository_Find_Miss(t *testing.T) {
	db, cleanup := newMessageTestDB(t)
	defer cleanup()

	repo := NewPgMessageProjectionRepository(db)
	msg, err := repo.Find(context.Background(), uuid.New().String())
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if msg != nil {
		t.Fatalf("expected nil for missing message, got %+v", msg)
	}
}

func TestPgMessageProjectionRepository_SaveAndFind(t *testing.T) {
	db, cleanup := newMessageTestDB(t)
	defer cleanup()

	repo := NewPgMessageProjectionRepository(db)
	proj := makeMessageProjection(uuid.New().String(), uuid.New().String(), "6281234@s.whatsapp.net", "wamid.001")

	if err := repo.Save(context.Background(), proj); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got, err := repo.Find(context.Background(), proj.ID)
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if got == nil {
		t.Fatal("expected message projection, got nil")
	}
	if got.ID != proj.ID {
		t.Errorf("ID: want %q, got %q", proj.ID, got.ID)
	}
	if got.PlatformMessageID != proj.PlatformMessageID {
		t.Errorf("PlatformMessageID: want %q, got %q", proj.PlatformMessageID, got.PlatformMessageID)
	}
	if got.SenderRemoteID != proj.SenderRemoteID {
		t.Errorf("SenderRemoteID: want %q, got %q", proj.SenderRemoteID, got.SenderRemoteID)
	}
}

func TestPgMessageProjectionRepository_FindByPlatformID(t *testing.T) {
	db, cleanup := newMessageTestDB(t)
	defer cleanup()

	channelID := uuid.New().String()
	platformID := "wamid.plat001"
	proj := makeMessageProjection(uuid.New().String(), channelID, "6281234@s.whatsapp.net", platformID)

	repo := NewPgMessageProjectionRepository(db)
	if err := repo.Save(context.Background(), proj); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got, err := repo.FindByPlatformID(context.Background(), channelID, platformID)
	if err != nil {
		t.Fatalf("FindByPlatformID: %v", err)
	}
	if got == nil {
		t.Fatal("expected message projection, got nil")
	}
	if got.PlatformMessageID != platformID {
		t.Errorf("PlatformMessageID: want %q, got %q", platformID, got.PlatformMessageID)
	}
}

func TestPgMessageProjectionRepository_FindByPlatformID_Miss(t *testing.T) {
	db, cleanup := newMessageTestDB(t)
	defer cleanup()

	repo := NewPgMessageProjectionRepository(db)
	got, err := repo.FindByPlatformID(context.Background(), uuid.New().String(), "wamid.nonexistent")
	if err != nil {
		t.Fatalf("FindByPlatformID: %v", err)
	}
	if got != nil {
		t.Fatalf("expected nil for missing platform ID, got %+v", got)
	}
}

func TestPgMessageProjectionRepository_InsertIfNew_Insert(t *testing.T) {
	db, cleanup := newMessageTestDB(t)
	defer cleanup()

	repo := NewPgMessageProjectionRepository(db)
	proj := makeMessageProjection(uuid.New().String(), uuid.New().String(), "6282222@s.whatsapp.net", "wamid.new001")

	inserted, err := repo.InsertIfNew(context.Background(), proj)
	if err != nil {
		t.Fatalf("InsertIfNew: %v", err)
	}
	if !inserted {
		t.Error("expected inserted=true for new message")
	}
}

func TestPgMessageProjectionRepository_InsertIfNew_Conflict(t *testing.T) {
	db, cleanup := newMessageTestDB(t)
	defer cleanup()

	repo := NewPgMessageProjectionRepository(db)
	channelID := uuid.New().String()
	platformID := "wamid.dup001"
	proj := makeMessageProjection(uuid.New().String(), channelID, "6283333@s.whatsapp.net", platformID)

	if _, err := repo.InsertIfNew(context.Background(), proj); err != nil {
		t.Fatalf("first InsertIfNew: %v", err)
	}

	// Same channelID + platformID, different message UUID.
	proj2 := makeMessageProjection(uuid.New().String(), channelID, "6283333@s.whatsapp.net", platformID)
	inserted, err := repo.InsertIfNew(context.Background(), proj2)
	if err != nil {
		t.Fatalf("second InsertIfNew: %v", err)
	}
	if inserted {
		t.Error("expected inserted=false on conflict (duplicate platform message ID)")
	}
}

func TestPgMessageProjectionRepository_UpsertAllIfNew_Count(t *testing.T) {
	db, cleanup := newMessageTestDB(t)
	defer cleanup()

	repo := NewPgMessageProjectionRepository(db)
	channelID := uuid.New().String()
	remoteID := "6284444@s.whatsapp.net"

	// 5 unique messages.
	msgs := make([]*projections.Message, 5)
	for i := range msgs {
		msgs[i] = makeMessageProjection(uuid.New().String(), channelID, remoteID,
			"wamid.bulk_"+uuid.New().String()[:4])
	}

	n, err := repo.UpsertAllIfNew(context.Background(), msgs)
	if err != nil {
		t.Fatalf("UpsertAllIfNew: %v", err)
	}
	if n != 5 {
		t.Errorf("inserted count: want 5, got %d", n)
	}

	// Insert same batch again — all should conflict.
	n2, err := repo.UpsertAllIfNew(context.Background(), msgs)
	if err != nil {
		t.Fatalf("second UpsertAllIfNew: %v", err)
	}
	if n2 != 0 {
		t.Errorf("duplicate batch: want 0 inserted, got %d", n2)
	}
}

func TestPgMessageProjectionRepository_UpsertAllIfNew_LargeBatch(t *testing.T) {
	db, cleanup := newMessageTestDB(t)
	defer cleanup()

	repo := NewPgMessageProjectionRepository(db)
	channelID := uuid.New().String()
	remoteID := "6285555@s.whatsapp.net"

	// 600 rows — exceeds chunk size of 500.
	msgs := make([]*projections.Message, 600)
	for i := range msgs {
		msgs[i] = makeMessageProjection(uuid.New().String(), channelID, remoteID,
			"wamid.large_"+uuid.New().String())
	}

	n, err := repo.UpsertAllIfNew(context.Background(), msgs)
	if err != nil {
		t.Fatalf("UpsertAllIfNew large batch: %v", err)
	}
	if n != 600 {
		t.Errorf("large batch: want 600 inserted, got %d", n)
	}
}

func TestPgMessageProjectionRepository_ListByRemote_CursorPagination(t *testing.T) {
	db, cleanup := newMessageTestDB(t)
	defer cleanup()

	repo := NewPgMessageProjectionRepository(db)
	channelID := uuid.New().String()
	remoteID := "6286666@s.whatsapp.net"

	base := time.Now().UTC().Truncate(time.Second)
	for i := 0; i < 6; i++ {
		p := makeMessageProjection(uuid.New().String(), channelID, remoteID,
			"wamid.pg_"+uuid.New().String()[:4])
		p.OccurredAt = base.Add(time.Duration(i) * time.Minute)
		if err := repo.Save(context.Background(), p); err != nil {
			t.Fatalf("Save %d: %v", i, err)
		}
	}

	// First page: newest 3.
	first, err := repo.ListByRemote(context.Background(), channelID, remoteID, CursorOptions{Limit: 3})
	if err != nil {
		t.Fatalf("ListByRemote page 1: %v", err)
	}
	if len(first) != 3 {
		t.Fatalf("page 1: want 3, got %d", len(first))
	}

	// Cursor page 2.
	cursor := first[len(first)-1].OccurredAt
	second, err := repo.ListByRemote(context.Background(), channelID, remoteID, CursorOptions{Limit: 3, Before: &cursor})
	if err != nil {
		t.Fatalf("ListByRemote page 2: %v", err)
	}
	if len(second) != 3 {
		t.Errorf("page 2: want 3, got %d", len(second))
	}
}

func TestPgMessageProjectionRepository_UpdateDelivered_ForwardOnly(t *testing.T) {
	db, cleanup := newMessageTestDB(t)
	defer cleanup()

	repo := NewPgMessageProjectionRepository(db)
	proj := makeMessageProjection(uuid.New().String(), uuid.New().String(), "6287777@s.whatsapp.net", "wamid.del001")
	if err := repo.Save(context.Background(), proj); err != nil {
		t.Fatalf("Save: %v", err)
	}

	t1 := time.Now().UTC().Truncate(time.Millisecond)
	t2 := t1.Add(-5 * time.Minute) // older

	if err := repo.UpdateDelivered(context.Background(), proj.ID, t1); err != nil {
		t.Fatalf("UpdateDelivered t1: %v", err)
	}
	if err := repo.UpdateDelivered(context.Background(), proj.ID, t2); err != nil {
		t.Fatalf("UpdateDelivered t2 (older): %v", err)
	}

	got, err := repo.Find(context.Background(), proj.ID)
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if got.DeliveredAt == nil {
		t.Fatal("DeliveredAt should be set")
	}
	if !got.DeliveredAt.Equal(t1) {
		t.Errorf("forward-only violated: want %v, got %v", t1, *got.DeliveredAt)
	}
}

func TestPgMessageProjectionRepository_UpdateSeen_ForwardOnly(t *testing.T) {
	db, cleanup := newMessageTestDB(t)
	defer cleanup()

	repo := NewPgMessageProjectionRepository(db)
	proj := makeMessageProjection(uuid.New().String(), uuid.New().String(), "6288888@s.whatsapp.net", "wamid.seen001")
	if err := repo.Save(context.Background(), proj); err != nil {
		t.Fatalf("Save: %v", err)
	}

	t1 := time.Now().UTC().Truncate(time.Millisecond)
	t2 := t1.Add(-10 * time.Minute)

	if err := repo.UpdateSeen(context.Background(), proj.ID, t1); err != nil {
		t.Fatalf("UpdateSeen t1: %v", err)
	}
	if err := repo.UpdateSeen(context.Background(), proj.ID, t2); err != nil {
		t.Fatalf("UpdateSeen t2 (older): %v", err)
	}

	got, err := repo.Find(context.Background(), proj.ID)
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if got.SeenAt == nil {
		t.Fatal("SeenAt should be set")
	}
	if !got.SeenAt.Equal(t1) {
		t.Errorf("forward-only violated: want %v, got %v", t1, *got.SeenAt)
	}
}

func TestPgMessageProjectionRepository_UpdateDelivered_Concurrent(t *testing.T) {
	db, cleanup := newMessageTestDB(t)
	defer cleanup()

	repo := NewPgMessageProjectionRepository(db)
	proj := makeMessageProjection(uuid.New().String(), uuid.New().String(), "6289999@s.whatsapp.net", "wamid.conc001")
	if err := repo.Save(context.Background(), proj); err != nil {
		t.Fatalf("Save: %v", err)
	}

	// Several concurrent deliveries — GREATEST ensures we end up with the max.
	base := time.Now().UTC().Truncate(time.Second)
	var wg sync.WaitGroup
	for i := 0; i < 5; i++ {
		wg.Add(1)
		at := base.Add(time.Duration(i) * time.Second)
		go func(t_ time.Time) {
			defer wg.Done()
			_ = repo.UpdateDelivered(context.Background(), proj.ID, t_)
		}(at)
	}
	wg.Wait()

	got, err := repo.Find(context.Background(), proj.ID)
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	expected := base.Add(4 * time.Second)
	if got.DeliveredAt == nil || !got.DeliveredAt.Equal(expected) {
		t.Errorf("concurrent delivered: want %v, got %v", expected, got.DeliveredAt)
	}
}

// -------------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------------

func makeMessageProjection(id, channelID, remoteID, platformMsgID string) *projections.Message {
	now := time.Now().UTC().Truncate(time.Millisecond)
	content, _ := json.Marshal(map[string]string{"text": "hello world"})
	return &projections.Message{
		ID:                id,
		ChannelID:         channelID,
		RemoteID:          remoteID,
		PlatformMessageID: platformMsgID,
		Direction:         string(channelenums.DirectionReceived),
		SenderRemoteID:    "6281234@s.whatsapp.net",
		Content:           json.RawMessage(content),
		OccurredAt:        now,
		ObservedAt:        now,
		Version:           1,
	}
}
