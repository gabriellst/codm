package message

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"

	"template/api-go/internal/channel/entities"
	channelenums "template/api-go/internal/channel/enums"
	"template/core-go/db/dbutil"
	sqldb "template/core-go/db/sql"
	sharedrepos "template/core-go/repositories"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// newMessageTestDB opens an isolated schema and runs migrations.
// Skips if CHANNEL_TEST_DATABASE_URL is not set.
func newMessageTestDB(t *testing.T) (*sql.DB, func()) {
	t.Helper()

	dbURL := os.Getenv("CHANNEL_TEST_DATABASE_URL")
	if dbURL == "" {
		t.Skip("CHANNEL_TEST_DATABASE_URL not set (dedicated throwaway DB) — skipping pg integration test")
	}

	schema := fmt.Sprintf("test_msg_%s", uuid.New().String()[:8])

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
	// Build the schema from the committed contract snapshot (schema.sql).
	// ApplySchema touches the global `shared` schema (not concurrency-safe),
	// so serialize against parallel test binaries via LockMigrations.
	unlock, err := dbutil.LockMigrations(context.Background(), db)
	if err != nil {
		db.Close()
		t.Fatalf("LockMigrations: %v", err)
	}
	if err := sqldb.ApplySchema(db, schema); err != nil {
		unlock()
		db.Close()
		t.Fatalf("ApplySchema: %v", err)
	}
	unlock()

	cleanup := func() {
		_, _ = db.Exec(fmt.Sprintf("DROP SCHEMA IF EXISTS %s CASCADE", schema))
		db.Close()
	}
	return db, cleanup
}

