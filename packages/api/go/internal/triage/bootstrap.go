package triage

import (
	"archive/tar"
	"bufio"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/klauspost/compress/zstd"
	_ "modernc.org/sqlite"
)

// Bootstrap receiver (`whatsapp-triage bootstrap-receive`).
//
// The entrypoint guard runs it on $PORT ONLY while <data>/codm.db does not
// exist, so a migration can be uploaded over the service's own HTTPS domain
// (no SSH, no bucket). Every request needs
// "Authorization: Bearer $BOOTSTRAP_UPLOAD_TOKEN".
//
//	PUT /bootstrap/media   tar, tar.gz or tar.zst; extracted under <data>
//	                       (path-traversal safe via os.Root, no links, never
//	                       touches codm.db*/.bridge-ready/incoming/keys*);
//	                       repeatable for incremental presync.
//	PUT /bootstrap/db      body = codm.db, header X-Sha256; written to
//	                       incoming/, sha256 + sqlite quick_check + device
//	                       row verified, then atomically renamed to codm.db
//	                       and .bridge-ready written; the receiver then exits
//	                       and the guard starts the bridge.
//	GET /bootstrap/status  what has been received so far.
//
// BOOTSTRAP_MAX_BYTES (default 4 GiB) caps each upload body;
// BOOTSTRAP_AUTH_FAIL_PER_MINUTE (default 10) throttles failed auth and
// rejected DB uploads per client IP.
type bootstrapReceiver struct {
	dataDir    string
	token      string
	maxBytes   int64
	allowNoDev bool
	fails      *limiter
	mu         sync.Mutex
	done       chan struct{}
	doneOnce   sync.Once
	mediaPuts  int
	filesTotal int
	bytesTotal int64
	lastUpload time.Time
	dbAccepted bool
	startedAt  time.Time
}

func newBootstrapReceiver(dataDir, token string) *bootstrapReceiver {
	maxBytes := int64(4 << 30)
	if n, err := strconv.ParseInt(strings.TrimSpace(os.Getenv("BOOTSTRAP_MAX_BYTES")), 10, 64); err == nil && n > 0 {
		maxBytes = n
	}
	fails := envInt("BOOTSTRAP_AUTH_FAIL_PER_MINUTE", 10)
	return &bootstrapReceiver{
		dataDir: dataDir, token: token, maxBytes: maxBytes,
		allowNoDev: os.Getenv("BOOTSTRAP_ALLOW_NO_DEVICE") == "1",
		fails:      newLimiter(float64(fails)/60, float64(fails)),
		done:       make(chan struct{}), startedAt: time.Now(),
	}
}

func fileExists(p string) bool { _, err := os.Lstat(p); return err == nil }

// RunBootstrapReceiver returns 0 when the DB was accepted (or already
// present), 2 when stopped by a signal, 3 on misconfiguration.
func RunBootstrapReceiver() int {
	dataDir := strings.TrimSpace(os.Getenv("CODM_DATA_DIR"))
	if dataDir == "" {
		dataDir = "/data"
	}
	if fileExists(filepath.Join(dataDir, "codm.db")) {
		slog.Info("bootstrap: codm.db present — receiver not started")
		return 0
	}
	token := strings.TrimSpace(os.Getenv("BOOTSTRAP_UPLOAD_TOKEN"))
	if len(token) < 32 {
		slog.Error("bootstrap: BOOTSTRAP_UPLOAD_TOKEN missing or shorter than 32 chars")
		return 3
	}
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		slog.Error("bootstrap: data dir", "error", err)
		return 3
	}
	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = strings.TrimSpace(os.Getenv("CHANNEL_PORT"))
	}
	if port == "" {
		port = "3032"
	}
	host := strings.TrimSpace(os.Getenv("BIND_HOST"))
	if host == "" {
		host = "127.0.0.1"
	}
	b := newBootstrapReceiver(dataDir, token)
	ln, err := net.Listen("tcp", net.JoinHostPort(host, port))
	if err != nil {
		slog.Error("bootstrap: listen", "error", err)
		return 3
	}
	srv := &http.Server{Handler: b, ReadHeaderTimeout: 15 * time.Second, IdleTimeout: 2 * time.Minute}
	go func() { _ = srv.Serve(ln) }()
	slog.Info("bootstrap: receiver listening (waiting for media/db upload)", "addr", ln.Addr().String(), "maxBytes", b.maxBytes)

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGTERM, syscall.SIGINT)
	rc := 0
	select {
	case <-b.done:
		slog.Info("bootstrap: codm.db accepted — receiver exiting so the guard starts the bridge")
	case s := <-sig:
		slog.Info("bootstrap: signal, exiting", "signal", s.String())
		rc = 2
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	return rc
}

