package triage

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func newReadFixture(t *testing.T) (*ReadAPI, http.Handler, string) {
	t.Helper()
	db := openTestDB(t)
	for _, q := range []string{
		`CREATE TABLE IF NOT EXISTS gateway_messages (id TEXT PRIMARY KEY, channel_id TEXT, remote_id TEXT, platform_message_id TEXT,
		  direction TEXT, platform TEXT, sender_remote_id TEXT, message_type TEXT, content TEXT, occurred_at INTEGER,
		  observed_at INTEGER, delivered_at INTEGER, seen_at INTEGER, edited_at INTEGER, deleted_at INTEGER, version INTEGER)`,
		`CREATE TABLE IF NOT EXISTS triage_bridge_sends (message_id TEXT PRIMARY KEY, created_at INTEGER)`,
		`CREATE TABLE IF NOT EXISTS whatsmeow_lid_map (lid TEXT PRIMARY KEY, pn TEXT)`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	dataDir := t.TempDir()
	mediaDir := filepath.Join(dataDir, "media")
	if err := os.MkdirAll(mediaDir, 0o700); err != nil {
		t.Fatal(err)
	}
	audio := filepath.Join(mediaDir, "a.ogg")
	if err := os.WriteFile(audio, []byte("OggS-fake"), 0o600); err != nil {
		t.Fatal(err)
	}
	secret := filepath.Join(dataDir, "env")
	_ = os.WriteFile(secret, []byte("X=1"), 0o600)
	ins := `INSERT INTO gateway_messages (id, remote_id, platform_message_id, direction, sender_remote_id, message_type, content, occurred_at, observed_at) VALUES (?,?,?,?,?,?,?,?,?)`
	rows := [][]any{
		{"m1", "g1@g.us", "P1", "RECEIVED", "u1", "TEXT", `{"text":"oi"}`, 1000, 1001},
		{"m2", "g2@g.us", "P2", "SENT", "me", "TEXT", `{"text":"Nudge OFF"}`, 2000, 2001},
		{"m3", "g1@g.us", "P3", "RECEIVED", "u2", "AUDIO", `{"audioMessage":{"mediaPath":"` + audio + `","mimetype":"audio/ogg"}}`, 3000, 3001},
		{"m4", "g3@g.us", "P4", "RECEIVED", "u3", "DOCUMENT", `{"documentMessage":{"mediaPath":"` + secret + `"}}`, 4000, 4001},
	}
	for _, r := range rows {
		if _, err := db.Exec(ins, r...); err != nil {
			t.Fatal(err)
		}
	}
	_, _ = db.Exec(`INSERT INTO triage_bridge_sends VALUES ('P2', 100), ('OLD', 1)`)
	a := &ReadAPI{db: db, mediaDir: mediaDir}
	mux := http.NewServeMux()
	a.Register(mux)
	return a, mux, audio
}

func getJSON(t *testing.T, h http.Handler, url string) (int, map[string]any) {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, url, nil))
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return rec.Code, out
}

func TestReadMessagesFiltersAndPaginates(t *testing.T) {
	_, h, _ := newReadFixture(t)
	code, out := getJSON(t, h, "/read/messages?remote_id=g1@g.us,g2@g.us&since=1000&limit=2")
	if code != 200 || out["count"].(float64) != 2 || out["next_cursor"] == nil {
		t.Fatalf("page1: %d %v", code, out)
	}
	first := out["messages"].([]any)[0].(map[string]any)
	for _, k := range []string{"platform_message_id", "remote_id", "direction", "sender_remote_id", "message_type", "content", "occurred_at"} {
		if _, ok := first[k]; !ok {
			t.Fatalf("missing field %s", k)
		}
	}
	code, out = getJSON(t, h, "/read/messages?remote_id=g1@g.us&remote_id=g2@g.us&since=1000&limit=2&cursor="+out["next_cursor"].(string))
	msgs := out["messages"].([]any)
	if code != 200 || len(msgs) != 1 || msgs[0].(map[string]any)["platform_message_id"] != "P3" {
		t.Fatalf("page2: %d %v", code, out)
	}
	// stop-word style query: SENT, after watermark, case-insensitive contains
	_, out = getJSON(t, h, "/read/messages?direction=SENT&after=1500&contains=nudge%20o")
	if out["count"].(float64) != 1 {
		t.Fatalf("contains: %v", out)
	}
	if code, _ := getJSON(t, h, "/read/messages?limit=0"); code != 400 {
		t.Fatalf("limit=0 should be 400, got %d", code)
	}
}

