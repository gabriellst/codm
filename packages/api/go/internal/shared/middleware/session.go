package middleware

import (
	"database/sql"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
)

// Session reads the BetterAuth session cookie, queries the authentication.session
// table to resolve ownerId, and injects it as the X-Owner-Id request header.
// Controllers read it via `from:"header" name:"X-Owner-Id"`.
func Session(db *sql.DB) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			rawToken := extractCookie(r, "better-auth.session_token")
			if rawToken == "" {
				next.ServeHTTP(w, r)
				return
			}

			// URL-decode the cookie value (browsers may encode +, /, = as %2B, %2F, %3D)
			decoded, err := url.QueryUnescape(rawToken)
			if err != nil {
				decoded = rawToken
			}

			// BetterAuth cookie format: "<token>.<signature>" — DB stores only the token part
			token := decoded
			if idx := strings.Index(token, "."); idx > 0 {
				token = token[:idx]
			}

			// NOTE(template-parity debt): the template Dels X-Owner-Id here as a
			// spoof guard and re-sets it from the session lookup. codedm cannot
			// do that yet — identity arrives via the api-ts pairing proxy
			// (external/utils/forwardToChannel stamps X-Owner-Id server-side,
			// overwriting any client value) and this cookie lookup queries a
			// table/column that doesn't exist in the contracts schema
			// (authentication.session/owner_id vs sessions/active_owner_id), so
			// a Del would leave every proxied request anonymous. Direct :3032
			// access is CORS-gated + single-operator. Revisit in tenancy phase.

			var ownerId sql.NullString
			err = db.QueryRowContext(r.Context(),
				`SELECT owner_id FROM authentication.session WHERE token = $1 AND expires_at > NOW()`,
				token,
			).Scan(&ownerId)

			if err != nil {
				// Never log the session token — it is a bearer credential.
				slog.Debug("session middleware: DB query failed", "error", err)
			}

			if ownerId.Valid && ownerId.String != "" {
				r.Header.Set("X-Owner-Id", ownerId.String)
				slog.Debug("session middleware: resolved", "ownerId", ownerId.String)
			}

			next.ServeHTTP(w, r)
		})
	}
}

// extractCookie parses the Cookie header to find a cookie by name.
// Handles cookie names with dots (like "better-auth.session_token")
// which Go's standard r.Cookie() can sometimes mishandle.
func extractCookie(r *http.Request, name string) string {
	// Try Go's built-in parser first
	for _, c := range r.Cookies() {
		if c.Name == name {
			return c.Value
		}
	}
	// Fallback: parse raw Cookie header manually
	raw := r.Header.Get("Cookie")
	for _, part := range strings.Split(raw, ";") {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, name+"=") {
			return strings.TrimPrefix(part, name+"=")
		}
	}
	return ""
}
