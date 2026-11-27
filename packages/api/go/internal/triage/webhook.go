package triage

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"sync"
	"time"

	"template/api-go/internal/channel/services/pool"
	"template/contracts-go/wire"
	"template/core-go/db/sqlite"
	"template/core-go/services/mediator"
	"template/core-go/types"
)

// WebhookForwarder is an IntegrationEventHandler on the integration outbox lane:
// it runs asynchronously from the receive path, and returning an error on a
// non-2xx / transport failure reuses the outbox retry (30s lease, 5 attempts,
// then dead-letter).
type WebhookForwarder struct {
	cfg     *Config
	pool    pool.ChannelPool
	sent    *SentLog
	client  *http.Client
	filter  *ChatFilter
	batcher *Batcher // nil unless WEBHOOK_DEBOUNCE_SECONDS > 0
	recheck *archiveRecheck
}

func NewWebhookForwarder(cfg *Config, p pool.ChannelPool, sent *SentLog, store *sqlite.SqliteStore) (*WebhookForwarder, error) {
	w := &WebhookForwarder{cfg: cfg, pool: p, sent: sent, client: &http.Client{Timeout: 15 * time.Second}}
	w.filter = NewChatFilter(cfg, store.DB())
	w.recheck = newArchiveRecheck(cfg.ArchiveRecheck, w.filter)
	if cfg.DebounceQuiet > 0 {
		b, err := NewBatcher(store.DB(), cfg.DebounceQuiet, cfg.DebounceMaxWait, w.postBatch)
		if err != nil {
			return nil, err
		}
		w.batcher = b
	}
	return w, nil
}

var _ mediator.IntegrationEventHandler = (*WebhookForwarder)(nil)

func (w *WebhookForwarder) EventName() string { return wire.ChannelMessageReceivedEventName }

type webhookBody struct {
	Event          string          `json:"event"`
	EventID        string          `json:"eventId"`
	ChannelID      string          `json:"channelId"`
	MessageID      string          `json:"messageId"`
	ChatJID        string          `json:"chatJid"`
	ChatPhoneJID   string          `json:"chatPhoneJid,omitempty"`
	SenderJID      string          `json:"senderJid"`
	SenderPhoneJID string          `json:"senderPhoneJid,omitempty"`
	IsGroup        bool            `json:"isGroup"`
	FromMe         bool            `json:"fromMe"`
	MessageType    string          `json:"messageType"`
	Text           string          `json:"text,omitempty"`
	Timestamp      int64           `json:"timestamp"`
	Payload        json.RawMessage `json:"payload"`
}

func (w *WebhookForwarder) Handle(ctx context.Context, event types.IntegrationEventI) error {
	e, err := types.UnmarshalIntegrationEvent[wire.ChannelMessageReceivedPayload](event)
	if err != nil {
		slog.Error("triage: cannot decode message_received — dropping", "error", err)
		return nil // poison row: retrying will not help
	}
	p := e.Payload
	if p.FromMe && !w.cfg.ForwardFromMe {
		return nil
	}
	// Echo of a message we ourselves sent via POST /send — never forward,
	// or FORWARD_FROM_ME would feed the bot its own replies.
	wait := time.Duration(0)
	if p.FromMe {
		wait = 500 * time.Millisecond
	}
	if w.sent.OwnSend(ctx, p.MessageID, wait) {
		slog.Info("triage: skipping echo of our own /send", "messageId", p.MessageID, "chat", p.RemoteID)
		return nil
	}

	// Stories and channels are never conversations — drop before any lookup.
	if skipServer(p.RemoteID) {
		return nil
	}

	chatPhone, senderPhone := p.RemoteID, p.SenderID
	if ch, ok := w.pool.Get(p.ChannelID); ok {
		chatPhone = ch.ResolvePhoneJID(ctx, p.RemoteID)
		senderPhone = ch.ResolvePhoneJID(ctx, p.SenderID)
	}
	if !w.cfg.Allowed(p.RemoteID, chatPhone, p.SenderID, senderPhone) {
		slog.Debug("triage: message from non-allowlisted chat ignored", "chat", p.RemoteID)
		return nil
	}
	switch reason := w.filter.Skip(ctx, p.RemoteID, chatPhone); reason {
	case "":
	case "archived":
		slog.Info("triage: skipped (archived chat)", "chat", p.RemoteID, "messageId", p.MessageID)
		// WhatsApp un-archives a chat on a new message unless "keep archived"
		// is on, and the un-archive patch can land just after the message:
		// look once more shortly and forward it if the chat is active again.
		w.recheck.schedule(p.RemoteID, func() {
			if err := w.deliver(context.Background(), event, p, chatPhone, senderPhone); err != nil {
				slog.Warn("triage: late forward after un-archive failed", "chat", p.RemoteID, "messageId", p.MessageID, "error", err)
			}
		})
		return nil
	default:
		slog.Info("triage: skipped ("+reason+")", "chat", p.RemoteID, "messageId", p.MessageID)
		return nil
	}
	return w.deliver(ctx, event, p, chatPhone, senderPhone)
}

