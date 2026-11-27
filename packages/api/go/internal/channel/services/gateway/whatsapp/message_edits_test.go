package whatsapp

import (
	"context"
	"database/sql"
	"encoding/json"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"
	"go.mau.fi/whatsmeow/proto/waCommon"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	"google.golang.org/protobuf/proto"

	mapperpkg "template/api-go/internal/channel/services/gateway/whatsapp/mapper"
)

var editChannel = uuid.MustParse("00000000-0000-0000-0000-0000000000aa")

func editTestDB(t *testing.T, withCols bool) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", "file:"+filepath.Join(t.TempDir(), "e.db")+"?_pragma=busy_timeout(5000)")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	extra := ""
	if withCols {
		extra = ", edited_at INTEGER, version INTEGER NOT NULL DEFAULT 1"
	}
	if _, err := db.Exec(`CREATE TABLE gateway_messages (id TEXT PRIMARY KEY, channel_id TEXT, remote_id TEXT,
		platform_message_id TEXT, content TEXT, occurred_at INTEGER, observed_at INTEGER` + extra + `)`); err != nil {
		t.Fatal(err)
	}
	if err := EnsureEditSchema(context.Background(), db); err != nil {
		t.Fatal(err)
	}
	return db
}

func insertOriginal(t *testing.T, db *sql.DB, pid, content string) {
	t.Helper()
	if _, err := db.Exec(`INSERT INTO gateway_messages (id, channel_id, remote_id, platform_message_id, content, occurred_at, observed_at)
		VALUES (?, ?, 'g1@g.us', ?, ?, 1000, 1001)`, uuid.NewString(), editChannel.String(), pid, content); err != nil {
		t.Fatal(err)
	}
}

func edit(pid, text string, at int64) mapperpkg.MessageEdit {
	c, _ := json.Marshal(map[string]string{"text": text})
	return mapperpkg.MessageEdit{TargetID: pid, RemoteID: "g1@g.us", MessageType: "TEXT", Content: c, EditedAt: time.UnixMilli(at)}
}

type rowState struct {
	content  string
	editedAt sql.NullInt64
	version  int64
}

func readRow(t *testing.T, db *sql.DB, pid string) rowState {
	t.Helper()
	var r rowState
	if err := db.QueryRow(`SELECT content, edited_at, version FROM gateway_messages WHERE platform_message_id = ?`, pid).
		Scan(&r.content, &r.editedAt, &r.version); err != nil {
		t.Fatal(err)
	}
	return r
}

func revisions(t *testing.T, db *sql.DB, pid string) []struct {
	version int64
	found   int
} {
	t.Helper()
	rows, err := db.Query(`SELECT version, found_original FROM gateway_message_revisions WHERE message_id = ? ORDER BY version`, pid)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []struct {
		version int64
		found   int
	}
	for rows.Next() {
		var v struct {
			version int64
			found   int
		}
		_ = rows.Scan(&v.version, &v.found)
		out = append(out, v)
	}
	return out
}

func TestEditOfExistingMessageUpdatesRowAndKeepsRevisions(t *testing.T) {
	db := editTestDB(t, true)
	ctx := context.Background()
	insertOriginal(t, db, "P1", `{"text":"✻"}`)

	res, err := ApplyMessageEdit(ctx, db, editChannel, edit("P1", "pronto: PR #12", 5000))
	if err != nil || !res.FoundOriginal || res.Version != 2 {
		t.Fatalf("first edit: %+v %v", res, err)
	}
	r := readRow(t, db, "P1")
	if r.content != `{"text":"pronto: PR #12"}` || r.editedAt.Int64 != 5000 || r.version != 2 {
		t.Fatalf("row after edit: %+v", r)
	}
	// redelivery of the same edit is a no-op
	if res, _ := ApplyMessageEdit(ctx, db, editChannel, edit("P1", "pronto: PR #12", 5000)); !res.Duplicate {
		t.Fatal("redelivered edit should be a duplicate")
	}
	// a second edit bumps again
	if res, _ := ApplyMessageEdit(ctx, db, editChannel, edit("P1", "pronto: PR #13", 6000)); res.Version != 3 {
		t.Fatalf("second edit version: %+v", res)
	}
	revs := revisions(t, db, "P1")
	if len(revs) != 2 || revs[0].version != 2 || revs[1].version != 3 || revs[0].found != 1 {
		t.Fatalf("revisions: %+v", revs)
	}
	// reconciling the OLDER edit must not override the newer one
	if changed, _ := ReconcileEdit(ctx, db, editChannel, edit("P1", "pronto: PR #12", 5000)); changed {
		t.Fatal("older edit overrode a newer one")
	}
	if r := readRow(t, db, "P1"); r.content != `{"text":"pronto: PR #13"}` || r.version != 3 {
		t.Fatalf("row after reconcile: %+v", r)
	}
}

