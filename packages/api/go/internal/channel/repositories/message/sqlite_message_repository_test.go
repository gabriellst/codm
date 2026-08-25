package message

import (
	"context"
	"database/sql"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"

	"template/api-go/internal/channel/entities"
	channelenums "template/api-go/internal/channel/enums"
	sharedrepos "template/core-go/repositories"
)

// ---------------------------------------------------------------------------
// Tests — SqliteMessageRepository (write side of the Message aggregate)
// ---------------------------------------------------------------------------

func TestSqliteMessageRepository_Find_Miss(t *testing.T) {
	store := newMessageSqliteStore(t)
	repo := NewSqliteMessageRepository(store, sharedrepos.NewSqliteDomainEventRepository(store, "gateway"))

	msg, err := repo.Find(context.Background(), uuid.New().String())
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if msg != nil {
		t.Fatalf("expected nil for missing message, got %+v", msg)
	}
}

func TestSqliteMessageRepository_Find_Hit(t *testing.T) {
	store := newMessageSqliteStore(t)

	msgID := uuid.New().String()
	channelID := uuid.New().String()
	remoteID := "6281234@s.whatsapp.net"
	platformMsgID := "wamid.abc123"
	seedSqliteMessageRow(t, store, msgID, channelID, remoteID, platformMsgID)

	repo := NewSqliteMessageRepository(store, sharedrepos.NewSqliteDomainEventRepository(store, "gateway"))
	msg, err := repo.Find(context.Background(), msgID)
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if msg == nil {
		t.Fatal("expected message aggregate, got nil")
	}
	if msg.PlatformMessageID() != platformMsgID {
		t.Errorf("PlatformMessageID: want %q, got %q", platformMsgID, msg.PlatformMessageID())
	}
	if msg.RemoteID() != remoteID {
		t.Errorf("RemoteID: want %q, got %q", remoteID, msg.RemoteID())
	}
	if msg.ChannelID().String() != channelID {
		t.Errorf("ChannelID: want %q, got %q", channelID, msg.ChannelID().String())
	}
	if msg.Direction() != channelenums.DirectionReceived {
		t.Errorf("Direction: want RECEIVED, got %q", msg.Direction())
	}
	// Unlike the pg implementation (which hardcoded WHATSAPP because its SELECT
	// omitted the column), the persisted platform is read back.
	if msg.Platform() != channelenums.PlatformWhatsApp {
		t.Errorf("Platform: want WHATSAPP, got %q", msg.Platform())
	}
}

func TestSqliteMessageRepository_Save_AppendsEventsAndUpserts(t *testing.T) {
	store := newMessageSqliteStore(t)
	ctx := context.Background()

	msgID := uuid.New()
	channelID := uuid.New()
	content, _ := json.Marshal(map[string]string{"text": "hello"})
	occurred := time.Now().UTC().Truncate(time.Millisecond)

	msg := entities.ReconstructMessage(entities.ReconstructMessageParams{
		ID:                msgID,
		ChannelID:         channelID,
		RemoteID:          "6285555@s.whatsapp.net",
		PlatformMessageID: "wamid.xyz999",
		Direction:         channelenums.DirectionReceived,
		Content:           json.RawMessage(content),
		OwnerID:           "owner-msg-save",
		OccurredAt:        occurred,
		CreatedAt:         occurred,
		UpdatedAt:         occurred,
		Version:           1,
		SenderRemoteID:    "6285555@s.whatsapp.net",
		Platform:          channelenums.PlatformWhatsApp,
		MessageType:       channelenums.MessageTypeText,
	})

	repo := NewSqliteMessageRepository(store, sharedrepos.NewSqliteDomainEventRepository(store, "gateway"))
	if err := repo.Save(ctx, msg); err != nil {
		t.Fatalf("Save: %v", err)
	}

	// Read the row back through the repository — proves the whole insert bound
	// correctly, not just that an id landed.
	got, err := repo.Find(ctx, msgID.String())
	if err != nil || got == nil {
		t.Fatalf("Find after Save: err=%v msg=%v", err, got)
	}
	if got.RemoteID() != "6285555@s.whatsapp.net" {
		t.Errorf("RemoteID: got %q", got.RemoteID())
	}
	if !got.OccurredAt().Equal(occurred) {
		t.Errorf("OccurredAt: want %v, got %v", occurred, got.OccurredAt())
	}
	// sender_remote_id is bound as '' on the write path (it is preserved on
	// conflict, not re-sent), which the read must reflect verbatim.
	var sender string
	if err := store.DB().QueryRowContext(ctx,
		`SELECT sender_remote_id FROM gateway_messages WHERE id = ?`, msgID.String(),
	).Scan(&sender); err != nil {
		t.Fatalf("read sender_remote_id: %v", err)
	}
	if sender != "" {
		t.Errorf("sender_remote_id: want empty (write-once column), got %q", sender)
	}
}