// seedMessageRow directly inserts a row into messages for testing Find.
func seedMessageRow(t *testing.T, db *sql.DB, id, channelID, remoteID, platformMsgID string) {
	t.Helper()
	now := time.Now().UTC()
	_, err := db.Exec(
		`INSERT INTO messages
		   (id, channel_id, remote_id, platform_message_id, direction, platform,
		    sender_remote_id, content, occurred_at, observed_at, version)
		 VALUES ($1,$2,$3,$4,'RECEIVED','WHATSAPP','sender@s.whatsapp.net','{"text":"hello"}',$5,$5,1)
		 ON CONFLICT (id) DO NOTHING`,
		id, channelID, remoteID, platformMsgID, now,
	)
	if err != nil {
		t.Fatalf("seedMessageRow: %v", err)
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

func TestPgMessageRepository_Find_Miss(t *testing.T) {
	db, cleanup := newMessageTestDB(t)
	defer cleanup()

	repo := NewPgMessageRepository(db, sharedrepos.NewPgDomainEventRepository(db))
	msg, err := repo.Find(context.Background(), uuid.New().String())
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if msg != nil {
		t.Fatalf("expected nil for missing message, got %+v", msg)
	}
}

func TestPgMessageRepository_Find_Hit(t *testing.T) {
	db, cleanup := newMessageTestDB(t)
	defer cleanup()

	msgID := uuid.New().String()
	channelID := uuid.New().String()
	remoteID := "6281234@s.whatsapp.net"
	platformMsgID := "wamid.abc123"

	seedMessageRow(t, db, msgID, channelID, remoteID, platformMsgID)

	repo := NewPgMessageRepository(db, sharedrepos.NewPgDomainEventRepository(db))
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
}

func TestPgMessageRepository_Save_AppendsEventsAndUpserts(t *testing.T) {
	db, cleanup := newMessageTestDB(t)
	defer cleanup()

	msgID := uuid.New()
	channelID := uuid.New()
	ownerID := "owner-msg-save"

	content, _ := json.Marshal(map[string]string{"text": "hello"})
	msg := entities.ReconstructMessage(entities.ReconstructMessageParams{
		ID:                msgID,
		ChannelID:         channelID,
		RemoteID:          "6285555@s.whatsapp.net",
		PlatformMessageID: "wamid.xyz999",
		Direction:         channelenums.DirectionReceived,
		Content:           json.RawMessage(content),
		OwnerID:           ownerID,
		OccurredAt:        time.Now().UTC(),
		CreatedAt:         time.Now().UTC(),
		UpdatedAt:         time.Now().UTC(),
		Version:           1,
		SenderRemoteID:    "6285555@s.whatsapp.net",
		Platform:          channelenums.PlatformWhatsApp,
		MessageType:       channelenums.MessageTypeText,
	})

	domainEventRepo := sharedrepos.NewPgDomainEventRepository(db)
	repo := NewPgMessageRepository(db, domainEventRepo)

	if err := repo.Save(context.Background(), msg); err != nil {
		t.Fatalf("Save: %v", err)
	}

	// Verify the row was created.
	var dbID string
	err := db.QueryRowContext(context.Background(),
		`SELECT id FROM messages WHERE id = $1`, msgID.String(),
	).Scan(&dbID)
	if err != nil {
		t.Fatalf("verify row: %v", err)
	}
	if dbID != msgID.String() {
		t.Errorf("id: want %q, got %q", msgID.String(), dbID)
	}
}

func TestPgMessageRepository_Save_SoftDelete(t *testing.T) {
	db, cleanup := newMessageTestDB(t)
	defer cleanup()

	msgID := uuid.New().String()
	channelID := uuid.New().String()
	remoteID := "6287777@s.whatsapp.net"
	platformMsgID := "wamid.del001"

	// Seed a message so Find returns an aggregate.
	seedMessageRow(t, db, msgID, channelID, remoteID, platformMsgID)

	domainEventRepo := sharedrepos.NewPgDomainEventRepository(db)
	repo := NewPgMessageRepository(db, domainEventRepo)

	msg, err := repo.Find(context.Background(), msgID)
	if err != nil || msg == nil {
		t.Fatalf("Find: err=%v msg=%v", err, msg)
	}

	if err := msg.SoftDelete(time.Now().UTC()); err != nil {
		t.Fatalf("SoftDelete: %v", err)
	}
	if err := repo.Save(context.Background(), msg); err != nil {
		t.Fatalf("Save after SoftDelete: %v", err)
	}

	var deletedAt sql.NullTime
	_ = db.QueryRowContext(context.Background(),
		`SELECT deleted_at FROM messages WHERE id = $1`, msgID,
	).Scan(&deletedAt)
	if !deletedAt.Valid {
		t.Error("expected deleted_at to be set after SoftDelete")
	}
}

func TestPgMessageRepository_Save_Edit(t *testing.T) {
	db, cleanup := newMessageTestDB(t)
	defer cleanup()

	msgID := uuid.New().String()
	channelID := uuid.New().String()
	remoteID := "6282222@s.whatsapp.net"

	seedMessageRow(t, db, msgID, channelID, remoteID, "wamid.edit001")

	domainEventRepo := sharedrepos.NewPgDomainEventRepository(db)
	repo := NewPgMessageRepository(db, domainEventRepo)

	msg, err := repo.Find(context.Background(), msgID)
	if err != nil || msg == nil {
		t.Fatalf("Find: err=%v msg=%v", err, msg)
	}

	newContent, _ := json.Marshal(map[string]string{"text": "edited content"})
	if err := msg.Edit(json.RawMessage(newContent), time.Now().UTC()); err != nil {
		t.Fatalf("Edit: %v", err)
	}
	if err := repo.Save(context.Background(), msg); err != nil {
		t.Fatalf("Save after Edit: %v", err)
	}

	var editedAt sql.NullTime
	var storedContent []byte
	_ = db.QueryRowContext(context.Background(),
		`SELECT edited_at, content FROM messages WHERE id = $1`, msgID,
	).Scan(&editedAt, &storedContent)
	if !editedAt.Valid {
		t.Error("expected edited_at to be set after Edit")
	}
}
