package message

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	channelenums "template/api-go/internal/channel/enums"
	"template/api-go/internal/channel/projections"
	"template/core-go/db/dbutil"
	"template/core-go/db/sqlite"
)

// newMessageSqliteStore boots a real SqliteStore in a t.TempDir() (WAL,
// busy_timeout, _txlock=immediate, //go:embed drizzle migrations, single-instance
// lock) — the same constructor production uses.
//
// Unlike the Postgres harness this replaces, there is no CHANNEL_TEST_DATABASE_URL
// and no t.Skip: the store is in-process, so these tests ALWAYS run. They are the
// correctness guard for the hand-written SQL and must never silently skip.
func newMessageSqliteStore(t *testing.T) *sqlite.SqliteStore {
	t.Helper()
	store, err := sqlite.NewSqliteStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewSqliteStore: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	return store
}

// seedSqliteMessageRow inserts a gateway_messages row directly, bypassing the
// repositories, so Find has something to read that no write path produced.
//
// direction and platform MUST be valid enum values: unlike the pg schema, the
// SQLite contract enforces them with CHECK constraints
// (gateway_messages_direction_check / _platform_check).
func seedSqliteMessageRow(t *testing.T, store *sqlite.SqliteStore, id, channelID, remoteID, platformMsgID string) {
	t.Helper()
	now := dbutil.Millis(time.Now())
	_, err := store.DB().ExecContext(context.Background(),
		`INSERT INTO gateway_messages
		   (id, channel_id, remote_id, platform_message_id, direction, platform,
		    sender_remote_id, content, occurred_at, observed_at, version)
		 VALUES (?,?,?,?,'RECEIVED','WHATSAPP','sender@s.whatsapp.net','{"text":"hello"}',?,?,1)
		 ON CONFLICT(id) DO NOTHING`,
		id, channelID, remoteID, platformMsgID, now, now,
	)
	if err != nil {
		t.Fatalf("seedSqliteMessageRow: %v", err)
	}
}

// makeSqliteMessageProjection builds a Message read-model record.
//
// Platform is set explicitly (the pg helper left it empty): the SQLite schema
// CHECKs it against ('WHATSAPP','INTERNAL'), so an empty platform is a constraint
// violation rather than a silently-stored blank.
//
// Timestamps are truncated to milliseconds because that is the resolution the
// INTEGER timestamp_ms columns store — an untruncated time.Time would not
// round-trip equal.
func makeSqliteMessageProjection(id, channelID, remoteID, platformMsgID string) *projections.Message {
	now := time.Now().UTC().Truncate(time.Millisecond)
	content, _ := json.Marshal(map[string]string{"text": "hello world"})
	return &projections.Message{
		ID:                id,
		ChannelID:         channelID,
		RemoteID:          remoteID,
		PlatformMessageID: platformMsgID,
		Direction:         string(channelenums.DirectionReceived),
		Platform:          channelenums.PlatformWhatsApp,
		SenderRemoteID:    "6281234@s.whatsapp.net",
		Content:           json.RawMessage(content),
		OccurredAt:        now,
		ObservedAt:        now,
		Version:           1,
	}
}