// deliver sends the message — per message (default) or into the debounce buffer.
func (w *WebhookForwarder) deliver(ctx context.Context, event types.IntegrationEventI, p wire.ChannelMessageReceivedPayload, chatPhone, senderPhone string) error {
	if w.batcher != nil {
		return w.batcher.Add(ctx, BatchChat{
			ChannelID: p.ChannelID.String(), ChatJID: p.RemoteID,
			ChatName: w.chatName(ctx, p.ChannelID.String(), p.RemoteID, chatPhone), IsGroup: p.IsGroup,
		}, BatchItem{
			SenderJID: p.SenderID, SenderName: w.senderName(ctx, p, senderPhone),
			MessageID: p.MessageID, MessageType: string(p.MessageType),
			Text: extractText(p.Content), Timestamp: p.Timestamp,
		})
	}

	rawPayload, _ := json.Marshal(p)
	eventID := ""
	if g, ok := event.(interface{ GetEventID() string }); ok {
		eventID = g.GetEventID()
	}
	body := webhookBody{
		Event: event.GetEventName(), EventID: eventID,
		ChannelID: p.ChannelID.String(), MessageID: p.MessageID,
		ChatJID: p.RemoteID, SenderJID: p.SenderID,
		IsGroup: p.IsGroup, FromMe: p.FromMe,
		MessageType: string(p.MessageType), Text: extractText(p.Content),
		Timestamp: p.Timestamp, Payload: rawPayload,
	}
	if chatPhone != p.RemoteID {
		body.ChatPhoneJID = chatPhone
	}
	if senderPhone != p.SenderID {
		body.SenderPhoneJID = senderPhone
	}
	buf, err := json.Marshal(body)
	if err != nil {
		return nil
	}

	if w.cfg.WebhookURL == "" {
		slog.Info("triage: WEBHOOK_URL unset — would forward", "chat", p.RemoteID, "messageId", p.MessageID, "type", body.MessageType)
		return nil
	}
	if err := w.post(ctx, body.Event, eventID, buf); err != nil {
		return err
	}
	slog.Info("triage: forwarded message", "chat", p.RemoteID, "messageId", p.MessageID)
	return nil
}

// postBatch is the Batcher's transport: same URL, same signatures.
func (w *WebhookForwarder) postBatch(ctx context.Context, eventID string, buf []byte) error {
	if w.cfg.WebhookURL == "" {
		slog.Info("triage: WEBHOOK_URL unset — would forward batch", "batchId", eventID)
		return nil
	}
	return w.post(ctx, BatchEventName, eventID, buf)
}

// post signs and POSTs one webhook body. Non-2xx and transport errors are
// returned so callers can retry (outbox lane or batcher backoff).
func (w *WebhookForwarder) post(ctx context.Context, event, eventID string, buf []byte) error {
	ts := strconv.FormatInt(time.Now().Unix(), 10)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, w.cfg.WebhookURL, bytes.NewReader(buf))
	if err != nil {
		slog.Error("triage: bad WEBHOOK_URL", "error", err)
		return nil
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "codm-whatsapp-triage/1")
	req.Header.Set("X-Codm-Event", event)
	req.Header.Set("X-Codm-Event-Id", eventID)
	req.Header.Set("X-Codm-Timestamp", ts)
	if w.cfg.WebhookSecret != "" {
		req.Header.Set("X-Codm-Signature", "sha256="+Sign(w.cfg.WebhookSecret, ts, buf))
		// GitHub-style: HMAC over the raw body only (no timestamp prefix).
		req.Header.Set("X-Hub-Signature-256", "sha256="+SignBody(w.cfg.WebhookSecret, buf))
	}
	resp, err := w.client.Do(req)
	if err != nil {
		return fmt.Errorf("webhook POST failed: %w", err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64<<10))
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return fmt.Errorf("webhook returned HTTP %d", resp.StatusCode)
	}
	return nil
}

