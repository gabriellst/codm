// Package triage turns the codm gateway into a read-mostly WhatsApp BRIDGE for
// an external agent (the Grok Bot box deployment): whatsmeow gateway + an
// HMAC-signed webhook for inbound messages from allowlisted chats, one
// loopback-only authenticated send endpoint, and headless QR / pairing-code
// pairing. It never runs agent tasks/sessions — that is the TS daemon's job,
// and the TS daemon is not part of this binary.
package triage

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	WebhookURL    string
	WebhookSecret string
	Allowlist     map[string]bool // normalized (see normalizeJID); "*" = everyone. Webhook only.
	ForwardFromMe bool
	// Denylist: chats never forwarded (DENYLIST_JIDS). Matches the chat JID and
	// its LID/PN aliases, never the sender. Webhook only — /send is untouched.
	Denylist map[string]bool
	// SkipArchived drops messages of chats archived on the phone
	// (SKIP_ARCHIVED_CHATS, default false), read live from whatsmeow's
	// whatsmeow_chat_settings. ArchiveRecheck re-checks a skipped chat once
	// after this delay so a message that un-archives its chat is not lost
	// (ARCHIVE_RECHECK_SECONDS, default 20, 0 = off).
	SkipArchived   bool
	ArchiveRecheck time.Duration
	// DebounceQuiet > 0 (WEBHOOK_DEBOUNCE_SECONDS) buffers a chat's messages and
	// sends ONE batch webhook after that much quiet, at most DebounceMaxWait
	// (WEBHOOK_DEBOUNCE_MAX_WAIT_SECONDS, default 900) after the first message.
	// 0 (default) = one webhook per message, exactly the previous behaviour.
	DebounceQuiet   time.Duration
	DebounceMaxWait time.Duration
	OwnerID         string
	AutoPair        bool
	PairRounds      int
	PairPhone       string
	BindHost        string
	DataDir         string
	APIKey          string // GLOBAL_API_KEY; maps to the "whatsapp" send scope only
	ScopesFile      string
	Scopes          *ScopeStore
}

func LoadConfig() *Config {
	dataDir := os.Getenv("CODM_DATA_DIR")
	if dataDir == "" {
		dataDir = "."
	}
	rounds, err := strconv.Atoi(env("PAIR_ROUNDS", "3"))
	if err != nil || rounds < 1 {
		rounds = 3
	}
	apiKey := os.Getenv("CHANNEL_GLOBAL_API_KEY")
	if apiKey == "" {
		apiKey = os.Getenv("GLOBAL_API_KEY")
	}
	scopesFile := strings.TrimSpace(os.Getenv("SCOPES_FILE"))
	if scopesFile == "" {
		scopesFile = filepath.Join(dataDir, "scopes.json")
	}
	return &Config{
		WebhookURL:      strings.TrimSpace(os.Getenv("WEBHOOK_URL")),
		WebhookSecret:   os.Getenv("WEBHOOK_SECRET"),
		Allowlist:       parseAllowlist(os.Getenv("ALLOWLIST_JIDS")),
		ForwardFromMe:   truthy(env("FORWARD_FROM_ME", "false")),
		Denylist:        parseAllowlist(os.Getenv("DENYLIST_JIDS")),
		SkipArchived:    truthy(env("SKIP_ARCHIVED_CHATS", "false")),
		ArchiveRecheck:  envSeconds("ARCHIVE_RECHECK_SECONDS", 20),
		DebounceQuiet:   envSeconds("WEBHOOK_DEBOUNCE_SECONDS", 0),
		DebounceMaxWait: envSeconds("WEBHOOK_DEBOUNCE_MAX_WAIT_SECONDS", 900),
		OwnerID:         env("TRIAGE_OWNER_ID", "box-owner"),
		AutoPair:        truthy(env("AUTO_PAIR", "true")),
		PairRounds:      rounds,
		PairPhone:       digits(os.Getenv("PAIR_PHONE")),
		BindHost:        env("BIND_HOST", "127.0.0.1"),
		DataDir:         dataDir,
		APIKey:          apiKey,
		ScopesFile:      scopesFile,
		Scopes:          NewScopeStore(scopesFile, apiKey),
	}
}

func (c *Config) Path(name string) string { return filepath.Join(c.DataDir, name) }

// Allowed reports whether any of the given JIDs is on the allowlist.
func (c *Config) Allowed(jids ...string) bool {
	if c.Allowlist["*"] {
		return true
	}
	for _, j := range jids {
		if j == "" {
			continue
		}
		if c.Allowlist[normalizeJID(j)] {
			return true
		}
	}
	return false
}

// receivedAllowed reports whether GET /media/received may list a chat.
// GLOBAL_API_KEY is scoped to the whatsapp contact list; if that scope is
// missing, fall back to ALLOWLIST_JIDS (webhook list).
func (c *Config) receivedAllowed(jid string) bool {
	if c.Scopes != nil {
		if sc := c.Scopes.Lookup("whatsapp"); sc != nil {
			return sc.Allows(jid)
		}
	}
	return c.Allowed(jid)
}

func parseAllowlist(raw string) map[string]bool {
	out := map[string]bool{}
	for _, p := range strings.FieldsFunc(raw, func(r rune) bool { return r == ',' || r == ' ' || r == ';' || r == '\n' }) {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if p == "*" {
			out["*"] = true
			continue
		}
		out[normalizeJID(p)] = true
	}
	return out
}

// normalizeJID: "5585999999999:12@s.whatsapp.net" / "+55 85 99999-9999" →
// "5585999999999@s.whatsapp.net"; groups and LIDs keep their server.
func normalizeJID(j string) string {
	j = strings.ToLower(strings.TrimSpace(j))
	user, server, found := strings.Cut(j, "@")
	if !found {
		return digits(user) + "@s.whatsapp.net"
	}
	if i := strings.IndexByte(user, ':'); i >= 0 {
		user = user[:i]
	}
	if server == "c.us" {
		server = "s.whatsapp.net"
	}
	if server == "s.whatsapp.net" {
		user = digits(user)
	}
	return user + "@" + server
}

func digits(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func env(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func truthy(s string) bool {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}

// envSeconds reads a non-negative integer number of seconds; anything else
// (unset, garbage, negative) falls back to def.
func envSeconds(k string, def int) time.Duration {
	n, err := strconv.Atoi(strings.TrimSpace(os.Getenv(k)))
	if err != nil || n < 0 {
		n = def
	}
	return time.Duration(n) * time.Second
}
