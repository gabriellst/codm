package whatsapp

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	"google.golang.org/protobuf/proto"

	_ "modernc.org/sqlite"
)

func newMsgDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { db.Close() })
	_, err = db.Exec(`CREATE TABLE gateway_messages (id TEXT PRIMARY KEY, channel_id TEXT NOT NULL,
		platform_message_id TEXT NOT NULL, content TEXT NOT NULL)`)
	if err != nil {
		t.Fatal(err)
	}
	return db
}

func insertMsg(t *testing.T, db *sql.DB, content string) {
	t.Helper()
	if _, err := db.Exec(`INSERT INTO gateway_messages VALUES ('row1','chan','MSG1',?)`, content); err != nil {
		t.Fatal(err)
	}
}

func readContent(t *testing.T, db *sql.DB) map[string]map[string]any {
	t.Helper()
	var raw string
	if err := db.QueryRow(`SELECT content FROM gateway_messages WHERE id='row1'`).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var out map[string]map[string]any
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func noSleep(time.Duration) {}

func TestPatchMediaPath_FillsMediaPathKeepingOtherFields(t *testing.T) {
	db := newMsgDB(t)
	insertMsg(t, db, `{"imageMessage":{"caption":"oi","mimetype":"image/jpeg"}}`)
	if err := patchMediaPath(context.Background(), db, "chan", "MSG1", "imageMessage", "/data/media/abc.jpg", noSleep); err != nil {
		t.Fatal(err)
	}
	img := readContent(t, db)["imageMessage"]
	if img["mediaPath"] != "/data/media/abc.jpg" || img["caption"] != "oi" || img["mimetype"] != "image/jpeg" {
		t.Fatalf("content = %v", img)
	}
}

func TestPatchMediaPath_DoesNotOverwriteExisting(t *testing.T) {
	db := newMsgDB(t)
	insertMsg(t, db, `{"audioMessage":{"mediaPath":"/first.ogg"}}`)
	if err := patchMediaPath(context.Background(), db, "chan", "MSG1", "audioMessage", "/second.ogg", noSleep); err != nil {
		t.Fatal(err)
	}
	if got := readContent(t, db)["audioMessage"]["mediaPath"]; got != "/first.ogg" {
		t.Fatalf("mediaPath = %v, want the first one kept", got)
	}
}

func TestPatchMediaPath_WaitsForRowThatAppearsLate(t *testing.T) {
	db := newMsgDB(t)
	sleeps := 0
	sleep := func(time.Duration) {
		sleeps++
		if sleeps == 2 { // the projector finally writes the row
			insertMsg(t, db, `{"videoMessage":{"seconds":3}}`)
		}
	}
	if err := patchMediaPath(context.Background(), db, "chan", "MSG1", "videoMessage", "/v.mp4", sleep); err != nil {
		t.Fatal(err)
	}
	if sleeps != 2 || readContent(t, db)["videoMessage"]["mediaPath"] != "/v.mp4" {
		t.Fatalf("sleeps=%d content=%v", sleeps, readContent(t, db))
	}
}

func TestPatchMediaPath_GivesUpWhenRowNeverAppears(t *testing.T) {
	db := newMsgDB(t)
	sleeps := 0
	err := patchMediaPath(context.Background(), db, "chan", "MSG1", "imageMessage", "/x.jpg", func(time.Duration) { sleeps++ })
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("err = %v, want sql.ErrNoRows", err)
	}
	if sleeps != patchAttempts-1 {
		t.Fatalf("sleeps = %d, want %d", sleeps, patchAttempts-1)
	}
}

func TestPatchMediaPath_OtherChannelOrMessageUntouched(t *testing.T) {
	db := newMsgDB(t)
	insertMsg(t, db, `{"imageMessage":{}}`)
	_ = patchMediaPath(context.Background(), db, "other-chan", "MSG1", "imageMessage", "/x.jpg", noSleep)
	_ = patchMediaPath(context.Background(), db, "chan", "OTHER", "imageMessage", "/x.jpg", noSleep)
	if _, has := readContent(t, db)["imageMessage"]["mediaPath"]; has {
		t.Fatal("row for a different channel/message was patched")
	}
}

func TestPatchMediaPath_StopsWhenContextCancelled(t *testing.T) {
	db := newMsgDB(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := patchMediaPath(ctx, db, "chan", "MSG1", "imageMessage", "/x.jpg", noSleep); err == nil {
		t.Fatal("want an error once the channel is stopped")
	}
}

func msgEvent(chat types.JID, sender types.JID, fromMe bool) *events.Message {
	return &events.Message{
		Info:    types.MessageInfo{MessageSource: types.MessageSource{Chat: chat, Sender: sender, IsFromMe: fromMe}, ID: "MSG1"},
		Message: &waE2E.Message{ImageMessage: &waE2E.ImageMessage{Mimetype: proto.String("image/jpeg"), FileLength: proto.Uint64(10)}},
	}
}

func TestShouldFetchInboundMedia(t *testing.T) {
	own := types.NewADJID("558500000001", 0, 29)
	group := types.NewJID("120363000000000000", types.GroupServer)
	friend := types.NewJID("558500000002", types.DefaultUserServer)
	phone := types.NewJID("558500000001", types.DefaultUserServer) // owner's phone: device 0

	cases := []struct {
		name string
		ev   *events.Message
		want bool
	}{
		{"group image from someone else", msgEvent(group, friend, false), true},
		{"newsletter is skipped", msgEvent(types.NewJID("120363000000000099", types.NewsletterServer), types.NewJID("120363000000000099", types.NewsletterServer), false), false},
		{"status broadcast is skipped", msgEvent(types.StatusBroadcastJID, friend, false), false},
		{"echo of this bridge's own send is skipped", msgEvent(friend, own, true), false},
		{"media the owner sent from the phone is fetched", msgEvent(friend, phone, true), true},
	}
	for _, tc := range cases {
		if got := shouldFetchInboundMedia(tc.ev, &own); got != tc.want {
			t.Errorf("%s: got %v, want %v", tc.name, got, tc.want)
		}
	}
	if !shouldFetchInboundMedia(msgEvent(friend, own, true), nil) {
		t.Error("without a known own JID nothing is treated as an echo")
	}
}

func TestInboundMedia_KeyMatchesMapperContentKey(t *testing.T) {
	cases := map[string]*waE2E.Message{
		"imageMessage":    {ImageMessage: &waE2E.ImageMessage{}},
		"videoMessage":    {VideoMessage: &waE2E.VideoMessage{}},
		"audioMessage":    {AudioMessage: &waE2E.AudioMessage{}},
		"documentMessage": {DocumentMessage: &waE2E.DocumentMessage{}},
		"stickerMessage":  {StickerMessage: &waE2E.StickerMessage{}},
	}
	for want, msg := range cases {
		dl, key, _, _ := inboundMedia(msg)
		if dl == nil || key != want {
			t.Errorf("key = %q (dl nil=%v), want %q", key, dl == nil, want)
		}
	}
	if dl, _, _, _ := inboundMedia(&waE2E.Message{Conversation: proto.String("oi")}); dl != nil {
		t.Error("text message must have no media")
	}
	if dl, _, _, _ := inboundMedia(nil); dl != nil {
		t.Error("nil message must have no media")
	}
}
