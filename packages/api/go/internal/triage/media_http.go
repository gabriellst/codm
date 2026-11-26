package triage

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	msgenums "template/api-go/internal/channel/enums"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	"template/api-go/internal/channel/services/gateway"
	"template/api-go/internal/channel/services/gateway/whatsapp"
	"template/api-go/internal/channel/services/pool"
	"template/core-go/db/sqlite"
)

type mediaRequest struct {
	ChatJID          string `json:"chat_jid"`
	Type             string `json:"type"`
	Path             string `json:"path,omitempty"`
	URL              string `json:"url,omitempty"`
	Caption          string `json:"caption,omitempty"`
	Filename         string `json:"filename,omitempty"`
	Mimetype         string `json:"mimetype,omitempty"`
	ReplyToMessageID string `json:"reply_to_message_id,omitempty"`
	// ReplyToSenderJID is the author of the quoted message; WhatsApp needs it
	// to render a quote inside a group.
	ReplyToSenderJID string `json:"reply_to_sender_jid,omitempty"`
}

// MediaEndpoint serves POST /send/media and GET /media/received.
type MediaEndpoint struct {
	cfg     *Config
	pairing *Pairing
	repo    channelrepo.ChannelRepository
	pool    pool.ChannelPool
	sent    *SentLog
	db      *sql.DB
	prep    *mediaPrep
	mediaDr string
}

func NewMediaEndpoint(cfg *Config, p *Pairing, repo channelrepo.ChannelRepository, pl pool.ChannelPool, sent *SentLog, store *sqlite.SqliteStore) *MediaEndpoint {
	prep := newMediaPrep(cfg)
	if !prep.hasFFmpeg() {
		slog.Warn("triage: ffmpeg/ffprobe not found — only documents can be sent via /send/media")
	}
	return &MediaEndpoint{cfg: cfg, pairing: p, repo: repo, pool: pl, sent: sent, db: store.DB(), prep: prep,
		mediaDr: filepath.Join(cfg.DataDir, "media")}
}

// authorize checks the loopback bearer key; it writes the error response itself.
func authorize(cfg *Config, w http.ResponseWriter, r *http.Request) bool {
	if cfg.APIKey == "" {
		jsonErr(w, http.StatusServiceUnavailable, "disabled: GLOBAL_API_KEY not configured")
		return false
	}
	tok, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok || subtle.ConstantTimeCompare([]byte(strings.TrimSpace(tok)), []byte(cfg.APIKey)) != 1 {
		jsonErr(w, http.StatusUnauthorized, "missing or invalid bearer token")
		return false
	}
	return true
}

