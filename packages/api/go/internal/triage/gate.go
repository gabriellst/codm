package triage

import (
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Gate fronts EVERY route of the bridge: a request must carry
// "Authorization: Bearer <key>" where <key> is any scope key from scopes.json
// or GLOBAL_API_KEY. Each key (by scope name) gets a token bucket; failed
// auth attempts are throttled per client IP so a public deployment cannot be
// brute-forced cheaply. Handlers behind the gate keep their own, narrower
// checks (send scopes, GLOBAL_API_KEY-only routes).
type Gate struct {
	cfg     *Config
	perKey  *limiter
	badAuth *limiter
}

// RATE_LIMIT_PER_MINUTE (default 240) and RATE_LIMIT_BURST (default 60) size
// the per-key bucket; AUTH_FAIL_PER_MINUTE (default 20) the per-IP failure bucket.
func NewGate(cfg *Config) *Gate {
	perMin := envInt("RATE_LIMIT_PER_MINUTE", 240)
	burst := envInt("RATE_LIMIT_BURST", 60)
	fails := envInt("AUTH_FAIL_PER_MINUTE", 20)
	return &Gate{
		cfg:     cfg,
		perKey:  newLimiter(float64(perMin)/60, float64(burst)),
		badAuth: newLimiter(float64(fails)/60, float64(fails)),
	}
}

func envInt(k string, def int) int {
	if n, err := strconv.Atoi(strings.TrimSpace(os.Getenv(k))); err == nil && n > 0 {
		return n
	}
	return def
}

// scopeFor authenticates a request without writing a response.
func (g *Gate) scopeFor(r *http.Request) (*Scope, error) {
	tok, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok || strings.TrimSpace(tok) == "" {
		return nil, ErrUnknownKey
	}
	if g.cfg.Scopes != nil {
		return g.cfg.Scopes.Resolve(tok)
	}
	if g.cfg.APIKey == "" {
		return nil, ErrNoAuth
	}
	return NewScopeStore("", g.cfg.APIKey).Resolve(tok)
}

func (g *Gate) Wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := clientIP(r)
		if !g.badAuth.peek("ip:" + ip) {
			w.Header().Set("Retry-After", "60")
			jsonErr(w, http.StatusTooManyRequests, "too many failed auth attempts")
			return
		}
		sc, err := g.scopeFor(r)
		if errors.Is(err, ErrNoAuth) {
			jsonErr(w, http.StatusServiceUnavailable, "disabled: no scopes or GLOBAL_API_KEY configured")
			return
		}
		if err != nil || sc == nil {
			g.badAuth.allow("ip:" + ip)
			slog.Warn("triage: gate rejected request", "path", r.URL.Path, "ip", ip)
			jsonErr(w, http.StatusUnauthorized, "missing or invalid bearer token")
			return
		}
		if !g.perKey.allow("key:" + sc.Name) {
			w.Header().Set("Retry-After", "5")
			jsonErr(w, http.StatusTooManyRequests, "rate limit exceeded")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// clientIP prefers the first X-Forwarded-For hop (Railway's edge sets it).
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if first := strings.TrimSpace(strings.Split(xff, ",")[0]); first != "" {
			return first
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// limiter is a tiny keyed token bucket (no external deps).
type limiter struct {
	rate, burst float64
	mu          sync.Mutex
	buckets     map[string]*bucket
	now         func() time.Time
}

type bucket struct {
	tokens float64
	last   time.Time
}

func newLimiter(perSecond, burst float64) *limiter {
	return &limiter{rate: perSecond, burst: burst, buckets: map[string]*bucket{}, now: time.Now}
}

func (l *limiter) refill(k string) *bucket {
	now := l.now()
	b, ok := l.buckets[k]
	if !ok {
		if len(l.buckets) > 10000 { // bound memory under abuse
			l.buckets = map[string]*bucket{}
		}
		b = &bucket{tokens: l.burst, last: now}
		l.buckets[k] = b
		return b
	}
	b.tokens += now.Sub(b.last).Seconds() * l.rate
	if b.tokens > l.burst {
		b.tokens = l.burst
	}
	b.last = now
	return b
}

// allow consumes one token.
func (l *limiter) allow(k string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	b := l.refill(k)
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

// peek reports whether a token is available without consuming it.
func (l *limiter) peek(k string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.refill(k).tokens >= 1
}