func TestSqliteMessageRepository_Save_SoftDelete(t *testing.T) {
	store := newMessageSqliteStore(t)
	ctx := context.Background()

	msgID := uuid.New().String()
	seedSqliteMessageRow(t, store, msgID, uuid.New().String(), "6287777@s.whatsapp.net", "wamid.del001")

	repo := NewSqliteMessageRepository(store, sharedrepos.NewSqliteDomainEventRepository(store, "gateway"))
	msg, err := repo.Find(ctx, msgID)
	if err != nil || msg == nil {
		t.Fatalf("Find: err=%v msg=%v", err, msg)
	}

	deletedAt := time.Now().UTC().Truncate(time.Millisecond)
	if err := msg.SoftDelete(deletedAt); err != nil {
		t.Fatalf("SoftDelete: %v", err)
	}
	if err := repo.Save(ctx, msg); err != nil {
		t.Fatalf("Save after SoftDelete: %v", err)
	}

	var storedDeletedAt sql.NullInt64
	if err := store.DB().QueryRowContext(ctx,
		`SELECT deleted_at FROM gateway_messages WHERE id = ?`, msgID,
	).Scan(&storedDeletedAt); err != nil {
		t.Fatalf("read deleted_at: %v", err)
	}
	if !storedDeletedAt.Valid {
		t.Fatal("expected deleted_at to be set after SoftDelete")
	}
	if storedDeletedAt.Int64 != deletedAt.UnixMilli() {
		t.Errorf("deleted_at: want %d, got %d", deletedAt.UnixMilli(), storedDeletedAt.Int64)
	}

	// The ON CONFLICT branch bumps version rather than resetting it to the
	// literal 1 the INSERT list carries.
	var version int64
	if err := store.DB().QueryRowContext(ctx,
		`SELECT version FROM gateway_messages WHERE id = ?`, msgID,
	).Scan(&version); err != nil {
		t.Fatalf("read version: %v", err)
	}
	if version != 2 {
		t.Errorf("version after conflicting Save: want 2, got %d", version)
	}
}

func TestSqliteMessageRepository_Save_Edit(t *testing.T) {
	store := newMessageSqliteStore(t)
	ctx := context.Background()

	msgID := uuid.New().String()
	seedSqliteMessageRow(t, store, msgID, uuid.New().String(), "6282222@s.whatsapp.net", "wamid.edit001")

	repo := NewSqliteMessageRepository(store, sharedrepos.NewSqliteDomainEventRepository(store, "gateway"))
	msg, err := repo.Find(ctx, msgID)
	if err != nil || msg == nil {
		t.Fatalf("Find: err=%v msg=%v", err, msg)
	}

	newContent, _ := json.Marshal(map[string]string{"text": "edited content"})
	if err := msg.Edit(json.RawMessage(newContent), time.Now().UTC()); err != nil {
		t.Fatalf("Edit: %v", err)
	}
	if err := repo.Save(ctx, msg); err != nil {
		t.Fatalf("Save after Edit: %v", err)
	}

	var editedAt sql.NullInt64
	var storedContent string
	if err := store.DB().QueryRowContext(ctx,
		`SELECT edited_at, content FROM gateway_messages WHERE id = ?`, msgID,
	).Scan(&editedAt, &storedContent); err != nil {
		t.Fatalf("read edited row: %v", err)
	}
	if !editedAt.Valid {
		t.Error("expected edited_at to be set after Edit")
	}
	if storedContent != string(newContent) {
		t.Errorf("content: want %q, got %q", string(newContent), storedContent)
	}
}