func (e *MediaEndpoint) ServeSend(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonErr(w, http.StatusMethodNotAllowed, "POST only")
		return
	}
	if !authorize(e.cfg, w, r) {
		return
	}
	var req mediaRequest
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	req.ChatJID = strings.TrimSpace(req.ChatJID)
	kind, ok := parseKind(req.Type)
	if req.ChatJID == "" || !ok {
		jsonErr(w, http.StatusBadRequest, "chat_jid and type (image|video|audio|voice|document|sticker) are required")
		return
	}
	if (req.Path == "") == (req.URL == "") {
		jsonErr(w, http.StatusBadRequest, "provide exactly one of path or url")
		return
	}
	if len(req.Caption) > 1024 {
		jsonErr(w, http.StatusBadRequest, "caption too long (max 1024 chars)")
		return
	}
	if !strings.Contains(req.ChatJID, "@") {
		req.ChatJID = normalizeJID(req.ChatJID)
	}
	if !e.cfg.SendAllowed(req.ChatJID) {
		jsonErr(w, http.StatusForbidden, "chat_jid is not on ALLOWLIST_JIDS or SEND_ALLOWLIST_JIDS")
		return
	}
	chID, err := uuid.Parse(e.pairing.ChannelID())
	if err != nil {
		jsonErr(w, http.StatusServiceUnavailable, "channel not ready")
		return
	}

	tmp, err := os.MkdirTemp("", "codm-media-*")
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "cannot create temp dir")
		return
	}
	defer os.RemoveAll(tmp)

	ctx, cancel := context.WithTimeout(r.Context(), 6*time.Minute)
	defer cancel()
	pm, err := e.prep.Prepare(ctx, kind, req.Path, req.URL, req.Filename, req.Mimetype, tmp)
	if err != nil {
		var me *mediaError
		if errors.As(err, &me) {
			jsonErr(w, me.Status, me.Msg)
		} else {
			jsonErr(w, http.StatusInternalServerError, err.Error())
		}
		return
	}

	ch, err := e.repo.Find(ctx, chID.String())
	if err != nil || ch == nil || ch.Status != msgenums.ChannelStatusConnected {
		jsonErr(w, http.StatusConflict, "channel is not connected")
		return
	}
	gw, ok := e.pool.Get(chID)
	if !ok {
		jsonErr(w, http.StatusConflict, "channel not available")
		return
	}
	msgType := msgenums.MessageTypeImage
	switch pm.Kind {
	case KindVideo:
		msgType = msgenums.MessageTypeVideo
	case KindAudio, KindVoice:
		msgType = msgenums.MessageTypeAudio
	case KindDocument:
		msgType = msgenums.MessageTypeDocument
	case KindSticker:
		msgType = msgenums.MessageTypeSticker
	}
	caption := req.Caption
	if pm.Kind == KindAudio || pm.Kind == KindVoice || pm.Kind == KindSticker {
		caption = "" // WhatsApp has no caption for these
	}
	content := gateway.SendRichMediaContent{
		Kind: string(pm.Kind), Data: pm.Data, Mimetype: pm.Mimetype, Caption: caption, FileName: pm.FileName,
		Thumbnail: pm.Thumbnail, Width: pm.Width, Height: pm.Height, Seconds: pm.Seconds, Waveform: pm.Waveform,
		PTT: pm.PTT, Animated: pm.Animated,
		QuotedMessageID: req.ReplyToMessageID, QuotedParticipant: req.ReplyToSenderJID,
	}

	e.sent.BeginSend()
	res, err := gw.SendMessage(ctx, gateway.SendMessageParams{To: req.ChatJID, MessageType: msgType, Content: content})
	if err == nil {
		e.sent.Remember(ctx, res.MessageID)
	}
	e.sent.EndSend()
	if err != nil {
		code := http.StatusBadGateway
		if errors.Is(err, whatsapp.ErrInvalidRemoteID) {
			code = http.StatusBadRequest
		}
		slog.Error("triage: media send failed", "chat", req.ChatJID, "type", pm.Kind, "error", err)
		jsonErr(w, code, err.Error())
		return
	}
	if res.Timestamp == 0 {
		res.Timestamp = time.Now().Unix()
	}
	slog.Info("triage: media sent", "chat", req.ChatJID, "type", pm.Kind, "bytes", len(pm.Data), "messageId", res.MessageID)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok": true, "messageId": res.MessageID, "timestamp": res.Timestamp,
		"type": pm.Kind, "mimetype": pm.Mimetype, "bytes": len(pm.Data), "seconds": pm.Seconds,
	})
}

type receivedMedia struct {
	MessageID string `json:"messageId"`
	ChatJID   string `json:"chatJid"`
	SenderJID string `json:"senderJid"`
	Type      string `json:"type"`
	Mimetype  string `json:"mimetype,omitempty"`
	PTT       bool   `json:"ptt,omitempty"`
	Seconds   uint32 `json:"seconds,omitempty"`
	FileName  string `json:"fileName,omitempty"`
	Caption   string `json:"caption,omitempty"`
	Path      string `json:"path"`
	Timestamp int64  `json:"timestamp"` // unix seconds
}

