package triage

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"
)

// BatchEventName is the X-Codm-Event of a debounced webhook.
const BatchEventName = "channel.message_batch"

// BatchItem is one message inside a batch webhook.
type BatchItem struct {
	SenderJID   string `json:"senderJid"`
	SenderName  string `json:"senderName"`
	MessageID   string `json:"messageId"`
	MessageType string `json:"messageType"`
	Text        string `json:"text"`
	Timestamp   int64  `json:"timestamp"`
}

// BatchBody is the JSON POSTed for a debounced chat.
type BatchBody struct {
	Batch     bool        `json:"batch"`
	Event     string      `json:"event"`
	BatchID   string      `json:"batchId"`
	ChannelID string      `json:"channelId"`
	ChatJID   string      `json:"chatJid"`
	ChatName  string      `json:"chatName"`
	IsGroup   bool        `json:"isGroup"`
	Count     int         `json:"count"`
	Messages  []BatchItem `json:"messages"`
}

// BatchChat is the per-message chat context stored beside each buffered item.
type BatchChat struct {
	ChannelID string
	ChatJID   string
	ChatName  string
	IsGroup   bool
}

// Batcher is the OPTIONAL per-chat debounce in front of the triage webhook.
// It only exists when WEBHOOK_DEBOUNCE_SECONDS > 0. Every buffered message is
// written to triage_batch_pending (same SQLite file) BEFORE the outbox event is
// acknowledged, so a crash or restart loses nothing: Start() re-arms whatever
// is still pending. A chat flushes after `quiet` seconds without a new message,
// or `maxWait` after its first buffered message, whichever comes first. A failed
// POST keeps the rows and retries with backoff; rows are deleted only after a
// 2xx. It never touches /send, the gateway tables, or the Supervisor's path.
type Batcher struct {
	db      *sql.DB
	quiet   time.Duration
	maxWait time.Duration
	post    func(ctx context.Context, eventID string, body []byte) error
	now     func() time.Time

	mu     sync.Mutex
	chats  map[string]*chatBuf
	closed bool
	wg     sync.WaitGroup
}

type chatBuf struct {
	first, last time.Time
	timer       *time.Timer
	flushing    bool
	rearm       bool // messages arrived while a flush was in flight
	failures    int
}

const batcherBackoffMax = 5 * time.Minute

func NewBatcher(db *sql.DB, quiet, maxWait time.Duration, post func(ctx context.Context, eventID string, body []byte) error) (*Batcher, error) {
	if maxWait < quiet {
		maxWait = quiet
	}
	b := &Batcher{db: db, quiet: quiet, maxWait: maxWait, post: post, now: time.Now, chats: map[string]*chatBuf{}}
	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS triage_batch_pending (
			seq INTEGER PRIMARY KEY AUTOINCREMENT,
			message_id TEXT NOT NULL UNIQUE,
			chat_jid TEXT NOT NULL,
			channel_id TEXT NOT NULL,
			chat_name TEXT NOT NULL DEFAULT '',
			is_group INTEGER NOT NULL DEFAULT 0,
			item TEXT NOT NULL,
			enqueued_at INTEGER NOT NULL
		)`); err != nil {
		return nil, err
	}
	if _, err := db.Exec(`CREATE INDEX IF NOT EXISTS triage_batch_pending_chat ON triage_batch_pending (chat_jid, seq)`); err != nil {
		return nil, err
	}
	return b, nil
}

// Start re-arms chats that still have buffered rows from a previous run.
func (b *Batcher) Start() error {
	rows, err := b.db.Query(`SELECT chat_jid, MIN(enqueued_at), MAX(enqueued_at) FROM triage_batch_pending GROUP BY chat_jid`)
	if err != nil {
		return err
	}
	defer rows.Close()
	b.mu.Lock()
	defer b.mu.Unlock()
	n := 0
	for rows.Next() {
		var chat string
		var first, last int64
		if err := rows.Scan(&chat, &first, &last); err != nil {
			return err
		}
		buf := &chatBuf{first: time.UnixMilli(first), last: time.UnixMilli(last)}
		b.chats[chat] = buf
		b.armLocked(chat, buf)
		n++
	}
	if n > 0 {
		slog.Info("triage: debounce recovered buffered chats from a previous run", "chats", n)
	}
	return rows.Err()
}

// Add buffers one message durably and (re)arms the chat's quiet timer.
func (b *Batcher) Add(ctx context.Context, c BatchChat, it BatchItem) error {
	raw, err := json.Marshal(it)
	if err != nil {
		return err
	}
	at := b.now()
	if _, err := b.db.ExecContext(ctx,
		`INSERT OR IGNORE INTO triage_batch_pending (message_id, chat_jid, channel_id, chat_name, is_group, item, enqueued_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		it.MessageID, c.ChatJID, c.ChannelID, c.ChatName, boolInt(c.IsGroup), string(raw), at.UnixMilli()); err != nil {
		return fmt.Errorf("buffer message: %w", err)
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closed {
		return nil // row is durable; the next start flushes it
	}
	buf := b.chats[c.ChatJID]
	if buf == nil {
		buf = &chatBuf{first: at}
		b.chats[c.ChatJID] = buf
	}
	buf.last = at
	if buf.flushing {
		buf.rearm = true
		return nil
	}
	b.armLocked(c.ChatJID, buf)
	return nil
}

// armLocked schedules the flush: quiet after the last message, but never later
// than maxWait after the first. After failures it backs off instead.
func (b *Batcher) armLocked(chat string, buf *chatBuf) {
	now := b.now()
	d := buf.last.Add(b.quiet).Sub(now)
	if cap := buf.first.Add(b.maxWait).Sub(now); cap < d {
		d = cap
	}
	if d < 0 {
		d = 0
	}
	if buf.failures > 0 {
		backoff := 30 * time.Second << min(buf.failures-1, 4)
		if backoff > batcherBackoffMax {
			backoff = batcherBackoffMax
		}
		if d < backoff {
			d = backoff
		}
	}
	if buf.timer != nil {
		buf.timer.Stop()
	}
	buf.timer = time.AfterFunc(d, func() { b.timerFlush(chat) })
}

// timerFlush is the timer entry point: it refuses to start once Stop began and
// is tracked by wg so Stop can wait for it.
func (b *Batcher) timerFlush(chat string) {
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		return
	}
	b.wg.Add(1)
	b.mu.Unlock()
	defer b.wg.Done()
	b.flushChat(context.Background(), chat)
}

