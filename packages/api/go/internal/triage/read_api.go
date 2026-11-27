package triage

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"template/core-go/db/sqlite"
)

// ReadAPI exposes, read-only and behind the Gate, exactly what the box
// consumers used to read straight from codm.db (bk-supervisor, the triage
// routine, codm-tools/transcribe), so codm.db can live on a remote volume with
// a single writer. Any valid key may read; there is no write path here.
//
//	GET /read/messages     gateway_messages by remote_id(s), since/after occurred_at (ms), keyset-paginated
//	GET /read/bridge-sent  triage_bridge_sends ids (messages this bridge sent via /send)
//	GET /read/remotes      gateway_remotes
//	GET /read/contacts     whatsmeow_contacts
//	GET /read/lid-map      whatsmeow_lid_map
//	GET /media/file/{id}   bytes of a message's downloaded media (platform_message_id or gateway id)
//	GET /media/file?path=  bytes of a file under <data dir>/media (the stored mediaPath)
type ReadAPI struct {
	db       *sql.DB
	mediaDir string
}

func NewReadAPI(cfg *Config, store *sqlite.SqliteStore) *ReadAPI {
	return &ReadAPI{db: store.DB(), mediaDir: filepath.Join(cfg.DataDir, "media")}
}

func (a *ReadAPI) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /read/messages", a.messages)
	mux.HandleFunc("GET /read/bridge-sent", a.bridgeSent)
	mux.HandleFunc("GET /read/remotes", a.remotes)
	mux.HandleFunc("GET /read/contacts", a.contacts)
	mux.HandleFunc("GET /read/lid-map", a.lidMap)
	mux.HandleFunc("GET /media/file/{id}", a.mediaByID)
	mux.HandleFunc("GET /media/file", a.mediaByPath)
}

// multi collects a query param given repeated and/or comma-separated.
func multi(q map[string][]string, key string) []string {
	var out []string
	for _, v := range q[key] {
		for _, p := range strings.Split(v, ",") {
			if p = strings.TrimSpace(p); p != "" {
				out = append(out, p)
			}
		}
	}
	return out
}

func placeholders(n int) string {
	return strings.TrimSuffix(strings.Repeat("?,", n), ",")
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(v)
}

func intParam(q map[string][]string, key string) (int64, bool, error) {
	v := ""
	if vs := q[key]; len(vs) > 0 {
		v = strings.TrimSpace(vs[0])
	}
	if v == "" {
		return 0, false, nil
	}
	n, err := strconv.ParseInt(v, 10, 64)
	return n, true, err
}

// scanAll turns rows into JSON-friendly maps ([]byte → string).
func scanAll(rows *sql.Rows) ([]map[string]any, error) {
	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	out := []map[string]any{}
	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		m := make(map[string]any, len(cols))
		for i, c := range cols {
			if b, ok := vals[i].([]byte); ok {
				m[c] = string(b)
			} else {
				m[c] = vals[i]
			}
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (a *ReadAPI) query(ctx context.Context, w http.ResponseWriter, q string, args ...any) ([]map[string]any, bool) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	rows, err := a.db.QueryContext(ctx, q, args...)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "query failed")
		return nil, false
	}
	defer rows.Close()
	out, err := scanAll(rows)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "scan failed")
		return nil, false
	}
	return out, true
}

