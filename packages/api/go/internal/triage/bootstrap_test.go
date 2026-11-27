package triage

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/klauspost/compress/zstd"
)

const testBootToken = "test-bootstrap-token-0123456789abcdef"

type tarEntry struct {
	name string
	typ  byte
	body string
}

func mkTar(t *testing.T, comp string, entries ...tarEntry) []byte {
	t.Helper()
	var raw bytes.Buffer
	tw := tar.NewWriter(&raw)
	for _, e := range entries {
		h := &tar.Header{Name: e.name, Typeflag: e.typ, Mode: 0o644, Size: int64(len(e.body))}
		if e.typ == tar.TypeSymlink {
			h.Linkname, h.Size = "/etc/passwd", 0
		}
		if e.typ == tar.TypeDir {
			h.Size = 0
		}
		if err := tw.WriteHeader(h); err != nil {
			t.Fatal(err)
		}
		if h.Size > 0 {
			_, _ = tw.Write([]byte(e.body))
		}
	}
	_ = tw.Close()
	switch comp {
	case "gz":
		var out bytes.Buffer
		gw := gzip.NewWriter(&out)
		_, _ = gw.Write(raw.Bytes())
		_ = gw.Close()
		return out.Bytes()
	case "zst":
		zw, _ := zstd.NewWriter(nil)
		return zw.EncodeAll(raw.Bytes(), nil)
	}
	return raw.Bytes()
}

func bootReq(t *testing.T, b *bootstrapReceiver, method, path string, body []byte, hdr map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+testBootToken)
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	b.ServeHTTP(rec, req)
	return rec
}

func TestBootstrapMediaUpload(t *testing.T) {
	dir := t.TempDir()
	outside := filepath.Join(filepath.Dir(dir), "escaped.txt")
	b := newBootstrapReceiver(dir, testBootToken)

	// wrong token → 401
	req := httptest.NewRequest(http.MethodGet, "/bootstrap/status", nil)
	req.Header.Set("Authorization", "Bearer nope")
	rec := httptest.NewRecorder()
	b.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("bad token: %d", rec.Code)
	}

	for _, comp := range []string{"", "gz", "zst"} {
		body := mkTar(t, comp,
			tarEntry{"media/", tar.TypeDir, ""},
			tarEntry{"media/a-" + comp + ".jpg", tar.TypeReg, "img-" + comp},
			tarEntry{"./media/sub/b.ogg", tar.TypeReg, "audio"},
			tarEntry{"media/link", tar.TypeSymlink, ""},
			tarEntry{"scopes.json", tar.TypeReg, `{"scopes":[]}`},
		)
		if rec := bootReq(t, b, http.MethodPut, "/bootstrap/media", body, nil); rec.Code != 200 {
			t.Fatalf("media %q: %d %s", comp, rec.Code, rec.Body)
		}
		if got, _ := os.ReadFile(filepath.Join(dir, "media", "a-"+comp+".jpg")); string(got) != "img-"+comp {
			t.Fatalf("media %q not extracted: %q", comp, got)
		}
	}
	if _, err := os.Lstat(filepath.Join(dir, "media", "link")); !os.IsNotExist(err) {
		t.Fatal("symlink must not be materialised")
	}
	if fi, _ := os.Stat(filepath.Join(dir, "scopes.json")); fi == nil || fi.Mode().Perm() != 0o600 {
		t.Fatal("scopes.json should be written 0600")
	}

	for _, bad := range []string{"../escaped.txt", "/abs.txt", "media/../../escaped.txt", "codm.db", ".bridge-ready", "keys/x.key", "incoming/codm.db"} {
		rec := bootReq(t, b, http.MethodPut, "/bootstrap/media", mkTar(t, "gz", tarEntry{bad, tar.TypeReg, "x"}), nil)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("%q accepted: %d", bad, rec.Code)
		}
	}
	if _, err := os.Stat(outside); !os.IsNotExist(err) {
		t.Fatal("path traversal wrote outside the data dir")
	}
	if fileExists(filepath.Join(dir, "codm.db")) || fileExists(filepath.Join(dir, ".bridge-ready")) {
		t.Fatal("protected names written")
	}

	// size cap
	small := newBootstrapReceiver(dir, testBootToken)
	small.maxBytes = 1024
	big := mkTar(t, "", tarEntry{"media/big.bin", tar.TypeReg, string(make([]byte, 8192))})
	if rec := bootReq(t, small, http.MethodPut, "/bootstrap/media", big, nil); rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("size cap: %d %s", rec.Code, rec.Body)
	}
}

func fakeCodmDB(t *testing.T, withDevice bool) []byte {
	t.Helper()
	p := filepath.Join(t.TempDir(), "fake.db")
	db, err := sql.Open("sqlite", p)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = db.Exec("CREATE TABLE whatsmeow_device (jid TEXT PRIMARY KEY)")
	if withDevice {
		_, _ = db.Exec("INSERT INTO whatsmeow_device VALUES ('5585000000009.0:1@s.whatsapp.net')")
	}
	_ = db.Close()
	b, _ := os.ReadFile(p)
	return b
}