func (b *bootstrapReceiver) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ip := "ip:" + clientIP(r)
	if !b.fails.peek(ip) {
		w.Header().Set("Retry-After", "60")
		jsonErr(w, http.StatusTooManyRequests, "too many failed attempts")
		return
	}
	tok, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok || subtle.ConstantTimeCompare([]byte(strings.TrimSpace(tok)), []byte(b.token)) != 1 {
		b.fails.allow(ip)
		slog.Warn("bootstrap: rejected request", "path", r.URL.Path, "ip", clientIP(r))
		jsonErr(w, http.StatusUnauthorized, "missing or invalid bearer token")
		return
	}
	switch {
	case r.Method == http.MethodGet && r.URL.Path == "/bootstrap/status":
		b.status(w)
	case r.Method == http.MethodPut && r.URL.Path == "/bootstrap/media":
		b.media(w, r)
	case r.Method == http.MethodPut && r.URL.Path == "/bootstrap/db":
		b.db(w, r, ip)
	default:
		jsonErr(w, http.StatusNotFound, "bootstrap mode: only /bootstrap/{status,media,db}")
	}
}

func writeJSONCode(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func (b *bootstrapReceiver) status(w http.ResponseWriter) {
	b.mu.Lock()
	defer b.mu.Unlock()
	var files int
	var bytes int64
	_ = filepath.WalkDir(filepath.Join(b.dataDir, "media"), func(_ string, d os.DirEntry, err error) error {
		if err == nil && d.Type().IsRegular() {
			if fi, e := d.Info(); e == nil {
				files++
				bytes += fi.Size()
			}
		}
		return nil
	})
	out := map[string]any{
		"mode": "bootstrap", "dbPresent": fileExists(filepath.Join(b.dataDir, "codm.db")),
		"dbAccepted": b.dbAccepted, "scopesPresent": fileExists(filepath.Join(b.dataDir, "scopes.json")),
		"mediaFiles": files, "mediaBytes": bytes, "mediaPuts": b.mediaPuts,
		"filesWrittenThisRun": b.filesTotal, "bytesWrittenThisRun": b.bytesTotal,
		"maxBytes": b.maxBytes, "startedAt": b.startedAt.Format(time.RFC3339),
	}
	if !b.lastUpload.IsZero() {
		out["lastUpload"] = b.lastUpload.Format(time.RFC3339)
	}
	writeJSONCode(w, http.StatusOK, out)
}

// protectedPath: names the media upload may never create or overwrite.
func protectedPath(rel string) bool {
	first, _, _ := strings.Cut(rel, "/")
	switch {
	case strings.HasPrefix(first, "codm.db"), first == ".bridge-ready", first == "incoming",
		strings.HasPrefix(first, "keys"), first == "tmp", strings.HasSuffix(rel, ".bootstrap-tmp"):
		return true
	}
	return false
}

// cleanTarName returns the slash-relative path of a tar entry or an error
// for absolute / escaping names. "" means "the root itself" (skip).
func cleanTarName(name string) (string, error) {
	if strings.ContainsRune(name, '\\') || strings.ContainsRune(name, 0) {
		return "", fmt.Errorf("bad entry name %q", name)
	}
	if path.IsAbs(name) {
		return "", fmt.Errorf("absolute entry %q", name)
	}
	c := path.Clean(name)
	if c == "." {
		return "", nil
	}
	if c == ".." || strings.HasPrefix(c, "../") {
		return "", fmt.Errorf("escaping entry %q", name)
	}
	return c, nil
}

func decompressed(br *bufio.Reader) (io.Reader, func(), error) {
	magic, _ := br.Peek(4)
	switch {
	case len(magic) >= 2 && magic[0] == 0x1f && magic[1] == 0x8b:
		gz, err := gzip.NewReader(br)
		if err != nil {
			return nil, nil, err
		}
		return gz, func() { _ = gz.Close() }, nil
	case len(magic) == 4 && magic[0] == 0x28 && magic[1] == 0xb5 && magic[2] == 0x2f && magic[3] == 0xfd:
		zr, err := zstd.NewReader(br)
		if err != nil {
			return nil, nil, err
		}
		return zr, zr.Close, nil
	}
	return br, func() {}, nil
}

func (b *bootstrapReceiver) media(w http.ResponseWriter, r *http.Request) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if fileExists(filepath.Join(b.dataDir, "codm.db")) {
		jsonErr(w, http.StatusConflict, "codm.db already present; bootstrap closed")
		return
	}
	root, err := os.OpenRoot(b.dataDir)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "open data dir")
		return
	}
	defer root.Close()
	body := http.MaxBytesReader(w, r.Body, b.maxBytes)
	rd, closeFn, err := decompressed(bufio.NewReaderSize(body, 1<<16))
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "bad compressed stream")
		return
	}
	defer closeFn()
	tr := tar.NewReader(rd)
	var files, dirs, skipped int
	var bytes int64
	fail := func(code int, msg string) {
		b.filesTotal += files
		b.bytesTotal += bytes
		slog.Warn("bootstrap: media upload aborted", "reason", msg, "filesWritten", files)
		writeJSONCode(w, code, map[string]any{"error": msg, "files": files, "bytes": bytes})
	}
	for {
		hdr, err := tr.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			var mbe *http.MaxBytesError
			if errors.As(err, &mbe) {
				fail(http.StatusRequestEntityTooLarge, "body exceeds BOOTSTRAP_MAX_BYTES")
			} else {
				fail(http.StatusBadRequest, "bad tar stream")
			}
			return
		}
		rel, err := cleanTarName(hdr.Name)
		if err != nil {
			fail(http.StatusBadRequest, err.Error())
			return
		}
		if rel == "" {
			continue
		}
		if protectedPath(rel) {
			fail(http.StatusBadRequest, "refusing protected path "+rel)
			return
		}
		switch hdr.Typeflag {
		case tar.TypeDir:
			if err := root.MkdirAll(rel, 0o700); err != nil {
				fail(http.StatusBadRequest, "mkdir "+rel+": "+err.Error())
				return
			}
			dirs++
		case tar.TypeReg:
			if dir := path.Dir(rel); dir != "." {
				if err := root.MkdirAll(dir, 0o700); err != nil {
					fail(http.StatusBadRequest, "mkdir "+dir+": "+err.Error())
					return
				}
			}
			tmp := rel + ".bootstrap-tmp"
			f, err := root.OpenFile(tmp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
			if err != nil {
				fail(http.StatusBadRequest, "create "+rel+": "+err.Error())
				return
			}
			n, cerr := io.Copy(f, tr)
			if err := f.Close(); cerr == nil {
				cerr = err
			}
			if cerr == nil {
				cerr = root.Rename(tmp, rel)
			}
			if cerr != nil {
				_ = root.Remove(tmp)
				var mbe *http.MaxBytesError
				if errors.As(cerr, &mbe) {
					fail(http.StatusRequestEntityTooLarge, "body exceeds BOOTSTRAP_MAX_BYTES")
				} else {
					fail(http.StatusBadRequest, "write "+rel+": "+cerr.Error())
				}
				return
			}
			if !hdr.ModTime.IsZero() {
				_ = root.Chtimes(rel, hdr.ModTime, hdr.ModTime)
			}
			files++
			bytes += n
		default: // symlinks, hardlinks, devices, fifos: never materialised
			skipped++
		}
	}
	b.mediaPuts++
	b.filesTotal += files
	b.bytesTotal += bytes
	b.lastUpload = time.Now()
	slog.Info("bootstrap: media upload extracted", "files", files, "dirs", dirs, "bytes", bytes, "skipped", skipped)
	writeJSONCode(w, http.StatusOK, map[string]any{"ok": true, "files": files, "dirs": dirs, "bytes": bytes, "skipped": skipped})
}