// chatName: the gateway's remote name, else the address-book/push name.
func (w *WebhookForwarder) chatName(ctx context.Context, channelID string, jids ...string) string {
	db := w.filter.db
	if db == nil {
		return ""
	}
	for _, j := range jids {
		var name string
		if db.QueryRowContext(ctx, `SELECT name FROM gateway_remotes WHERE channel_id = ? AND remote_id = ?`, channelID, j).Scan(&name) == nil && name != "" {
			return name
		}
	}
	return w.contactName(ctx, jids...)
}

func (w *WebhookForwarder) senderName(ctx context.Context, p wire.ChannelMessageReceivedPayload, senderPhone string) string {
	if n := w.contactName(ctx, p.SenderID, senderPhone); n != "" {
		return n
	}
	var pd struct {
		PushName string `json:"pushName"`
	}
	if json.Unmarshal(p.PlatformData, &pd) == nil {
		return pd.PushName
	}
	return ""
}

// contactName: address-book full name, else WhatsApp push name, across aliases.
func (w *WebhookForwarder) contactName(ctx context.Context, jids ...string) string {
	if w.filter.db == nil {
		return ""
	}
	for _, j := range w.filter.aliases(ctx, jids...) {
		var full, push, biz sql.NullString
		if w.filter.db.QueryRowContext(ctx,
			`SELECT full_name, push_name, business_name FROM whatsmeow_contacts WHERE their_jid = ? LIMIT 1`, j,
		).Scan(&full, &push, &biz) != nil {
			continue
		}
		for _, n := range []string{full.String, push.String, biz.String} {
			if n != "" {
				return n
			}
		}
	}
	return ""
}

// archiveRecheck re-evaluates an archived chat once, d after the first skipped
// message, and runs the queued deliveries only if the chat is archived no more.
type archiveRecheck struct {
	d      time.Duration
	filter *ChatFilter
	mu     sync.Mutex
	queue  map[string][]func()
}

const archiveRecheckMaxPerChat = 200

func newArchiveRecheck(d time.Duration, f *ChatFilter) *archiveRecheck {
	return &archiveRecheck{d: d, filter: f, queue: map[string][]func(){}}
}

func (r *archiveRecheck) schedule(chat string, deliver func()) {
	if r == nil || r.d <= 0 {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	q, running := r.queue[chat]
	if len(q) >= archiveRecheckMaxPerChat {
		return
	}
	r.queue[chat] = append(q, deliver)
	if running {
		return
	}
	time.AfterFunc(r.d, func() {
		r.mu.Lock()
		q := r.queue[chat]
		delete(r.queue, chat)
		r.mu.Unlock()
		if r.filter.Archived(context.Background(), true, chat) {
			return
		}
		for _, f := range q {
			f()
		}
	})
}

// Sign = hex(HMAC-SHA256(secret, timestamp + "." + body)).
func Sign(secret, ts string, body []byte) string {
	m := hmac.New(sha256.New, []byte(secret))
	m.Write([]byte(ts))
	m.Write([]byte("."))
	m.Write(body)
	return hex.EncodeToString(m.Sum(nil))
}

// extractText pulls a human-readable text/caption out of the content union.
func extractText(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var m map[string]any
	if json.Unmarshal(raw, &m) != nil {
		return ""
	}
	return findText(m, 0)
}

func findText(m map[string]any, depth int) string {
	for _, k := range []string{"text", "caption", "body", "conversation"} {
		if s, ok := m[k].(string); ok && s != "" {
			return s
		}
	}
	if depth > 3 {
		return ""
	}
	for _, v := range m {
		if sub, ok := v.(map[string]any); ok {
			if s := findText(sub, depth+1); s != "" {
				return s
			}
		}
	}
	return ""
}

// SignBody = hex(HMAC-SHA256(secret, body)) — GitHub X-Hub-Signature-256.
func SignBody(secret string, body []byte) string {
	m := hmac.New(sha256.New, []byte(secret))
	m.Write(body)
	return hex.EncodeToString(m.Sum(nil))
}
