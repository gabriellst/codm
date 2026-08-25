package remote

import (
	"context"
	"errors"
	"testing"
	"time"

	channelenums "template/api-go/internal/channel/enums"
	"template/api-go/internal/channel/projections"
	"template/core-go/db/dbutil"
	"template/core-go/db/sqlite"
	"template/core-go/services/unitofwork"
)

// errAbortUnit is the sentinel a unit-of-work test closure returns to force a
// rollback without pretending a real failure occurred.
var errAbortUnit = errors.New("abort unit of work")

// newSqliteTestUnitOfWork wires the production SqliteUnitOfWork over the test
// store (nil notifier — no outbox dispatcher is running in these tests), so
// repository writes can be checked for actually joining the ambient transaction.
func newSqliteTestUnitOfWork(store *sqlite.SqliteStore) *unitofwork.SqliteUnitOfWork {
	return unitofwork.NewSqliteUnitOfWork(store.DB(), nil)
}

// newRemoteSqliteStore boots a real SqliteStore in a t.TempDir() (WAL,
// busy_timeout, _txlock=immediate, //go:embed drizzle migrations, single-instance
// lock) — the same constructor production uses.
//
// Unlike the Postgres harness this replaces, there is no CHANNEL_TEST_DATABASE_URL
// and no t.Skip: the store is in-process, so these tests ALWAYS run. They are the
// correctness guard for the hand-written SQL and must never silently skip.
func newRemoteSqliteStore(t *testing.T) *sqlite.SqliteStore {
	t.Helper()
	store, err := sqlite.NewSqliteStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewSqliteStore: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	return store
}

// seedSqliteChannel inserts a gateway_channels row so SqliteRemoteRepository.Find
// can recover owner_id through its LEFT JOIN.
//
// platform/status MUST be valid enum values: the SQLite contract enforces them
// with CHECK constraints, which the pg schema did not.
func seedSqliteChannel(t *testing.T, store *sqlite.SqliteStore, channelID, ownerID string) {
	t.Helper()
	now := dbutil.Millis(time.Now())
	_, err := store.DB().ExecContext(context.Background(),
		`INSERT INTO gateway_channels (id, owner_id, platform, name, credentials, status, created_at, updated_at, version)
		 VALUES (?,?,'WHATSAPP',?,'{}','CREATED',?,?,1)
		 ON CONFLICT(id) DO NOTHING`,
		channelID, ownerID, "test-"+channelID, now, now,
	)
	if err != nil {
		t.Fatalf("seedSqliteChannel: %v", err)
	}
}

// seedSqliteRemote inserts a minimal gateway_remotes row so Find can read the
// invariant columns without going through Save.
func seedSqliteRemote(t *testing.T, store *sqlite.SqliteStore, channelID, remoteID string, rt channelenums.RemoteType) {
	t.Helper()
	now := dbutil.Millis(time.Now())
	_, err := store.DB().ExecContext(context.Background(),
		`INSERT INTO gateway_remotes
		   (channel_id, remote_id, type, platform, name, created_at, updated_at, version)
		 VALUES (?,?,?,'WHATSAPP','',?,?,1)
		 ON CONFLICT(channel_id, remote_id) DO NOTHING`,
		channelID, remoteID, string(rt), now, now,
	)
	if err != nil {
		t.Fatalf("seedSqliteRemote: %v", err)
	}
}

// seedSqliteMessage inserts a gateway_messages row directly, for the preview
// recompute/backfill tests that need precise control over occurred_at and
// deleted_at.
func seedSqliteMessage(
	t *testing.T, store *sqlite.SqliteStore,
	id, channelID, remoteID, platformMsgID string, occurredAt time.Time,
) {
	t.Helper()
	ms := dbutil.Millis(occurredAt)
	_, err := store.DB().ExecContext(context.Background(),
		`INSERT INTO gateway_messages
		   (id, channel_id, remote_id, platform_message_id, direction, platform,
		    sender_remote_id, content, occurred_at, observed_at, version)
		 VALUES (?,?,?,?,'RECEIVED','WHATSAPP',?,'{"type":"TEXT","text":"x"}',?,?,1)`,
		id, channelID, remoteID, platformMsgID, remoteID, ms, ms,
	)
	if err != nil {
		t.Fatalf("seedSqliteMessage: %v", err)
	}
}

// softDeleteSqliteMessage stamps deleted_at on a message row (the pg test used
// NOW(); SQLite takes a bound unix-millis).
func softDeleteSqliteMessage(t *testing.T, store *sqlite.SqliteStore, id string) {
	t.Helper()
	if _, err := store.DB().ExecContext(context.Background(),
		`UPDATE gateway_messages SET deleted_at = ? WHERE id = ?`,
		dbutil.Millis(time.Now()), id,
	); err != nil {
		t.Fatalf("softDeleteSqliteMessage: %v", err)
	}
}

// countSqliteMemberships counts membership rows for a group.
func countSqliteMemberships(t *testing.T, store *sqlite.SqliteStore, channelID, groupID string) int {
	t.Helper()
	var n int
	if err := store.DB().QueryRowContext(context.Background(),
		`SELECT COUNT(*) FROM gateway_remote_memberships WHERE channel_id = ? AND group_id = ?`,
		channelID, groupID,
	).Scan(&n); err != nil {
		t.Fatalf("countSqliteMemberships: %v", err)
	}
	return n
}

// makeSqliteRemoteProjection builds a Remote read-model record.
//
// Platform and Type are set explicitly because the SQLite schema CHECKs both
// (gateway_remotes_platform_check / _type_check). Timestamps are truncated to
// milliseconds — the resolution of the INTEGER timestamp_ms columns.
func makeSqliteRemoteProjection(channelID, remoteID string, rt channelenums.RemoteType) *projections.Remote {
	now := time.Now().UTC().Truncate(time.Millisecond)
	return &projections.Remote{
		ChannelID: channelID,
		RemoteID:  remoteID,
		Type:      string(rt),
		Platform:  channelenums.PlatformWhatsApp,
		Name:      "Test Remote",
		AvatarURL: "https://example.com/avatar.jpg",
		IsBlocked: false,
		CreatedAt: now,
		UpdatedAt: now,
		Version:   1,
	}
}