func (b *bootstrapReceiver) db(w http.ResponseWriter, r *http.Request, ip string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	final := filepath.Join(b.dataDir, "codm.db")
	if fileExists(final) {
		jsonErr(w, http.StatusConflict, "codm.db already present; refusing to overwrite")
		return
	}
	want := strings.ToLower(strings.TrimSpace(r.Header.Get("X-Sha256")))
	if _, err := hex.DecodeString(want); err != nil || len(want) != 64 {
		jsonErr(w, http.StatusBadRequest, "X-Sha256 header (64 hex chars) required")
		return
	}
	in := filepath.Join(b.dataDir, "incoming")
	if err := os.MkdirAll(in, 0o700); err != nil {
		jsonErr(w, http.StatusInternalServerError, "mkdir incoming")
		return
	}
	tmp := filepath.Join(in, "codm.db.upload")
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "create temp file")
		return
	}
	h := sha256.New()
	n, cerr := io.Copy(io.MultiWriter(f, h), http.MaxBytesReader(w, r.Body, b.maxBytes))
	if cerr == nil {
		cerr = f.Sync()
	}
	if err := f.Close(); cerr == nil {
		cerr = err
	}
	reject := func(code int, v map[string]any) {
		_ = os.Remove(tmp)
		b.fails.allow(ip)
		slog.Warn("bootstrap: db upload rejected", "reason", v["error"], "bytes", n)
		writeJSONCode(w, code, v)
	}
	if cerr != nil {
		var mbe *http.MaxBytesError
		if errors.As(cerr, &mbe) {
			reject(http.StatusRequestEntityTooLarge, map[string]any{"error": "body exceeds BOOTSTRAP_MAX_BYTES"})
		} else {
			reject(http.StatusBadRequest, map[string]any{"error": "upload interrupted"})
		}
		return
	}
	got := hex.EncodeToString(h.Sum(nil))
	if got != want {
		reject(http.StatusUnprocessableEntity, map[string]any{"error": "sha256 mismatch", "got": got, "bytes": n})
		return
	}
	if err := checkSqlite(tmp, b.allowNoDev); err != nil {
		reject(http.StatusUnprocessableEntity, map[string]any{"error": "sqlite check failed: " + err.Error(), "bytes": n})
		return
	}
	for _, x := range []string{"-wal", "-shm", "-journal"} {
		_ = os.Remove(final + x)
	}
	if err := os.Rename(tmp, final); err != nil {
		reject(http.StatusInternalServerError, map[string]any{"error": "rename failed"})
		return
	}
	_ = os.Chmod(final, 0o600)
	if err := os.WriteFile(filepath.Join(b.dataDir, ".bridge-ready"), []byte(time.Now().Format(time.RFC3339)+" bootstrap sha256="+got+"\n"), 0o600); err != nil {
		writeJSONCode(w, http.StatusInternalServerError, map[string]any{"error": "codm.db installed but .bridge-ready not written"})
		return
	}
	if d, err := os.Open(b.dataDir); err == nil {
		_ = d.Sync()
		_ = d.Close()
	}
	b.dbAccepted = true
	slog.Info("bootstrap: codm.db installed", "bytes", n)
	writeJSONCode(w, http.StatusOK, map[string]any{"accepted": true, "bytes": n, "sha256": got})
	if fl, ok := w.(http.Flusher); ok {
		fl.Flush()
	}
	b.doneOnce.Do(func() { close(b.done) })
}

// checkSqlite opens the uploaded file read-only and verifies it is a sane
// codm.db: quick_check ok and (unless allowNoDev) a whatsmeow device row.
func checkSqlite(p string, allowNoDev bool) error {
	f, err := os.Open(p)
	if err != nil {
		return err
	}
	hdr := make([]byte, 16)
	_, err = io.ReadFull(f, hdr)
	_ = f.Close()
	if err != nil || string(hdr) != "SQLite format 3\x00" {
		return errors.New("not an sqlite database")
	}
	db, err := sql.Open("sqlite", "file:"+p+"?mode=ro&immutable=1")
	if err != nil {
		return err
	}
	defer db.Close()
	var ok string
	if err := db.QueryRow("PRAGMA quick_check").Scan(&ok); err != nil || ok != "ok" {
		return fmt.Errorf("quick_check=%q err=%v", ok, err)
	}
	if allowNoDev {
		return nil
	}
	var nDev int
	if err := db.QueryRow("SELECT count(*) FROM whatsmeow_device").Scan(&nDev); err != nil || nDev < 1 {
		return fmt.Errorf("no whatsmeow device (n=%d err=%v)", nDev, err)
	}
	return nil
}
