package triage

import (
	"context"
	"database/sql"
	"log/slog"
	"strings"
	"sync"
	"time"
)

// archiveCacheTTL bounds how stale an archived/unarchived answer can be.
const archiveCacheTTL = 5 * time.Second

// ChatFilter decides, per inbound message, whether its CHAT is eligible for the
// triage webhook: never newsletters/broadcasts, never DENYLIST_JIDS, and (when
// SKIP_ARCHIVED_CHATS is on) never chats archived on the phone.
//
// Archived state is read live from whatsmeow's own app-state mirror
// (whatsmeow_chat_settings.archived) — not from gateway_remotes.archived, which
// only tracks patches that arrived after the remote row existed. whatsmeow keys
// that table by LID for many DMs while the gateway keys chats by phone number,
// so every lookup fans out over the LID<->PN aliases (whatsmeow_lid_map stores
// bare numbers).
//
// Read-only: it never writes, so it cannot interfere with the send path, the
// Supervisor's polling, or whatsmeow's app-state writer.
type ChatFilter struct {
	db  *sql.DB
	cfg *Config
	now func() time.Time

	mu    sync.Mutex
	cache map[string]archivedEntry
}

type archivedEntry struct {
	archived bool
	at       time.Time
}

func NewChatFilter(cfg *Config, db *sql.DB) *ChatFilter {
	return &ChatFilter{db: db, cfg: cfg, now: time.Now, cache: map[string]archivedEntry{}}
}

// skipServer: chats that are not conversations (Stories, channels).
func skipServer(jid string) bool {
	_, server, ok := strings.Cut(strings.ToLower(strings.TrimSpace(jid)), "@")
	return ok && (server == "newsletter" || server == "broadcast")
}

// aliases returns the chat JID plus its LID/PN counterparts, normalized.
func (f *ChatFilter) aliases(ctx context.Context, jids ...string) []string {
	seen := map[string]bool{}
	var out []string
	add := func(j string) {
		if j = normalizeJID(j); j != "" && !seen[j] {
			seen[j] = true
			out = append(out, j)
		}
	}
	for _, j := range jids {
		if strings.TrimSpace(j) == "" {
			continue
		}
		add(j)
		user, server, _ := strings.Cut(strings.ToLower(strings.TrimSpace(j)), "@")
		if i := strings.IndexByte(user, ':'); i >= 0 {
			user = user[:i]
		}
		if server == "g.us" || f == nil || f.db == nil {
			continue
		}
		user = digits(user)
		if user == "" {
			continue
		}
		rows, err := f.db.QueryContext(ctx, `SELECT lid, pn FROM whatsmeow_lid_map WHERE lid = ? OR pn = ?`, user, user)
		if err != nil {
			slog.Debug("triage: lid_map lookup failed", "error", err)
			continue
		}
		for rows.Next() {
			var lid, pn string
			if rows.Scan(&lid, &pn) == nil {
				add(lid + "@lid")
				add(pn + "@s.whatsapp.net")
			}
		}
		_ = rows.Close()
	}
	return out
}

// Denied reports whether the chat (any of its aliases) is on DENYLIST_JIDS.
func (f *ChatFilter) Denied(ctx context.Context, jids ...string) bool {
	if f == nil || len(f.cfg.Denylist) == 0 {
		return false
	}
	for _, a := range f.aliases(ctx, jids...) {
		if f.cfg.Denylist[a] {
			return true
		}
	}
	return false
}

// Archived reports whether the chat is archived right now (answers are cached
// for at most archiveCacheTTL; fresh=true bypasses the cache). On a DB error it
// answers false, i.e. fails open so a read problem never silences a chat.
func (f *ChatFilter) Archived(ctx context.Context, fresh bool, jids ...string) bool {
	if f == nil || f.db == nil || len(jids) == 0 {
		return false
	}
	key := ""
	for _, j := range jids {
		if j != "" {
			key = normalizeJID(j)
			break
		}
	}
	if key == "" {
		return false
	}
	if !fresh {
		f.mu.Lock()
		e, ok := f.cache[key]
		f.mu.Unlock()
		if ok && f.now().Sub(e.at) < archiveCacheTTL {
			return e.archived
		}
	}
	al := f.aliases(ctx, jids...)
	if len(al) == 0 {
		return false
	}
	ph := strings.TrimSuffix(strings.Repeat("?,", len(al)), ",")
	args := make([]any, len(al))
	for i, a := range al {
		args[i] = a
	}
	var n int
	err := f.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM whatsmeow_chat_settings WHERE archived = 1 AND chat_jid IN (`+ph+`)`, args...).Scan(&n)
	if err != nil {
		slog.Warn("triage: archived lookup failed — treating chat as not archived", "error", err)
		return false
	}
	archived := n > 0
	f.mu.Lock()
	if len(f.cache) > 2048 {
		f.cache = map[string]archivedEntry{}
	}
	f.cache[key] = archivedEntry{archived: archived, at: f.now()}
	f.mu.Unlock()
	return archived
}

// Skip is the full chat-level decision. reason is "" when the chat may be
// forwarded; otherwise one of "server", "denylist", "archived".
func (f *ChatFilter) Skip(ctx context.Context, jids ...string) (reason string) {
	for _, j := range jids {
		if skipServer(j) {
			return "server"
		}
	}
	if f.Denied(ctx, jids...) {
		return "denylist"
	}
	if f.cfg.SkipArchived && f.Archived(ctx, false, jids...) {
		return "archived"
	}
	return ""
}