func TestReadBridgeSent(t *testing.T) {
	_, h, _ := newReadFixture(t)
	_, out := getJSON(t, h, "/read/bridge-sent")
	if out["count"].(float64) != 2 {
		t.Fatalf("all: %v", out)
	}
	_, out = getJSON(t, h, "/read/bridge-sent?since=50")
	if ids := out["ids"].([]any); len(ids) != 1 || ids[0] != "P2" {
		t.Fatalf("since: %v", out)
	}
}

func TestMediaFileByIDAndPathStayInsideMediaDir(t *testing.T) {
	_, h, audio := newReadFixture(t)
	for _, url := range []string{"/media/file/P3", "/media/file/m3", "/media/file?path=" + audio} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, url, nil))
		body, _ := io.ReadAll(rec.Body)
		if rec.Code != 200 || string(body) != "OggS-fake" {
			t.Fatalf("%s: %d %q", url, rec.Code, body)
		}
	}
	// a stored mediaPath outside media/ (e.g. the env file) is never served
	for _, url := range []string{"/media/file/P4", "/media/file?path=" + filepath.Join(filepath.Dir(audio), "..", "env"), "/media/file/P1", "/media/file/nope"} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, url, nil))
		if rec.Code != 404 {
			t.Fatalf("%s: want 404, got %d", url, rec.Code)
		}
	}
}

func TestGateRequiresBearerOnEveryRouteAndRateLimits(t *testing.T) {
	scopes := filepath.Join(t.TempDir(), "scopes.json")
	_ = os.WriteFile(scopes, []byte(`{"scopes":[{"name":"bk-bots-supervisor","key":"sup-key","jids":["1@g.us"]}]}`), 0o600)
	t.Setenv("RATE_LIMIT_PER_MINUTE", "60")
	t.Setenv("RATE_LIMIT_BURST", "3")
	t.Setenv("AUTH_FAIL_PER_MINUTE", "2")
	cfg := &Config{APIKey: "global-key", Scopes: NewScopeStore(scopes, "global-key")}
	g := NewGate(cfg)
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) })
	h := g.Wrap(ok)
	do := func(path, tok, ip string) int {
		r := httptest.NewRequest(http.MethodGet, path, nil)
		if tok != "" {
			r.Header.Set("Authorization", "Bearer "+tok)
		}
		r.Header.Set("X-Forwarded-For", ip)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, r)
		return rec.Code
	}
	for _, p := range []string{"/triage/status", "/media/received", "/read/messages", "/send"} {
		if c := do(p, "", "10.0.0.1"); c != 401 && c != 429 {
			t.Fatalf("%s without token: %d", p, c)
		}
	}
	if c := do("/triage/status", "", "10.0.0.1"); c != 429 {
		t.Fatalf("failed-auth throttle: %d", c)
	}
	if c := do("/triage/status", "sup-key", "10.0.0.2"); c != 204 {
		t.Fatalf("scope key: %d", c)
	}
	if c := do("/triage/status", "global-key", "10.0.0.2"); c != 204 {
		t.Fatalf("global key: %d", c)
	}
	if c := do("/triage/status", "wrong", "10.0.0.3"); c != 401 {
		t.Fatalf("wrong key: %d", c)
	}
	// burst 3 for the supervisor key: one used above, two left, then 429
	got := []int{do("/x", "sup-key", "10.0.0.4"), do("/x", "sup-key", "10.0.0.4"), do("/x", "sup-key", "10.0.0.4")}
	if got[0] != 204 || got[1] != 204 || got[2] != 429 {
		t.Fatalf("per-key limit: %v", got)
	}
	g.perKey.now = func() time.Time { return time.Now().Add(2 * time.Second) }
	if c := do("/x", "sup-key", "10.0.0.4"); c != 204 {
		t.Fatalf("refill: %d", c)
	}
}
