package triage

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const (
	testGlobal = "global-key-0123456789abcdefghij"
	keyWA      = "whatsapp-key-0123456789abcdefgh"
	keyBots    = "bots-key-0123456789abcdefghijkl"
	keyNew     = "analytics-key-0123456789abcdefg"
)

func scopesDoc(extra string) string {
	s := `{"scopes":[{"name":"whatsapp","key":"` + keyWA + `","jids":["5585000000009@s.whatsapp.net"]},` +
		`{"name":"bk-bots-supervisor","key":"` + keyBots + `","jids":["g1@g.us","g2@g.us"]}`
	if extra != "" {
		s += "," + extra
	}
	return s + "]}"
}

func TestAdminPutScopesReplacesAtomically(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "scopes.json")
	if err := os.WriteFile(path, []byte(scopesDoc("")), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg := &Config{DataDir: dir, APIKey: testGlobal, ScopesFile: path, Scopes: NewScopeStore(path, testGlobal)}
	mux := http.NewServeMux()
	registerAdmin(mux, cfg, nil, nil)
	put := func(tok, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodPut, "/admin/scopes", strings.NewReader(body))
		r.Header.Set("Authorization", "Bearer "+tok)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, r)
		return rec
	}
	before, _ := os.ReadFile(path)
	newDoc := scopesDoc(`{"name":"bk-analytics-supervisor","key":"` + keyNew + `","jids":["g3@g.us"]}`)

	if rec := put(keyBots, newDoc); rec.Code != http.StatusUnauthorized {
		t.Fatalf("scope key must not replace scopes: %d", rec.Code)
	}
	bad := map[string]string{
		"not json":      `{"scopes":`,
		"empty":         `{"scopes":[]}`,
		"unknown field": `{"scopes":[{"name":"a","key":"` + keyNew + `","jids":[],"admin":true}]}`,
		"no jids":       `{"scopes":[{"name":"a","key":"` + keyNew + `"}]}`,
		"short key":     `{"scopes":[{"name":"a","key":"short","jids":["g@g.us"]}]}`,
		"bad jid":       `{"scopes":[{"name":"a","key":"` + keyNew + `","jids":["nojid"]}]}`,
		"dup name":      scopesDoc(`{"name":"whatsapp","key":"` + keyNew + `","jids":["g@g.us"]}`),
		"dup key":       scopesDoc(`{"name":"x","key":"` + keyBots + `","jids":["g@g.us"]}`),
		"bad name":      `{"scopes":[{"name":"Bad Name","key":"` + keyNew + `","jids":["g@g.us"]}]}`,
		"top level arr": `[{"name":"a","key":"` + keyNew + `","jids":["g@g.us"]}]`,
	}
	for name, body := range bad {
		if rec := put(testGlobal, body); rec.Code != http.StatusBadRequest {
			t.Fatalf("%s: got %d %s", name, rec.Code, rec.Body)
		}
	}
	if now, _ := os.ReadFile(path); !bytes.Equal(now, before) {
		t.Fatal("rejected bodies must leave scopes.json untouched")
	}

	rec := put(testGlobal, newDoc)
	if rec.Code != 200 {
		t.Fatalf("valid replace: %d %s", rec.Code, rec.Body)
	}
	if strings.Contains(rec.Body.String(), keyNew) || strings.Contains(rec.Body.String(), keyBots) {
		t.Fatal("response must not echo keys")
	}
	fi, _ := os.Stat(path)
	if fi.Mode().Perm() != 0o600 {
		t.Fatalf("scopes.json mode %v", fi.Mode().Perm())
	}
	if bak, _ := os.ReadFile(path + ".bak"); !bytes.Equal(bak, before) {
		t.Fatal(".bak should hold the previous file")
	}
	if bfi, _ := os.Stat(path + ".bak"); bfi.Mode().Perm() != 0o600 {
		t.Fatal(".bak should be 0600")
	}
	sc, err := cfg.Scopes.Resolve(keyNew)
	if err != nil || sc.Name != "bk-analytics-supervisor" || !sc.Allows("g3@g.us") || sc.Allows("g1@g.us") {
		t.Fatalf("new scope not live after replace: %v %+v", err, sc)
	}
	if sc, err := cfg.Scopes.Resolve(keyBots); err != nil || !sc.Allows("g1@g.us") {
		t.Fatal("existing scope broken")
	}
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if len(out["scopes"].([]any)) != 3 {
		t.Fatalf("summary: %v", out)
	}
}

func TestReadScopeRestriction(t *testing.T) {
	a, _, _ := newReadFixture(t)
	dir := t.TempDir()
	path := filepath.Join(dir, "scopes.json")
	_ = os.WriteFile(path, []byte(scopesDoc(`{"name":"bk-analytics-supervisor","key":"`+keyNew+`","jids":["g1@g.us"]}`)), 0o600)
	cfg := &Config{APIKey: testGlobal, Scopes: NewScopeStore(path, testGlobal)}
	mux := http.NewServeMux()
	a.Register(mux)
	h := NewGate(cfg).Wrap(mux)
	get := func(tok, url string) (int, map[string]any) {
		r := httptest.NewRequest(http.MethodGet, url, nil)
		r.Header.Set("Authorization", "Bearer "+tok)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, r)
		var out map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		return rec.Code, out
	}
	remotes := func(out map[string]any) map[string]bool {
		m := map[string]bool{}
		for _, x := range out["messages"].([]any) {
			m[x.(map[string]any)["remote_id"].(string)] = true
		}
		return m
	}
	// restricted scope: own chat ok, other chat refused, no filter = own chats only
	if c, out := get(keyNew, "/read/messages?remote_id=g1@g.us"); c != 200 || !remotes(out)["g1@g.us"] {
		t.Fatalf("own chat: %d %v", c, out)
	}
	if c, _ := get(keyNew, "/read/messages?remote_id=g2@g.us"); c != http.StatusForbidden {
		t.Fatalf("other chat: %d", c)
	}
	if c, _ := get(keyNew, "/read/messages?remote_id=g1@g.us,g2@g.us"); c != http.StatusForbidden {
		t.Fatalf("mixed chats: %d", c)
	}
	if c, out := get(keyNew, "/read/messages"); c != 200 || len(remotes(out)) != 1 || !remotes(out)["g1@g.us"] {
		t.Fatalf("unfiltered must pin to own chats: %d %v", c, out)
	}
	for _, p := range []string{"/read/bridge-sent", "/read/remotes", "/read/contacts", "/read/lid-map", "/media/file?path=/x"} {
		if c, _ := get(keyNew, p); c != http.StatusForbidden {
			t.Fatalf("%s for restricted scope: %d", p, c)
		}
	}
	if c, _ := get(keyNew, "/media/file/m3"); c != 200 {
		t.Fatalf("own media: %d", c)
	}
	if c, _ := get(keyNew, "/media/file/m4"); c != http.StatusForbidden {
		t.Fatalf("other media: %d", c)
	}
	if c, _ := get(keyNew, "/read/revisions?remote_id=g2@g.us"); c != http.StatusForbidden {
		t.Fatalf("revisions other chat: %d", c)
	}
	// read-all scopes keep reading every chat
	for _, k := range []string{testGlobal, keyBots, keyWA} {
		if c, out := get(k, "/read/messages"); c != 200 || len(remotes(out)) != 3 {
			t.Fatalf("read-all key: %d %v", c, out)
		}
		if c, _ := get(k, "/read/bridge-sent"); c != 200 {
			t.Fatalf("read-all bridge-sent: %d", c)
		}
	}
}
