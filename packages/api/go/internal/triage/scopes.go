package triage

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log/slog"
	"os"
	"strings"
	"sync"
	"time"
)

// ErrUnknownKey is returned when the bearer token matches no scope key and
// is not GLOBAL_API_KEY.
var ErrUnknownKey = errors.New("unknown key")

// ErrNoAuth is returned when no scopes are loaded and GLOBAL_API_KEY is unset,
// so nothing can authenticate.
var ErrNoAuth = errors.New("no scopes or GLOBAL_API_KEY configured")

// Scope is one bot's send credential and contact list. The key is unexported
// so it cannot be logged or JSON-encoded by accident.
type Scope struct {
	Name string
	jids map[string]bool // normalized (see normalizeJID)
}

// Allows reports whether this scope may send to jid.
func (s *Scope) Allows(jid string) bool {
	if s == nil || jid == "" {
		return false
	}
	return s.jids[normalizeJID(jid)]
}

type scopeFile struct {
	Scopes []scopeFileEntry `json:"scopes"`
}

type scopeFileEntry struct {
	Name string   `json:"name"`
	Key  string   `json:"key"`
	JIDs []string `json:"jids"`
}

type loadedScope struct {
	Scope
	key string
}

// ScopeStore loads per-bot send scopes from a JSON file and reloads them when
// the file changes, so list edits do not require a process restart.
type ScopeStore struct {
	path      string
	globalKey string // GLOBAL_API_KEY; maps to the "whatsapp" scope only

	mu     sync.Mutex
	mtime  time.Time
	size   int64
	scopes []loadedScope
	byName map[string]int // name → index into scopes
}

// NewScopeStore reads path (SCOPES_FILE or <dataDir>/scopes.json). globalKey
// is GLOBAL_API_KEY and is never written to the file.
func NewScopeStore(path, globalKey string) *ScopeStore {
	s := &ScopeStore{path: path, globalKey: globalKey, byName: map[string]int{}}
	if err := s.reload(); err != nil && !errors.Is(err, os.ErrNotExist) {
		slog.Warn("triage: scopes.json not loaded", "path", path, "error", err)
	}
	return s
}

func (s *ScopeStore) reload() error {
	if s == nil || s.path == "" {
		return os.ErrNotExist
	}
	fi, err := os.Stat(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			s.mu.Lock()
			s.mtime = time.Time{}
			s.size = 0
			s.scopes = nil
			s.byName = map[string]int{}
			s.mu.Unlock()
		}
		return err
	}

	s.mu.Lock()
	unchanged := fi.ModTime().Equal(s.mtime) && fi.Size() == s.size && s.byName != nil
	s.mu.Unlock()
	if unchanged {
		return nil
	}

	data, err := os.ReadFile(s.path)
	if err != nil {
		return err
	}
	var doc scopeFile
	if err := json.Unmarshal(data, &doc); err != nil {
		return err
	}

	parsed := make([]loadedScope, 0, len(doc.Scopes))
	byName := make(map[string]int, len(doc.Scopes))
	seenKey := map[string]string{} // key → name, for collision warnings only
	for _, e := range doc.Scopes {
		name := strings.TrimSpace(e.Name)
		key := strings.TrimSpace(e.Key)
		if name == "" || key == "" {
			slog.Warn("triage: skipping scope with empty name or key")
			continue
		}
		jids := map[string]bool{}
		for _, j := range e.JIDs {
			j = strings.TrimSpace(j)
			if j == "" {
				continue
			}
			jids[normalizeJID(j)] = true
		}
		if prev, ok := byName[name]; ok {
			slog.Warn("triage: duplicate scope name, last entry wins", "scope", name)
			parsed[prev] = loadedScope{Scope: Scope{Name: name, jids: jids}, key: key}
			continue
		}
		if other, ok := seenKey[key]; ok {
			slog.Warn("triage: duplicate scope key", "scope", name, "other", other)
		}
		seenKey[key] = name
		byName[name] = len(parsed)
		parsed = append(parsed, loadedScope{Scope: Scope{Name: name, jids: jids}, key: key})
	}

	s.mu.Lock()
	s.mtime = fi.ModTime()
	s.size = fi.Size()
	s.scopes = parsed
	s.byName = byName
	s.mu.Unlock()
	return nil
}

// Resolve maps a bearer token to a scope. GLOBAL_API_KEY (if set) always
// resolves to the "whatsapp" scope only, never the union of all scopes.
// The returned Scope is a copy; the key is not included.
func (s *ScopeStore) Resolve(token string) (*Scope, error) {
	if s == nil {
		return nil, ErrNoAuth
	}
	if err := s.reload(); err != nil && !errors.Is(err, os.ErrNotExist) {
		// Keep the last good snapshot; still try to resolve against it.
		slog.Warn("triage: scopes.json reload failed, using last snapshot", "path", s.path, "error", err)
	}

	token = strings.TrimSpace(token)

	s.mu.Lock()
	defer s.mu.Unlock()

	if len(s.scopes) == 0 && s.globalKey == "" {
		return nil, ErrNoAuth
	}
	if token == "" {
		return nil, ErrUnknownKey
	}

	var matched *Scope
	for i := range s.scopes {
		if subtle.ConstantTimeCompare([]byte(token), []byte(s.scopes[i].key)) == 1 {
			cp := s.scopes[i].Scope
			cp.jids = copyJids(s.scopes[i].jids)
			matched = &cp
		}
	}
	if s.globalKey != "" && subtle.ConstantTimeCompare([]byte(token), []byte(s.globalKey)) == 1 {
		matched = s.whatsappLocked()
	}
	if matched == nil {
		return nil, ErrUnknownKey
	}
	return matched, nil
}

// Lookup returns a copy of the named scope (reloading first). Used by
// GET /media/received, which stays on GLOBAL_API_KEY and lists the whatsapp
// scope's chats.
func (s *ScopeStore) Lookup(name string) *Scope {
	if s == nil {
		return nil
	}
	if err := s.reload(); err != nil && !errors.Is(err, os.ErrNotExist) {
		slog.Warn("triage: scopes.json reload failed, using last snapshot", "path", s.path, "error", err)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	i, ok := s.byName[name]
	if !ok {
		return nil
	}
	cp := s.scopes[i].Scope
	cp.jids = copyJids(s.scopes[i].jids)
	return &cp
}

func (s *ScopeStore) whatsappLocked() *Scope {
	if i, ok := s.byName["whatsapp"]; ok {
		cp := s.scopes[i].Scope
		cp.jids = copyJids(s.scopes[i].jids)
		return &cp
	}
	return &Scope{Name: "whatsapp", jids: map[string]bool{}}
}

// Summary is names and chat counts only — never keys. For startup logs.
func (s *ScopeStore) Summary() []string {
	if s == nil {
		return nil
	}
	_ = s.reload()
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]string, 0, len(s.scopes))
	for _, sc := range s.scopes {
		out = append(out, sc.Name)
	}
	return out
}

func copyJids(in map[string]bool) map[string]bool {
	out := make(map[string]bool, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}