// GET /read/messages
//
//	remote_id   repeated or comma-separated; omitted = all chats
//	since       occurred_at >= since (unix ms)
//	after       occurred_at >  after (unix ms)
//	until       occurred_at <  until (unix ms)
//	direction   SENT | RECEIVED
//	type        message_type (TEXT, AUDIO, REACTION, ...)
//	contains    case-insensitive substring of content (JSON text)
//	id          gateway id or platform_message_id (repeatable)
//	limit       1..2000 (default 500)
//	cursor      next_cursor from the previous page
//
// Order: occurred_at, observed_at, id (same as the supervisor's query).
func (a *ReadAPI) messages(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	where := []string{"1=1"}
	var args []any
	if ids := multi(q, "remote_id"); len(ids) > 0 {
		if len(ids) > 200 {
			jsonErr(w, http.StatusBadRequest, "at most 200 remote_id values")
			return
		}
		where = append(where, "remote_id IN ("+placeholders(len(ids))+")")
		for _, id := range ids {
			args = append(args, id)
		}
	}
	if ids := multi(q, "id"); len(ids) > 0 {
		if len(ids) > 200 {
			jsonErr(w, http.StatusBadRequest, "at most 200 id values")
			return
		}
		ph := placeholders(len(ids))
		where = append(where, "(id IN ("+ph+") OR platform_message_id IN ("+ph+"))")
		for range 2 {
			for _, id := range ids {
				args = append(args, id)
			}
		}
	}
	for _, p := range []struct{ key, op string }{{"since", ">="}, {"after", ">"}, {"until", "<"}} {
		n, ok, err := intParam(q, p.key)
		if err != nil {
			jsonErr(w, http.StatusBadRequest, p.key+" must be unix milliseconds")
			return
		}
		if ok {
			where = append(where, "occurred_at "+p.op+" ?")
			args = append(args, n)
		}
	}
	if d := strings.ToUpper(strings.TrimSpace(q.Get("direction"))); d != "" {
		if d != "SENT" && d != "RECEIVED" {
			jsonErr(w, http.StatusBadRequest, "direction must be SENT or RECEIVED")
			return
		}
		where = append(where, "direction = ?")
		args = append(args, d)
	}
	if t := strings.ToUpper(strings.TrimSpace(q.Get("type"))); t != "" {
		where = append(where, "message_type = ?")
		args = append(args, t)
	}
	if c := q.Get("contains"); c != "" {
		if len(c) > 200 {
			jsonErr(w, http.StatusBadRequest, "contains too long")
			return
		}
		where = append(where, "instr(lower(content), ?) > 0")
		args = append(args, strings.ToLower(c))
	}
	if cur := strings.TrimSpace(q.Get("cursor")); cur != "" {
		parts := strings.SplitN(cur, ":", 3)
		if len(parts) != 3 {
			jsonErr(w, http.StatusBadRequest, "bad cursor")
			return
		}
		occ, e1 := strconv.ParseInt(parts[0], 10, 64)
		obs, e2 := strconv.ParseInt(parts[1], 10, 64)
		if e1 != nil || e2 != nil {
			jsonErr(w, http.StatusBadRequest, "bad cursor")
			return
		}
		where = append(where, "(occurred_at, COALESCE(observed_at,0), id) > (?, ?, ?)")
		args = append(args, occ, obs, parts[2])
	}
	limit := int64(500)
	if n, ok, err := intParam(q, "limit"); err != nil || (ok && (n < 1 || n > 2000)) {
		jsonErr(w, http.StatusBadRequest, "limit must be 1..2000")
		return
	} else if ok {
		limit = n
	}
	args = append(args, limit)
	rows, ok := a.query(r.Context(), w,
		`SELECT id, remote_id, direction, platform_message_id, message_type, content, occurred_at,
		        sender_remote_id, COALESCE(observed_at,0) AS observed_at, edited_at, deleted_at
		   FROM gateway_messages WHERE `+strings.Join(where, " AND ")+`
		  ORDER BY occurred_at, COALESCE(observed_at,0), id LIMIT ?`, args...)
	if !ok {
		return
	}
	var next any
	if int64(len(rows)) == limit {
		last := rows[len(rows)-1]
		next = toStr(last["occurred_at"]) + ":" + toStr(last["observed_at"]) + ":" + toStr(last["id"])
	}
	writeJSON(w, map[string]any{"messages": rows, "count": len(rows), "next_cursor": next})
}

func toStr(v any) string {
	switch t := v.(type) {
	case int64:
		return strconv.FormatInt(t, 10)
	case string:
		return t
	case nil:
		return "0"
	default:
		b, _ := json.Marshal(t)
		return string(b)
	}
}

// GET /read/bridge-sent[?since=<unix seconds, created_at>] → {"ids":[...]}
func (a *ReadAPI) bridgeSent(w http.ResponseWriter, r *http.Request) {
	q := `SELECT message_id, created_at FROM triage_bridge_sends`
	var args []any
	if n, ok, err := intParam(r.URL.Query(), "since"); err != nil {
		jsonErr(w, http.StatusBadRequest, "since must be unix seconds")
		return
	} else if ok {
		q += ` WHERE created_at >= ?`
		args = append(args, n)
	}
	rows, ok := a.query(r.Context(), w, q+` ORDER BY created_at`, args...)
	if !ok {
		return
	}
	ids := make([]string, 0, len(rows))
	for _, m := range rows {
		ids = append(ids, toStr(m["message_id"]))
	}
	writeJSON(w, map[string]any{"ids": ids, "count": len(ids)})
}

// GET /read/remotes[?remote_id=..][&updated_since=<ms>]
func (a *ReadAPI) remotes(w http.ResponseWriter, r *http.Request) {
	qs := r.URL.Query()
	where := []string{"1=1"}
	var args []any
	if ids := multi(qs, "remote_id"); len(ids) > 0 {
		where = append(where, "remote_id IN ("+placeholders(len(ids))+")")
		for _, id := range ids {
			args = append(args, id)
		}
	}
	if n, ok, err := intParam(qs, "updated_since"); err != nil {
		jsonErr(w, http.StatusBadRequest, "updated_since must be an integer")
		return
	} else if ok {
		where = append(where, "updated_at >= ?")
		args = append(args, n)
	}
	rows, ok := a.query(r.Context(), w, `SELECT channel_id, remote_id, type, platform, name, is_blocked, pinned_at, archived,
		mute_expiration, marked_as_unread, unread_message_count, last_message_at, last_message_id, deleted_at,
		created_at, updated_at FROM gateway_remotes WHERE `+strings.Join(where, " AND ")+` ORDER BY remote_id`, args...)
	if ok {
		writeJSON(w, map[string]any{"remotes": rows, "count": len(rows)})
	}
}