// ServeReceived lists inbound media already saved under <data>/media.
//
//	GET /media/received?message_id=ID
//	GET /media/received?chat_jid=JID&type=audio&limit=20&since=<unix seconds>
func (e *MediaEndpoint) ServeReceived(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonErr(w, http.StatusMethodNotAllowed, "GET only")
		return
	}
	if !authorize(e.cfg, w, r) {
		return
	}
	q := r.URL.Query()
	where := []string{"direction = 'RECEIVED'", "message_type IN ('IMAGE','VIDEO','AUDIO','DOCUMENT','STICKER')", "content LIKE '%\"mediaPath\"%'"}
	var args []any
	if id := strings.TrimSpace(q.Get("message_id")); id != "" {
		where = append(where, "platform_message_id = ?")
		args = append(args, id)
	}
	if t := strings.ToUpper(strings.TrimSpace(q.Get("type"))); t != "" {
		switch t {
		case "IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "STICKER":
		case "VOICE":
			t = "AUDIO"
		default:
			jsonErr(w, http.StatusBadRequest, "type must be image|video|audio|voice|document|sticker")
			return
		}
		where = append(where, "message_type = ?")
		args = append(args, t)
	}
	if c := strings.TrimSpace(q.Get("chat_jid")); c != "" {
		if !strings.Contains(c, "@") {
			c = normalizeJID(c)
		}
		where = append(where, "remote_id = ?")
		args = append(args, normalizeJID(c))
	}
	if s := strings.TrimSpace(q.Get("since")); s != "" {
		n, err := strconv.ParseInt(s, 10, 64)
		if err != nil {
			jsonErr(w, http.StatusBadRequest, "since must be unix seconds")
			return
		}
		where = append(where, "occurred_at >= ?")
		args = append(args, n*1000)
	}
	limit := 20
	if s := q.Get("limit"); s != "" {
		n, err := strconv.Atoi(s)
		if err != nil || n < 1 || n > 100 {
			jsonErr(w, http.StatusBadRequest, "limit must be 1..100")
			return
		}
		limit = n
	}
	rows, err := e.db.QueryContext(r.Context(),
		`SELECT platform_message_id, remote_id, sender_remote_id, message_type, content, occurred_at
		   FROM gateway_messages WHERE `+strings.Join(where, " AND ")+` ORDER BY occurred_at DESC LIMIT 500`, args...)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "query failed")
		return
	}
	defer rows.Close()
	out := []receivedMedia{}
	for rows.Next() && len(out) < limit {
		var id, remote, sender, mtype, content string
		var at int64
		if rows.Scan(&id, &remote, &sender, &mtype, &content, &at) != nil {
			continue
		}
		if !e.cfg.SendAllowed(remote) {
			continue
		}
		if m, ok := e.parseReceived(id, remote, sender, mtype, content, at); ok {
			out = append(out, m)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"media": out, "count": len(out)})
}

func (e *MediaEndpoint) parseReceived(id, remote, sender, mtype, content string, at int64) (receivedMedia, bool) {
	var top map[string]json.RawMessage
	if json.Unmarshal([]byte(content), &top) != nil {
		return receivedMedia{}, false
	}
	for _, raw := range top {
		var d struct {
			MediaPath string `json:"mediaPath"`
			Mimetype  string `json:"mimetype"`
			PTT       bool   `json:"ptt"`
			Seconds   uint32 `json:"seconds"`
			FileName  string `json:"fileName"`
			Caption   string `json:"caption"`
		}
		if json.Unmarshal(raw, &d) != nil || d.MediaPath == "" {
			continue
		}
		if !within(e.mediaDr, filepath.Clean(d.MediaPath)) {
			continue
		}
		if _, err := os.Stat(d.MediaPath); err != nil {
			continue
		}
		return receivedMedia{MessageID: id, ChatJID: remote, SenderJID: sender, Type: strings.ToLower(mtype),
			Mimetype: d.Mimetype, PTT: d.PTT, Seconds: d.Seconds, FileName: d.FileName, Caption: d.Caption,
			Path: d.MediaPath, Timestamp: at / 1000}, true
	}
	return receivedMedia{}, false
}
