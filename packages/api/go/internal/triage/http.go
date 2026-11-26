package triage

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"strings"

	"go.uber.org/fx"

	"template/api-go/internal/channel/usecases"
	"template/core-go/config"
	coreerrors "template/core-go/errors"
	"template/core-go/middleware"
	"template/core-go/services/httprouter"
	"template/core-go/types"
)

// FilterControllers keeps the read-only routes (every GET) plus the two
// channel-lifecycle POSTs pairing may need; every upstream send / mutate /
// delete route is dropped. The ONLY way to send is POST /send below.
func FilterControllers(in []types.Controller) []types.Controller {
	allowed := map[string]bool{
		"POST /channels/{id}/connect": true,
		"POST /channels/{id}/restart": true,
	}
	out := make([]types.Controller, 0, len(in))
	for _, c := range in {
		m := c.Metadata()
		if m.Method == http.MethodGet || allowed[m.Method+" "+m.Path] {
			out = append(out, c)
			continue
		}
		slog.Debug("triage: route disabled", "method", m.Method, "path", m.Path)
	}
	return out
}

type sendRequest struct {
	ChatJID          string `json:"chat_jid"`
	Text             string `json:"text"`
	ReplyToMessageID string `json:"reply_to_message_id,omitempty"`
}

type SendEndpoint struct {
	cfg     *Config
	pairing *Pairing
	send    *usecases.SendTextHandler
	sent    *SentLog
}

func NewSendEndpoint(cfg *Config, p *Pairing, s *usecases.SendTextHandler, sent *SentLog) *SendEndpoint {
	return &SendEndpoint{cfg: cfg, pairing: p, send: s, sent: sent}
}

func jsonErr(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func jsonErrScope(w http.ResponseWriter, code int, msg, scope string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg, "scope": scope})
}

// resolveSendScope authenticates POST /send and POST /send/media against
// scopes.json (or GLOBAL_API_KEY → the whatsapp scope). It writes the error
// response itself and returns nil when the request must stop.
func resolveSendScope(cfg *Config, w http.ResponseWriter, r *http.Request) *Scope {
	tok, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok {
		tok = ""
	}
	var (
		sc  *Scope
		err error
	)
	if cfg.Scopes != nil {
		sc, err = cfg.Scopes.Resolve(tok)
	} else if cfg.APIKey == "" {
		err = ErrNoAuth
	} else {
		// Tests may set APIKey without a store; treat it as the whatsapp scope with no chats.
		store := NewScopeStore("", cfg.APIKey)
		sc, err = store.Resolve(tok)
	}
	if errors.Is(err, ErrNoAuth) {
		jsonErr(w, http.StatusServiceUnavailable, "send disabled: no scopes or GLOBAL_API_KEY configured")
		return nil
	}
	if err != nil || sc == nil {
		jsonErr(w, http.StatusUnauthorized, "missing or invalid bearer token")
		return nil
	}
	return sc
}

func (s *SendEndpoint) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonErr(w, http.StatusMethodNotAllowed, "POST only")
		return
	}
	sc := resolveSendScope(s.cfg, w, r)
	if sc == nil {
		return
	}
	var req sendRequest
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	req.ChatJID = strings.TrimSpace(req.ChatJID)
	if req.ChatJID == "" || strings.TrimSpace(req.Text) == "" {
		jsonErr(w, http.StatusBadRequest, "chat_jid and text are required")
		return
	}
	if !strings.Contains(req.ChatJID, "@") {
		req.ChatJID = normalizeJID(req.ChatJID)
	}
	if !sc.Allows(req.ChatJID) {
		slog.Warn("triage: send rejected, chat not in scope", "chat", req.ChatJID, "scope", sc.Name)
		jsonErrScope(w, http.StatusForbidden, `chat_jid is not in scope "`+sc.Name+`"`, sc.Name)
		return
	}
	chID := s.pairing.ChannelID()
	if chID == "" {
		jsonErr(w, http.StatusServiceUnavailable, "channel not ready")
		return
	}
	s.sent.BeginSend()
	out, err := s.send.Execute(r.Context(), usecases.SendTextInput{
		ChannelID: chID, RemoteID: req.ChatJID, Text: req.Text, QuotedMessageID: req.ReplyToMessageID,
	})
	if err == nil {
		s.sent.Remember(r.Context(), out.MessageID)
	}
	s.sent.EndSend()
	if err != nil {
		var appErr *coreerrors.AppError
		code := http.StatusBadGateway
		if errors.As(err, &appErr) {
			code = http.StatusConflict
		}
		slog.Error("triage: send failed", "chat", req.ChatJID, "scope", sc.Name, "error", err)
		jsonErr(w, code, err.Error())
		return
	}
	slog.Info("triage: sent", "chat", req.ChatJID, "scope", sc.Name, "messageId", out.MessageID)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "messageId": out.MessageID, "timestamp": out.Timestamp})
}

// StartServer replaces core.StartHTTPServer: same router, but bound to
// BIND_HOST (default 127.0.0.1) and with /send + /triage/status in front.
func StartServer(lc fx.Lifecycle, router *httprouter.HttpRouter, coreCfg *config.Config, cfg *Config, send *SendEndpoint, media *MediaEndpoint, p *Pairing) error {
	mux := http.NewServeMux()
	mux.Handle("/send", send)
	mux.HandleFunc("/send/media", media.ServeSend)
	mux.HandleFunc("/media/received", media.ServeReceived)
	mux.HandleFunc("/triage/status", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(p.Snapshot())
	})
	mux.Handle("/", middleware.CORS(coreCfg.AllowedOrigins, router.Handler()))

	ln, err := net.Listen("tcp", net.JoinHostPort(cfg.BindHost, coreCfg.Port))
	if err != nil {
		return err
	}
	srv := &http.Server{Handler: mux}
	runCtx, cancel := context.WithCancel(context.Background())
	lc.Append(fx.Hook{
		OnStart: func(context.Context) error {
			go func() {
				slog.Info("triage: http server started", "addr", ln.Addr().String())
				if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
					slog.Error("http server error", "error", err)
				}
			}()
			go p.Run(runCtx)
			return nil
		},
		OnStop: func(ctx context.Context) error {
			cancel()
			return srv.Shutdown(ctx)
		},
	})
	return nil
}