// GET /read/contacts[?jid=..]  (matches their_jid)
func (a *ReadAPI) contacts(w http.ResponseWriter, r *http.Request) {
	q := `SELECT our_jid, their_jid, first_name, full_name, push_name, business_name, redacted_phone FROM whatsmeow_contacts`
	var args []any
	if ids := multi(r.URL.Query(), "jid"); len(ids) > 0 {
		q += ` WHERE their_jid IN (` + placeholders(len(ids)) + `)`
		for _, id := range ids {
			args = append(args, id)
		}
	}
	rows, ok := a.query(r.Context(), w, q+` ORDER BY their_jid`, args...)
	if ok {
		writeJSON(w, map[string]any{"contacts": rows, "count": len(rows)})
	}
}

// GET /read/lid-map[?lid=..][&pn=..]  (bare user parts, no server)
func (a *ReadAPI) lidMap(w http.ResponseWriter, r *http.Request) {
	qs := r.URL.Query()
	var conds []string
	var args []any
	for _, col := range []string{"lid", "pn"} {
		if ids := multi(qs, col); len(ids) > 0 {
			conds = append(conds, col+" IN ("+placeholders(len(ids))+")")
			for _, id := range ids {
				args = append(args, id)
			}
		}
	}
	q := `SELECT lid, pn FROM whatsmeow_lid_map`
	if len(conds) > 0 {
		q += ` WHERE ` + strings.Join(conds, " OR ")
	}
	rows, ok := a.query(r.Context(), w, q, args...)
	if ok {
		writeJSON(w, map[string]any{"lid_map": rows, "count": len(rows)})
	}
}

var errNotMedia = errors.New("no media")

// mediaFromContent finds the first mediaPath (+mimetype/fileName) in a message's content JSON.
func mediaFromContent(content string) (path, mimetype, name string, err error) {
	var top map[string]json.RawMessage
	if json.Unmarshal([]byte(content), &top) != nil {
		return "", "", "", errNotMedia
	}
	for _, raw := range top {
		var d struct {
			MediaPath string `json:"mediaPath"`
			Mimetype  string `json:"mimetype"`
			FileName  string `json:"fileName"`
		}
		if json.Unmarshal(raw, &d) == nil && d.MediaPath != "" {
			return d.MediaPath, d.Mimetype, d.FileName, nil
		}
	}
	return "", "", "", errNotMedia
}

// safeMediaPath resolves p (symlinks included) and requires it under mediaDir.
func (a *ReadAPI) safeMediaPath(p string) (string, bool) {
	if p == "" || !filepath.IsAbs(p) {
		return "", false
	}
	resolved, err := filepath.EvalSymlinks(filepath.Clean(p))
	if err != nil {
		return "", false
	}
	base, err := filepath.EvalSymlinks(a.mediaDir)
	if err != nil {
		base = a.mediaDir
	}
	if !within(base, resolved) {
		return "", false
	}
	return resolved, true
}

func (a *ReadAPI) serveFile(w http.ResponseWriter, r *http.Request, path, mimetype, name string) {
	resolved, ok := a.safeMediaPath(path)
	if !ok {
		jsonErr(w, http.StatusNotFound, "media file not available")
		return
	}
	f, err := os.Open(resolved)
	if err != nil {
		jsonErr(w, http.StatusNotFound, "media file not available")
		return
	}
	defer f.Close()
	fi, err := f.Stat()
	if err != nil || fi.IsDir() {
		jsonErr(w, http.StatusNotFound, "media file not available")
		return
	}
	if mimetype == "" {
		mimetype = mime.TypeByExtension(strings.ToLower(filepath.Ext(resolved)))
	}
	if mimetype != "" {
		w.Header().Set("Content-Type", mimetype)
	}
	if name == "" {
		name = filepath.Base(resolved)
	}
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": name}))
	w.Header().Set("X-Media-Path", resolved)
	w.Header().Set("Cache-Control", "no-store")
	http.ServeContent(w, r, "", fi.ModTime(), f)
}

// GET /media/file/{id}: id is platform_message_id or gateway_messages.id.
func (a *ReadAPI) mediaByID(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		jsonErr(w, http.StatusBadRequest, "message id required")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	var content string
	err := a.db.QueryRowContext(ctx,
		`SELECT content FROM gateway_messages WHERE platform_message_id = ? OR id = ? ORDER BY occurred_at DESC LIMIT 1`, id, id).Scan(&content)
	if errors.Is(err, sql.ErrNoRows) {
		jsonErr(w, http.StatusNotFound, "message not found")
		return
	}
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "query failed")
		return
	}
	p, mt, name, err := mediaFromContent(content)
	if err != nil {
		jsonErr(w, http.StatusNotFound, "message has no downloaded media")
		return
	}
	a.serveFile(w, r, p, mt, name)
}

// GET /media/file?path=<absolute mediaPath under the data dir's media/>
func (a *ReadAPI) mediaByPath(w http.ResponseWriter, r *http.Request) {
	a.serveFile(w, r, strings.TrimSpace(r.URL.Query().Get("path")), "", "")
}
