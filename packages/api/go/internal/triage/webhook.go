package triage

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"template/api-go/internal/channel/services/pool"
	"template/contracts-go/wire"
	"template/core-go/services/mediator"
	"template/core-go/types"
)

// WebhookForwarder is an IntegrationEventHandler on the integration outbox lane:
// it runs asynchronously from the receive path, and returning an error on a
// non-2xx / transport failure reuses the outbox retry (30s lease, 5 attempts,
// then dead-letter).
type WebhookForwarder struct {
	cfg    *Config
	pool   pool.ChannelPool
	client *http.Client
}

func NewWebhookForwarder(cfg *Config, p pool.ChannelPool) *WebhookForwarder {
	return &WebhookForwarder{cfg: cfg, pool: p, client: &http.Client{Timeout: 15 * time.Second}}
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

	chatPhone, senderPhone := p.RemoteID, p.SenderID
	if ch, ok := w.pool.Get(p.ChannelID); ok {
		chatPhone = ch.ResolvePhoneJID(ctx, p.RemoteID)
		senderPhone = ch.ResolvePhoneJID(ctx, p.SenderID)
	}
	if !w.cfg.Allowed(p.RemoteID, chatPhone, p.SenderID, senderPhone) {
		slog.Debug("triage: message from non-allowlisted chat ignored", "chat", p.RemoteID)
		return nil
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

	ts := strconv.FormatInt(time.Now().Unix(), 10)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, w.cfg.WebhookURL, bytes.NewReader(buf))
	if err != nil {
		slog.Error("triage: bad WEBHOOK_URL", "error", err)
		return nil
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "codm-whatsapp-triage/1")
	req.Header.Set("X-Codm-Event", body.Event)
	req.Header.Set("X-Codm-Event-Id", eventID)
	req.Header.Set("X-Codm-Timestamp", ts)
	if w.cfg.WebhookSecret != "" {
		req.Header.Set("X-Codm-Signature", "sha256="+Sign(w.cfg.WebhookSecret, ts, buf))
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
	slog.Info("triage: forwarded message", "chat", p.RemoteID, "messageId", p.MessageID, "status", resp.StatusCode)
	return nil
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
