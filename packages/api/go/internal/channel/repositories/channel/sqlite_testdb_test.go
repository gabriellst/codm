package channel

import (
	"testing"

	"template/core-go/db/sqlite"
)

// newChannelSqliteStore boots a real SqliteStore in a t.TempDir(): it mkdirs the
// data dir, opens WAL with busy_timeout + _txlock=immediate, applies the
// //go:embed drizzle migrations and takes the single-instance lock — the same
// constructor production uses, so what passes here passes against the real
// shared store.
//
// No Docker, no CHANNEL_TEST_DATABASE_URL, no skip: unlike the Postgres harness
// this replaces (isolated schema + ApplySchema + advisory lock), the SQLite store
// is in-process, so these tests ALWAYS run. They are the correctness guard for
// the hand-written SQL, so they must never silently skip.
func newChannelSqliteStore(t *testing.T) *sqlite.SqliteStore {
	t.Helper()
	store, err := sqlite.NewSqliteStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewSqliteStore: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	return store
}