func TestEditOfMissingMessageIsKeptThenReconciled(t *testing.T) {
	db := editTestDB(t, true)
	ctx := context.Background()
	res, err := ApplyMessageEdit(ctx, db, editChannel, edit("P9", "texto final", 7000))
	if err != nil || res.FoundOriginal || res.Version != 2 {
		t.Fatalf("edit of missing: %+v %v", res, err)
	}
	if revs := revisions(t, db, "P9"); len(revs) != 1 || revs[0].found != 0 {
		t.Fatalf("revision of missing original: %+v", revs)
	}
	// the original is projected late, still with the placeholder
	insertOriginal(t, db, "P9", `{"text":"✻"}`)
	changed, err := ReconcileEdit(ctx, db, editChannel, edit("P9", "texto final", 7000))
	if err != nil || !changed {
		t.Fatalf("reconcile: %v %v", changed, err)
	}
	if r := readRow(t, db, "P9"); r.content != `{"text":"texto final"}` || r.editedAt.Int64 != 7000 || r.version != 2 {
		t.Fatalf("row after late reconcile: %+v", r)
	}
	if revs := revisions(t, db, "P9"); revs[0].found != 1 {
		t.Fatalf("revision not marked found: %+v", revs)
	}
	// running it again changes nothing
	if changed, _ := ReconcileEdit(ctx, db, editChannel, edit("P9", "texto final", 7000)); changed {
		t.Fatal("reconcile is not idempotent")
	}
}

func TestEnsureEditSchemaIsAdditiveAndIdempotent(t *testing.T) {
	db := editTestDB(t, false) // table WITHOUT edited_at/version → columns added
	insertOriginal(t, db, "P1", `{"text":"a"}`)
	for i := 0; i < 2; i++ {
		if err := EnsureEditSchema(context.Background(), db); err != nil {
			t.Fatal(err)
		}
	}
	if r := readRow(t, db, "P1"); r.content != `{"text":"a"}` || r.version != 1 || r.editedAt.Valid {
		t.Fatalf("existing data changed: %+v", r)
	}
}

func TestChannelHandleEditStoresEditAndSkipsNonEdits(t *testing.T) {
	db := editTestDB(t, true)
	insertOriginal(t, db, "P5", `{"text":"✻"}`)
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // reconcile goroutine exits immediately
	c := &WhatsmeowChannel{db: db, instanceID: editChannel, stopCtx: ctx}
	ev := &events.Message{
		Info: types.MessageInfo{MessageSource: types.MessageSource{Chat: types.NewJID("g1", types.GroupServer), IsGroup: true}},
		Message: &waE2E.Message{ProtocolMessage: &waE2E.ProtocolMessage{
			Type:          waE2E.ProtocolMessage_MESSAGE_EDIT.Enum(),
			Key:           &waCommon.MessageKey{ID: proto.String("P5")},
			EditedMessage: &waE2E.Message{Conversation: proto.String("feito")},
			TimestampMS:   proto.Int64(9000),
		}},
	}
	if !c.handleEdit(ev) {
		t.Fatal("edit not handled")
	}
	if r := readRow(t, db, "P5"); r.version != 2 || r.editedAt.Int64 != 9000 {
		t.Fatalf("row: %+v", r)
	}
	if c.handleEdit(&events.Message{Message: &waE2E.Message{Conversation: proto.String("oi")}}) {
		t.Fatal("plain message treated as edit")
	}
}
