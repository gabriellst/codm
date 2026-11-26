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
)

type Config struct {
	WebhookURL    string
	WebhookSecret string
	Allowlist     map[string]bool // normalized (see normalizeJID); "*" = everyone
	// SendAllowlist: extra chats POST /send may target (SEND_ALLOWLIST_JIDS).
	// It never affects webhook forwarding; "*" is ignored here on purpose.
	SendAllowlist map[string]bool
	ForwardFromMe bool
	OwnerID       string
	AutoPair      bool
	PairRounds    int
	PairPhone     string
	BindHost      string
	DataDir       string
	APIKey        string
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
	return &Config{
		WebhookURL:    strings.TrimSpace(os.Getenv("WEBHOOK_URL")),
		WebhookSecret: os.Getenv("WEBHOOK_SECRET"),
		Allowlist:     parseAllowlist(os.Getenv("ALLOWLIST_JIDS")),
		SendAllowlist: parseAllowlist(os.Getenv("SEND_ALLOWLIST_JIDS")),
		ForwardFromMe: truthy(env("FORWARD_FROM_ME", "false")),
		OwnerID:       env("TRIAGE_OWNER_ID", "box-owner"),
		AutoPair:      truthy(env("AUTO_PAIR", "true")),
		PairRounds:    rounds,
		PairPhone:     digits(os.Getenv("PAIR_PHONE")),
		BindHost:      env("BIND_HOST", "127.0.0.1"),
		DataDir:       dataDir,
		APIKey:        apiKey,
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

// SendAllowed reports whether POST /send may target jid: anything on
// ALLOWLIST_JIDS (unchanged behaviour) plus the send-only SEND_ALLOWLIST_JIDS.
func (c *Config) SendAllowed(jid string) bool {
	if c.Allowed(jid) {
		return true
	}
	return jid != "" && c.SendAllowlist[normalizeJID(jid)]
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