func (b *Batcher) flushChat(ctx context.Context, chat string) {
	b.mu.Lock()
	buf := b.chats[chat]
	if buf == nil || buf.flushing {
		b.mu.Unlock()
		return
	}
	buf.flushing = true
	buf.rearm = false
	b.mu.Unlock()

	_, err := b.flushRows(ctx, chat)

	b.mu.Lock()
	defer b.mu.Unlock()
	buf.flushing = false
	switch {
	case err != nil:
		buf.failures++
		slog.Warn("triage: batch webhook failed — will retry", "chat", chat, "attempt", buf.failures, "error", err)
		if !b.closed {
			b.armLocked(chat, buf)
		}
	case buf.rearm:
		buf.failures = 0
		buf.first = buf.last // new window for what arrived mid-flush
		if !b.closed {
			b.armLocked(chat, buf)
		}
	default:
		delete(b.chats, chat)
	}
}

// flushRows sends everything currently buffered for the chat as ONE webhook and
// deletes exactly those rows after a 2xx.
func (b *Batcher) flushRows(ctx context.Context, chat string) (int, error) {
	rows, err := b.db.QueryContext(ctx,
		`SELECT seq, channel_id, chat_name, is_group, item FROM triage_batch_pending WHERE chat_jid = ? ORDER BY seq`, chat)
	if err != nil {
		return 0, err
	}
	body := BatchBody{Batch: true, Event: BatchEventName, ChatJID: chat}
	var maxSeq int64
	for rows.Next() {
		var seq int64
		var ch, name, raw string
		var grp int
		if err := rows.Scan(&seq, &ch, &name, &grp, &raw); err != nil {
			_ = rows.Close()
			return 0, err
		}
		var it BatchItem
		if json.Unmarshal([]byte(raw), &it) != nil {
			maxSeq = seq // poison row: drop it with the batch
			continue
		}
		body.ChannelID, body.IsGroup = ch, grp != 0
		if name != "" {
			body.ChatName = name
		}
		body.Messages = append(body.Messages, it)
		maxSeq = seq
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return 0, err
	}
	_ = rows.Close()
	if len(body.Messages) == 0 {
		if maxSeq > 0 {
			_, err = b.db.ExecContext(ctx, `DELETE FROM triage_batch_pending WHERE chat_jid = ? AND seq <= ?`, chat, maxSeq)
		}
		return 0, err
	}
	body.Count = len(body.Messages)
	// Stable across retries of the same rows, so the receiver can de-duplicate.
	body.BatchID = fmt.Sprintf("batch-%s-%s-%d", chat, body.Messages[0].MessageID, body.Count)
	buf, err := json.Marshal(body)
	if err != nil {
		return 0, err
	}
	if err := b.post(ctx, body.BatchID, buf); err != nil {
		return 0, err
	}
	if _, err := b.db.ExecContext(ctx, `DELETE FROM triage_batch_pending WHERE chat_jid = ? AND seq <= ?`, chat, maxSeq); err != nil {
		slog.Error("triage: batch delivered but buffered rows could not be deleted — a duplicate batch may follow", "chat", chat, "error", err)
	}
	slog.Info("triage: forwarded batch", "chat", chat, "messages", body.Count)
	return body.Count, nil
}

// Stop flushes every buffered chat once (best effort, bounded by ctx). Rows
// that cannot be delivered stay in the table and are re-armed by the next Start.
func (b *Batcher) Stop(ctx context.Context) {
	b.mu.Lock()
	b.closed = true
	chats := make([]string, 0, len(b.chats))
	for c, buf := range b.chats {
		if buf.timer != nil {
			buf.timer.Stop()
		}
		chats = append(chats, c)
	}
	b.mu.Unlock()
	b.wg.Wait() // let in-flight timer flushes finish
	for _, c := range chats {
		if ctx.Err() != nil {
			break
		}
		b.flushChat(ctx, c)
	}
}

// Pending is the number of buffered messages (status/debug).
func (b *Batcher) Pending() int {
	var n int
	_ = b.db.QueryRow(`SELECT COUNT(*) FROM triage_batch_pending`).Scan(&n)
	return n
}

func boolInt(v bool) int {
	if v {
		return 1
	}
	return 0
}
