package triage

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
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
