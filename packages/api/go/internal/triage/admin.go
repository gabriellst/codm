package triage

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Admin routes (GLOBAL_API_KEY only) used by rollback.sh:
//
//	POST /admin/stop-bridge  remove .bridge-ready (a restart will NOT bring the
//	                         bridge back) and disconnect WhatsApp without logout.
//	GET  /admin/db-snapshot  consistent copy of codm.db (VACUUM INTO), with
//	                         X-Sha256 and Content-Length headers.
type adminAPI struct {
	cfg *Config
	db  *sql.DB
	p   *Pairing
	mu  sync.Mutex
}

func registerAdmin(mux *http.ServeMux, cfg *Config, db *sql.DB, p *Pairing) {
	a := &adminAPI{cfg: cfg, db: db, p: p}
	mux.HandleFunc("POST /admin/stop-bridge", a.stopBridge)
	mux.HandleFunc("GET /admin/db-snapshot", a.snapshot)
	mux.HandleFunc("PUT /admin/scopes", a.putScopes)
}

var scopeNameRe = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{0,63}$`)

// validateScopes enforces {"scopes":[{"name","key","jids":[...]}]}: no unknown
// fields, unique names and keys, keys >= 24 chars, every jid "user@server".
func validateScopes(body []byte) (scopeFile, error) {
	var doc scopeFile
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&doc); err != nil {
		return doc, fmt.Errorf("invalid JSON: %v", err)
	}
	if dec.More() {
		return doc, errors.New("trailing data after JSON")
	}
	if len(doc.Scopes) == 0 {
		return doc, errors.New("scopes must be a non-empty array")
	}
	names, keys := map[string]bool{}, map[string]bool{}
	for i, e := range doc.Scopes {
		if !scopeNameRe.MatchString(e.Name) {
			return doc, fmt.Errorf("scopes[%d]: bad name", i)
		}
		if names[e.Name] {
			return doc, fmt.Errorf("scopes[%d]: duplicate name %q", i, e.Name)
		}
		names[e.Name] = true
		if len(strings.TrimSpace(e.Key)) < 24 || strings.TrimSpace(e.Key) != e.Key {
			return doc, fmt.Errorf("scopes[%d] (%s): key must be >= 24 chars, no surrounding spaces", i, e.Name)
		}
		if keys[e.Key] {
			return doc, fmt.Errorf("scopes[%d] (%s): key reused by another scope", i, e.Name)
		}
		keys[e.Key] = true
		if e.JIDs == nil {
			return doc, fmt.Errorf("scopes[%d] (%s): jids must be an array", i, e.Name)
		}
		for _, j := range e.JIDs {
			u, srv, ok := strings.Cut(strings.TrimSpace(j), "@")
			if !ok || u == "" || srv == "" || strings.ContainsAny(j, " \t\n") {
				return doc, fmt.Errorf("scopes[%d] (%s): bad jid", i, e.Name)
			}
		}
	}
	return doc, nil
}

// putScopes atomically replaces scopes.json (0600, previous file kept as
// scopes.json.bak) and reloads it. The response lists names and chat counts only.
func (a *adminAPI) putScopes(w http.ResponseWriter, r *http.Request) {
	if !authorize(a.cfg, w, r) {
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if err != nil {
		jsonErr(w, http.StatusRequestEntityTooLarge, "body too large or unreadable")
		return
	}
	doc, err := validateScopes(body)
	if err != nil {
		jsonErr(w, http.StatusBadRequest, err.Error())
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	path := a.cfg.ScopesFile
	if path == "" {
		path = a.cfg.Path("scopes.json")
	}
	if old, err := os.ReadFile(path); err == nil {
		if err := writeFileAtomic(path+".bak", old); err != nil {
			jsonErr(w, http.StatusInternalServerError, "could not write scopes.json.bak")
			return
		}
	}
	if err := writeFileAtomic(path, body); err != nil {
		jsonErr(w, http.StatusInternalServerError, "could not write scopes.json")
		return
	}
	if a.cfg.Scopes != nil {
		if err := a.cfg.Scopes.ForceReload(); err != nil {
			slog.Error("triage: scopes.json written but reload failed", "error", err)
		}
	}
	out := make([]map[string]any, 0, len(doc.Scopes))
	for _, e := range doc.Scopes {
		out = append(out, map[string]any{"name": e.Name, "jids": len(e.JIDs)})
	}
	slog.Warn("triage: scopes.json replaced by admin", "scopes", len(doc.Scopes))
	writeJSONCode(w, http.StatusOK, map[string]any{"ok": true, "scopes": out})
}

func writeFileAtomic(path string, data []byte) error {
	tmp := path + ".tmp"
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	_, werr := f.Write(data)
	if werr == nil {
		werr = f.Sync()
	}
	if err := f.Close(); werr == nil {
		werr = err
	}
	if werr == nil {
		werr = os.Chmod(tmp, 0o600)
	}
	if werr == nil {
		werr = os.Rename(tmp, path)
	}
	if werr != nil {
		_ = os.Remove(tmp)
	}
	return werr
}

func (a *adminAPI) stopBridge(w http.ResponseWriter, r *http.Request) {
	if !authorize(a.cfg, w, r) {
		return
	}
	err := os.Remove(a.cfg.Path(".bridge-ready"))
	removed := err == nil || os.IsNotExist(err)
	var derr string
	if a.p != nil {
		if e := a.p.StopBridge(); e != nil {
			derr = e.Error()
		}
	}
	slog.Warn("triage: bridge stopped by admin (rollback)", "bridgeReadyRemoved", removed)
	out := map[string]any{"stopped": true, "bridgeReadyRemoved": removed}
	if a.p != nil {
		out["state"] = a.p.Snapshot().State
	}
	if derr != "" {
		out["disconnectError"] = derr
	}
	writeJSONCode(w, http.StatusOK, out)
}

func (a *adminAPI) snapshot(w http.ResponseWriter, r *http.Request) {
	if !authorize(a.cfg, w, r) {
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	dir := a.cfg.Path("tmp")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		jsonErr(w, http.StatusInternalServerError, "mkdir tmp")
		return
	}
	snap := filepath.Join(dir, fmt.Sprintf("db-snapshot-%d.db", time.Now().UnixNano()))
	defer os.Remove(snap)
	if _, err := a.db.ExecContext(r.Context(), "VACUUM INTO ?", snap); err != nil {
		slog.Error("triage: db snapshot failed", "error", err)
		jsonErr(w, http.StatusInternalServerError, "snapshot failed")
		return
	}
	f, err := os.Open(snap)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "open snapshot")
		return
	}
	defer f.Close()
	h := sha256.New()
	n, err := io.Copy(h, f)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "hash snapshot")
		return
	}
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		jsonErr(w, http.StatusInternalServerError, "seek snapshot")
		return
	}
	w.Header().Set("Content-Type", "application/vnd.sqlite3")
	w.Header().Set("Content-Length", strconv.FormatInt(n, 10))
	w.Header().Set("X-Sha256", hex.EncodeToString(h.Sum(nil)))
	w.Header().Set("Content-Disposition", `attachment; filename="codm.db"`)
	_, _ = io.Copy(w, f)
	slog.Info("triage: db snapshot served", "bytes", n)
}
