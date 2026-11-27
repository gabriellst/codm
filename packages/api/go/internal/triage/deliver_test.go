package triage

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"template/contracts-go/wire"
)

type stubEvent struct{}

func (stubEvent) GetEventName() string { return wire.ChannelMessageReceivedEventName }
func (stubEvent) GetOwnerID() string   { return "o" }

type hookRecorder struct {
	mu      sync.Mutex
	events  []string
	bodies  [][]byte
	hasSign bool
}

func (h *hookRecorder) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	b, _ := io.ReadAll(r.Body)
	h.mu.Lock()
	h.events = append(h.events, r.Header.Get("X-Codm-Event"))
	h.bodies = append(h.bodies, b)
	h.hasSign = r.Header.Get("X-Codm-Signature") != "" && r.Header.Get("X-Hub-Signature-256") != ""
	h.mu.Unlock()
	w.WriteHeader(204)
}

func (h *hookRecorder) count() int { h.mu.Lock(); defer h.mu.Unlock(); return len(h.events) }

func newTestForwarder(t *testing.T, cfg *Config, rec *hookRecorder) *WebhookForwarder {
	t.Helper()
	srv := httptest.NewServer(rec)
	t.Cleanup(srv.Close)
	cfg.WebhookURL, cfg.WebhookSecret = srv.URL, "s3cret"
	db := openTestDB(t)
	w := &WebhookForwarder{cfg: cfg, client: srv.Client(), filter: NewChatFilter(cfg, db)}
	w.recheck = newArchiveRecheck(cfg.ArchiveRecheck, w.filter)
	if cfg.DebounceQuiet > 0 {
		b, err := newTestBatcher(t, db, cfg.DebounceQuiet, cfg.DebounceMaxWait, w.postBatch)
		if err != nil {
			t.Fatal(err)
		}
		w.batcher = b
	}
	if _, err := db.Exec(`INSERT INTO gateway_remotes (channel_id, remote_id, name) VALUES ('00000000-0000-0000-0000-000000000000', ?, 'Grupo A')`, chatA.ChatJID); err != nil {
		t.Fatal(err)
	}
	return w
}

func payload(id, text string) wire.ChannelMessageReceivedPayload {
	c, _ := json.Marshal(map[string]string{"text": text})
	return wire.ChannelMessageReceivedPayload{
		MessageID: id, RemoteID: chatA.ChatJID, SenderID: "558399@s.whatsapp.net", IsGroup: true,
		Timestamp: 111, MessageType: "TEXT", Content: c,
		PlatformData: json.RawMessage(`{"pushName":"Ana Push"}`),
	}
}

// Default (debounce off) must be exactly the old behaviour: one signed
// per-message webhook, original event name, immediately.
func TestDeliverDefaultIsOneWebhookPerMessage(t *testing.T) {
	rec := &hookRecorder{}
	w := newTestForwarder(t, &Config{}, rec)
	if w.batcher != nil {
		t.Fatal("no batcher without WEBHOOK_DEBOUNCE_SECONDS")
	}
	for _, id := range []string{"m1", "m2"} {
		if err := w.deliver(context.Background(), stubEvent{}, payload(id, "oi"), chatA.ChatJID, "558399@s.whatsapp.net"); err != nil {
			t.Fatal(err)
		}
	}
	if rec.count() != 2 || rec.events[0] != wire.ChannelMessageReceivedEventName || !rec.hasSign {
		t.Fatalf("events=%v signed=%v", rec.events, rec.hasSign)
	}
	var b webhookBody
	_ = json.Unmarshal(rec.bodies[0], &b)
	if b.MessageID != "m1" || b.Text != "oi" || b.ChatJID != chatA.ChatJID || !b.IsGroup {
		t.Fatalf("per-message body changed: %+v", b)
	}
}

func TestDeliverWithDebounceSendsOneSignedBatch(t *testing.T) {
	rec := &hookRecorder{}
	w := newTestForwarder(t, &Config{DebounceQuiet: 100 * time.Millisecond, DebounceMaxWait: 5 * time.Second}, rec)
	for _, id := range []string{"m1", "m2", "m3"} {
		if err := w.deliver(context.Background(), stubEvent{}, payload(id, "msg "+id), chatA.ChatJID, "558399@s.whatsapp.net"); err != nil {
			t.Fatal(err)
		}
	}
	if rec.count() != 0 {
		t.Fatal("no webhook before the quiet period")
	}
	waitFor(t, "batch", func() bool { return rec.count() == 1 })
	time.Sleep(250 * time.Millisecond)
	if rec.count() != 1 || rec.events[0] != BatchEventName || !rec.hasSign {
		t.Fatalf("events=%v signed=%v", rec.events, rec.hasSign)
	}
	var b BatchBody
	if err := json.Unmarshal(rec.bodies[0], &b); err != nil {
		t.Fatal(err)
	}
	if !b.Batch || b.Count != 3 || b.ChatName != "Grupo A" || !b.IsGroup || b.Messages[0].Text != "msg m1" ||
		b.Messages[0].SenderName != "Ana Push" || b.Messages[2].MessageID != "m3" || b.Messages[0].MessageType != "TEXT" {
		t.Fatalf("bad batch: %s", rec.bodies[0])
	}
}

func TestFilterSkipsBeforeDeliver(t *testing.T) {
	rec := &hookRecorder{}
	cfg := &Config{Denylist: parseAllowlist(chatA.ChatJID), SkipArchived: true}
	w := newTestForwarder(t, cfg, rec)
	if got := w.filter.Skip(context.Background(), chatA.ChatJID, chatA.ChatJID); got != "denylist" {
		t.Fatalf("got %q", got)
	}
}
