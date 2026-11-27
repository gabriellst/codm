package triage

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

func openTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", "file:"+filepath.Join(t.TempDir(), "t.db")+"?_pragma=busy_timeout(5000)")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	for _, q := range []string{
		`CREATE TABLE whatsmeow_chat_settings (our_jid TEXT, chat_jid TEXT, muted_until BIGINT NOT NULL DEFAULT 0, pinned BOOLEAN NOT NULL DEFAULT false, archived BOOLEAN NOT NULL DEFAULT false, wasa_root_secret_id TEXT NOT NULL DEFAULT '', PRIMARY KEY (our_jid, chat_jid))`,
		`CREATE TABLE whatsmeow_lid_map (lid TEXT PRIMARY KEY, pn TEXT NOT NULL UNIQUE)`,
		`CREATE TABLE whatsmeow_contacts (our_jid TEXT, their_jid TEXT, first_name TEXT, full_name TEXT, push_name TEXT, business_name TEXT, redacted_phone TEXT, PRIMARY KEY (our_jid, their_jid))`,
		`CREATE TABLE gateway_remotes (channel_id TEXT, remote_id TEXT, name TEXT NOT NULL DEFAULT '', PRIMARY KEY (channel_id, remote_id))`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	return db
}

func setArchived(t *testing.T, db *sql.DB, jid string, archived bool) {
	t.Helper()
	if _, err := db.Exec(`INSERT INTO whatsmeow_chat_settings (our_jid, chat_jid, archived) VALUES ('me', ?, ?)
		ON CONFLICT(our_jid, chat_jid) DO UPDATE SET archived = excluded.archived`, jid, archived); err != nil {
		t.Fatal(err)
	}
}

func testFilter(t *testing.T, cfg *Config) (*ChatFilter, *sql.DB, *time.Time) {
	t.Helper()
	db := openTestDB(t)
	f := NewChatFilter(cfg, db)
	clock := time.Unix(1_700_000_000, 0)
	f.now = func() time.Time { return clock }
	return f, db, &clock
}

const (
	bkGroup  = "120363000000000077@g.us"
	normalGp = "120363000000000001@g.us"
	dmPN     = "558500000003@s.whatsapp.net"
	dmLID    = "100000000000001@lid"
)

func TestLoadConfigDefaultsKeepPerMessageBehaviour(t *testing.T) {
	for _, k := range []string{"DENYLIST_JIDS", "SKIP_ARCHIVED_CHATS", "WEBHOOK_DEBOUNCE_SECONDS", "WEBHOOK_DEBOUNCE_MAX_WAIT_SECONDS", "ARCHIVE_RECHECK_SECONDS"} {
		t.Setenv(k, "")
	}
	c := LoadConfig()
	if c.DebounceQuiet != 0 || c.SkipArchived || len(c.Denylist) != 0 {
		t.Fatalf("defaults must be off: quiet=%v skipArchived=%v deny=%d", c.DebounceQuiet, c.SkipArchived, len(c.Denylist))
	}
	if c.DebounceMaxWait != 15*time.Minute || c.ArchiveRecheck != 20*time.Second {
		t.Fatalf("unexpected default timings: %v %v", c.DebounceMaxWait, c.ArchiveRecheck)
	}
}

func TestLoadConfigParsesNewEnv(t *testing.T) {
	t.Setenv("DENYLIST_JIDS", bkGroup+", 558500000003")
	t.Setenv("SKIP_ARCHIVED_CHATS", "true")
	t.Setenv("WEBHOOK_DEBOUNCE_SECONDS", "300")
	t.Setenv("WEBHOOK_DEBOUNCE_MAX_WAIT_SECONDS", "-4") // invalid → default
	c := LoadConfig()
	if !c.Denylist[bkGroup] || !c.Denylist[dmPN] || !c.SkipArchived || c.DebounceQuiet != 300*time.Second || c.DebounceMaxWait != 900*time.Second {
		t.Fatalf("bad parse: %+v", c)
	}
}

func TestSkipServerNewsletterAndBroadcast(t *testing.T) {
	for _, j := range []string{"120363000000000099@newsletter", "status@broadcast", "12345@broadcast"} {
		if !skipServer(j) {
			t.Fatalf("%s must be skipped", j)
		}
	}
	for _, j := range []string{bkGroup, dmPN, dmLID, ""} {
		if skipServer(j) {
			t.Fatalf("%q must not be skipped by server", j)
		}
	}
}