func TestBootstrapDBUpload(t *testing.T) {
	dir := t.TempDir()
	b := newBootstrapReceiver(dir, testBootToken)
	good := fakeCodmDB(t, true)
	sum := sha256.Sum256(good)
	sha := hex.EncodeToString(sum[:])

	if rec := bootReq(t, b, http.MethodPut, "/bootstrap/db", good, nil); rec.Code != http.StatusBadRequest {
		t.Fatalf("missing X-Sha256: %d", rec.Code)
	}
	wrong := "0000000000000000000000000000000000000000000000000000000000000000"
	if rec := bootReq(t, b, http.MethodPut, "/bootstrap/db", good, map[string]string{"X-Sha256": wrong}); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("wrong sha: %d %s", rec.Code, rec.Body)
	}
	if fileExists(filepath.Join(dir, "codm.db")) || fileExists(filepath.Join(dir, "incoming", "codm.db.upload")) {
		t.Fatal("wrong sha left a db behind")
	}
	noDev := fakeCodmDB(t, false)
	s2 := sha256.Sum256(noDev)
	if rec := bootReq(t, b, http.MethodPut, "/bootstrap/db", noDev, map[string]string{"X-Sha256": hex.EncodeToString(s2[:])}); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("db without device accepted: %d", rec.Code)
	}
	select {
	case <-b.done:
		t.Fatal("receiver finished before a valid db")
	default:
	}
	if rec := bootReq(t, b, http.MethodPut, "/bootstrap/db", good, map[string]string{"X-Sha256": sha}); rec.Code != 200 {
		t.Fatalf("good db: %d %s", rec.Code, rec.Body)
	}
	got, _ := os.ReadFile(filepath.Join(dir, "codm.db"))
	if !bytes.Equal(got, good) || !fileExists(filepath.Join(dir, ".bridge-ready")) {
		t.Fatal("db not installed or .bridge-ready missing")
	}
	select {
	case <-b.done:
	default:
		t.Fatal("receiver should be done after accepting the db")
	}
	// never overwrite
	if rec := bootReq(t, b, http.MethodPut, "/bootstrap/db", good, map[string]string{"X-Sha256": sha}); rec.Code != http.StatusConflict {
		t.Fatalf("second db: %d", rec.Code)
	}
	if rec := bootReq(t, b, http.MethodPut, "/bootstrap/media", mkTar(t, "", tarEntry{"media/x", tar.TypeReg, "x"}), nil); rec.Code != http.StatusConflict {
		t.Fatalf("media after db: %d", rec.Code)
	}
}

func TestBootstrapReceiverAbsentWhenDBExists(t *testing.T) {
	dir := t.TempDir()
	_ = os.WriteFile(filepath.Join(dir, "codm.db"), []byte("x"), 0o600)
	t.Setenv("CODM_DATA_DIR", dir)
	t.Setenv("BOOTSTRAP_UPLOAD_TOKEN", testBootToken)
	t.Setenv("PORT", "1") // would fail to bind if it tried to listen
	if rc := RunBootstrapReceiver(); rc != 0 {
		t.Fatalf("rc=%d, want 0 without listening", rc)
	}
}

func TestBootstrapFailedAuthRateLimited(t *testing.T) {
	b := newBootstrapReceiver(t.TempDir(), testBootToken)
	code := 0
	for range 30 {
		req := httptest.NewRequest(http.MethodGet, "/bootstrap/status", nil)
		req.Header.Set("Authorization", "Bearer wrong")
		rec := httptest.NewRecorder()
		b.ServeHTTP(rec, req)
		code = rec.Code
	}
	if code != http.StatusTooManyRequests {
		t.Fatalf("got %d, want 429 after repeated failures", code)
	}
}

func TestAdminDBSnapshot(t *testing.T) {
	dir := t.TempDir()
	db, err := sql.Open("sqlite", filepath.Join(dir, "codm.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, _ = db.Exec("PRAGMA journal_mode=WAL; CREATE TABLE whatsmeow_device (jid TEXT); INSERT INTO whatsmeow_device VALUES ('x')")
	_ = os.WriteFile(filepath.Join(dir, ".bridge-ready"), []byte("x"), 0o600)
	cfg := &Config{DataDir: dir, APIKey: "global-test-key"}
	mux := http.NewServeMux()
	registerAdmin(mux, cfg, db, nil)

	req := httptest.NewRequest(http.MethodGet, "/admin/db-snapshot", nil)
	req.Header.Set("Authorization", "Bearer scope-key")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("non-global key: %d", rec.Code)
	}

	req = httptest.NewRequest(http.MethodGet, "/admin/db-snapshot", nil)
	req.Header.Set("Authorization", "Bearer global-test-key")
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("snapshot: %d %s", rec.Code, rec.Body)
	}
	sum := sha256.Sum256(rec.Body.Bytes())
	if rec.Header().Get("X-Sha256") != hex.EncodeToString(sum[:]) {
		t.Fatal("X-Sha256 does not match body")
	}
	p := filepath.Join(t.TempDir(), "snap.db")
	_ = os.WriteFile(p, rec.Body.Bytes(), 0o600)
	if err := checkSqlite(p, false); err != nil {
		t.Fatalf("snapshot not a valid codm.db: %v", err)
	}
	if ents, _ := os.ReadDir(filepath.Join(dir, "tmp")); len(ents) != 0 {
		t.Fatal("snapshot temp file left behind")
	}

	req = httptest.NewRequest(http.MethodPost, "/admin/stop-bridge", nil)
	req.Header.Set("Authorization", "Bearer global-test-key")
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 200 || fileExists(filepath.Join(dir, ".bridge-ready")) {
		t.Fatalf("stop-bridge: %d, .bridge-ready still present=%v", rec.Code, fileExists(filepath.Join(dir, ".bridge-ready")))
	}
}