func TestDenylistMatchesChatAndAliasesNotSender(t *testing.T) {
	cfg := &Config{Denylist: parseAllowlist(bkGroup + "," + dmLID)}
	f, db, _ := testFilter(t, cfg)
	if _, err := db.Exec(`INSERT INTO whatsmeow_lid_map (lid, pn) VALUES ('100000000000001', '558500000003')`); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if !f.Denied(ctx, bkGroup) {
		t.Fatal("BK group must be denied")
	}
	if !f.Denied(ctx, dmPN) {
		t.Fatal("PN alias of a denied LID must be denied")
	}
	if f.Denied(ctx, normalGp) || f.Denied(ctx, "558399999999@s.whatsapp.net") {
		t.Fatal("unlisted chats must pass")
	}
	if got := f.Skip(ctx, "120363000000000099@newsletter"); got != "server" {
		t.Fatalf("newsletter reason = %q", got)
	}
	if got := f.Skip(ctx, bkGroup); got != "denylist" {
		t.Fatalf("deny reason = %q", got)
	}
	if got := f.Skip(ctx, normalGp); got != "" {
		t.Fatalf("normal chat reason = %q", got)
	}
}

func TestEmptyDenylistDeniesNothing(t *testing.T) {
	f, _, _ := testFilter(t, &Config{Denylist: map[string]bool{}})
	if f.Denied(context.Background(), bkGroup) {
		t.Fatal("empty denylist must not deny")
	}
}

func TestArchivedLiveViaLIDAndPNAliasesWithCache(t *testing.T) {
	cfg := &Config{SkipArchived: true}
	f, db, clock := testFilter(t, cfg)
	ctx := context.Background()
	if _, err := db.Exec(`INSERT INTO whatsmeow_lid_map (lid, pn) VALUES ('100000000000001', '558500000003')`); err != nil {
		t.Fatal(err)
	}
	// Settings are keyed by LID; the gateway message arrives keyed by phone number.
	setArchived(t, db, dmLID, true)
	setArchived(t, db, normalGp, false)
	setArchived(t, db, bkGroup, true)

	if got := f.Skip(ctx, dmPN); got != "archived" {
		t.Fatalf("PN of an archived LID chat must be skipped, got %q", got)
	}
	if got := f.Skip(ctx, normalGp); got != "" {
		t.Fatalf("unarchived group reason = %q", got)
	}
	if got := f.Skip(ctx, "558300000000@s.whatsapp.net"); got != "" {
		t.Fatalf("chat without settings row must pass, got %q", got)
	}

	// Un-archive on the phone: cached answer holds for < TTL, then flips.
	setArchived(t, db, dmLID, false)
	if !f.Archived(ctx, false, dmPN) {
		t.Fatal("answer should still be cached inside the TTL")
	}
	*clock = clock.Add(archiveCacheTTL + time.Second)
	if f.Archived(ctx, false, dmPN) {
		t.Fatal("after the TTL the live un-archive must be seen")
	}
	// fresh=true bypasses the cache immediately.
	setArchived(t, db, dmLID, true)
	if !f.Archived(ctx, true, dmPN) {
		t.Fatal("fresh lookup must see the re-archive at once")
	}
}

func TestSkipArchivedOffIgnoresArchive(t *testing.T) {
	f, db, _ := testFilter(t, &Config{SkipArchived: false})
	setArchived(t, db, normalGp, true)
	if got := f.Skip(context.Background(), normalGp); got != "" {
		t.Fatalf("archive filter is opt-in, got %q", got)
	}
}

func TestArchivedFailsOpenOnDBError(t *testing.T) {
	f, db, _ := testFilter(t, &Config{SkipArchived: true})
	if _, err := db.Exec(`DROP TABLE whatsmeow_chat_settings`); err != nil {
		t.Fatal(err)
	}
	if f.Archived(context.Background(), true, normalGp) {
		t.Fatal("a read error must never silence a chat")
	}
}

func TestArchiveRecheckForwardsOnlyIfUnarchived(t *testing.T) {
	f, db, _ := testFilter(t, &Config{SkipArchived: true})
	setArchived(t, db, normalGp, true)
	r := newArchiveRecheck(40*time.Millisecond, f)
	delivered := make(chan string, 4)

	r.schedule(normalGp, func() { delivered <- "still-archived" })
	time.Sleep(120 * time.Millisecond)
	select {
	case v := <-delivered:
		t.Fatalf("archived chat must not be forwarded, got %s", v)
	default:
	}

	// A message arrives; WhatsApp un-archives the chat right after.
	r.schedule(normalGp, func() { delivered <- "m1" })
	r.schedule(normalGp, func() { delivered <- "m2" })
	setArchived(t, db, normalGp, false)
	for _, want := range []string{"m1", "m2"} {
		select {
		case got := <-delivered:
			if got != want {
				t.Fatalf("got %s want %s", got, want)
			}
		case <-time.After(2 * time.Second):
			t.Fatalf("timed out waiting for %s", want)
		}
	}

	off := newArchiveRecheck(0, f)
	off.schedule(normalGp, func() { delivered <- "x" })
	time.Sleep(50 * time.Millisecond)
	if len(delivered) != 0 {
		t.Fatal("ARCHIVE_RECHECK_SECONDS=0 must disable the recheck")
	}
}
