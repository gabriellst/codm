package triage

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"
)

type posts struct {
	mu     sync.Mutex
	bodies []BatchBody
	ids    []string
	fail   int // fail this many calls first
	calls  int
}

func (p *posts) post(_ context.Context, eventID string, raw []byte) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.calls++
	if p.fail > 0 {
		p.fail--
		return errors.New("boom")
	}
	var b BatchBody
	if err := json.Unmarshal(raw, &b); err != nil {
		return err
	}
	p.bodies = append(p.bodies, b)
	p.ids = append(p.ids, eventID)
	return nil
}

func (p *posts) snapshot() []BatchBody {
	p.mu.Lock()
	defer p.mu.Unlock()
	return append([]BatchBody(nil), p.bodies...)
}

func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

func item(id string, ts int64) BatchItem {
	return BatchItem{SenderJID: "558399@s.whatsapp.net", SenderName: "Ana", MessageID: id, MessageType: "TEXT", Text: "oi " + id, Timestamp: ts}
}

var chatA = BatchChat{ChannelID: "ch1", ChatJID: "120363000000000001@g.us", ChatName: "Grupo A", IsGroup: true}
var chatB = BatchChat{ChannelID: "ch1", ChatJID: "558500000003@s.whatsapp.net", ChatName: "Bia", IsGroup: false}

func TestBatchQuietFlushOnePostPerChatInOrder(t *testing.T) {
	db := openTestDB(t)
	p := &posts{}
	b, err := newTestBatcher(t, db, 120*time.Millisecond, 5*time.Second, p.post)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	for i, id := range []string{"m1", "m2", "m3"} {
		if err := b.Add(ctx, chatA, item(id, int64(100+i))); err != nil {
			t.Fatal(err)
		}
		time.Sleep(30 * time.Millisecond) // each message resets the quiet timer
	}
	if err := b.Add(ctx, chatB, item("b1", 200)); err != nil {
		t.Fatal(err)
	}
	if len(p.snapshot()) != 0 {
		t.Fatal("nothing may be sent before the quiet period")
	}
	waitFor(t, "two batches", func() bool { return len(p.snapshot()) == 2 })
	got := map[string]BatchBody{}
	for _, bd := range p.snapshot() {
		got[bd.ChatJID] = bd
	}
	a := got[chatA.ChatJID]
	if !a.Batch || a.Event != BatchEventName || a.Count != 3 || a.ChatName != "Grupo A" || !a.IsGroup || a.ChannelID != "ch1" {
		t.Fatalf("bad batch A: %+v", a)
	}
	if a.Messages[0].MessageID != "m1" || a.Messages[2].MessageID != "m3" || a.Messages[1].SenderName != "Ana" || a.Messages[0].Timestamp != 100 {
		t.Fatalf("bad messages: %+v", a.Messages)
	}
	if bb := got[chatB.ChatJID]; bb.Count != 1 || bb.IsGroup || bb.ChatName != "Bia" {
		t.Fatalf("bad batch B: %+v", bb)
	}
	waitFor(t, "buffer drained", func() bool { return b.Pending() == 0 })
}

func TestBatchMaxWaitCapUnderContinuousTraffic(t *testing.T) {
	db := openTestDB(t)
	p := &posts{}
	b, err := newTestBatcher(t, db, 200*time.Millisecond, 350*time.Millisecond, p.post)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	start := time.Now()
	stop := make(chan struct{})
	done := make(chan struct{})
	go func() {
		defer close(done)
		for i := 0; ; i++ {
			select {
			case <-stop:
				return
			default:
			}
			_ = b.Add(ctx, chatA, item("c"+string(rune('a'+i%26))+time.Now().Format("150405.000000"), int64(i)))
			time.Sleep(50 * time.Millisecond) // never quiet for 200ms
		}
	}()
	waitFor(t, "cap flush", func() bool { return len(p.snapshot()) >= 1 })
	close(stop)
	<-done
	if el := time.Since(start); el > 1500*time.Millisecond {
		t.Fatalf("cap flush took %v, quiet timer alone would never fire", el)
	}
}

func TestBatchDuplicateMessageIDIsBufferedOnce(t *testing.T) {
	db := openTestDB(t)
	p := &posts{}
	b, _ := newTestBatcher(t, db, 80*time.Millisecond, time.Second, p.post)
	ctx := context.Background()
	_ = b.Add(ctx, chatA, item("dup", 1))
	_ = b.Add(ctx, chatA, item("dup", 1)) // outbox redelivery
	waitFor(t, "flush", func() bool { return len(p.snapshot()) == 1 })
	if c := p.snapshot()[0].Count; c != 1 {
		t.Fatalf("count=%d, want 1", c)
	}
}

func TestBatchFailureKeepsRowsThenRetries(t *testing.T) {
	db := openTestDB(t)
	p := &posts{fail: 1}
	b, _ := newTestBatcher(t, db, 50*time.Millisecond, time.Second, p.post)
	ctx := context.Background()
	_ = b.Add(ctx, chatA, item("m1", 1))
	waitFor(t, "first failed attempt", func() bool { p.mu.Lock(); defer p.mu.Unlock(); return p.calls >= 1 })
	time.Sleep(50 * time.Millisecond)
	if b.Pending() != 1 {
		t.Fatalf("rows must survive a failed POST, pending=%d", b.Pending())
	}
	// Backoff is 30s in production; drive the retry directly.
	b.flushChat(ctx, chatA.ChatJID)
	if len(p.snapshot()) != 1 || b.Pending() != 0 {
		t.Fatalf("retry must deliver and clear: posts=%d pending=%d", len(p.snapshot()), b.Pending())
	}
}

func TestBatchSurvivesRestart(t *testing.T) {
	db := openTestDB(t)
	dead := &posts{fail: 1000}
	b1, _ := newTestBatcher(t, db, time.Hour, time.Hour, dead.post) // never fires on its own
	ctx := context.Background()
	_ = b1.Add(ctx, chatA, item("m1", 1))
	_ = b1.Add(ctx, chatA, item("m2", 2))
	_ = b1.Add(ctx, chatB, item("b1", 3))
	b1.mu.Lock()
	b1.closed = true
	for _, buf := range b1.chats {
		buf.timer.Stop()
	}
	b1.mu.Unlock() // simulate a hard kill: no Stop(), rows only in SQLite

	p := &posts{}
	b2, err := newTestBatcher(t, db, 60*time.Millisecond, time.Second, p.post)
	if err != nil {
		t.Fatal(err)
	}
	if err := b2.Start(); err != nil {
		t.Fatal(err)
	}
	waitFor(t, "recovered batches", func() bool { return len(p.snapshot()) == 2 })
	total := 0
	for _, bd := range p.snapshot() {
		total += bd.Count
	}
	if total != 3 || b2.Pending() != 0 {
		t.Fatalf("recovered %d messages, pending=%d", total, b2.Pending())
	}
}

func TestBatchStopFlushesBufferedChats(t *testing.T) {
	db := openTestDB(t)
	p := &posts{}
	b, _ := newTestBatcher(t, db, time.Hour, time.Hour, p.post)
	ctx := context.Background()
	_ = b.Add(ctx, chatA, item("m1", 1))
	_ = b.Add(ctx, chatB, item("b1", 2))
	b.Stop(ctx)
	if len(p.snapshot()) != 2 || b.Pending() != 0 {
		t.Fatalf("Stop must flush: posts=%d pending=%d", len(p.snapshot()), b.Pending())
	}
	// Adds after Stop stay durable but do not fire.
	_ = b.Add(ctx, chatA, item("late", 3))
	if b.Pending() != 1 {
		t.Fatal("late message must stay buffered for the next start")
	}
}

func TestBatchStopWithFailingWebhookKeepsRows(t *testing.T) {
	db := openTestDB(t)
	p := &posts{fail: 1000}
	b, _ := newTestBatcher(t, db, time.Hour, time.Hour, p.post)
	_ = b.Add(context.Background(), chatA, item("m1", 1))
	b.Stop(context.Background())
	if b.Pending() != 1 {
		t.Fatal("undeliverable rows must stay durable")
	}
}

func TestBatchMessagesArrivingDuringFlushAreNotLost(t *testing.T) {
	db := openTestDB(t)
	gate := make(chan struct{})
	var mu sync.Mutex
	var got []BatchBody
	post := func(_ context.Context, _ string, raw []byte) error {
		var bd BatchBody
		_ = json.Unmarshal(raw, &bd)
		mu.Lock()
		first := len(got) == 0
		got = append(got, bd)
		mu.Unlock()
		if first {
			<-gate // hold the first POST open
		}
		return nil
	}
	b, _ := newTestBatcher(t, db, 40*time.Millisecond, time.Second, post)
	ctx := context.Background()
	_ = b.Add(ctx, chatA, item("m1", 1))
	waitFor(t, "first post in flight", func() bool { mu.Lock(); defer mu.Unlock(); return len(got) == 1 })
	_ = b.Add(ctx, chatA, item("m2", 2)) // arrives mid-flush
	close(gate)
	waitFor(t, "second batch", func() bool { mu.Lock(); defer mu.Unlock(); return len(got) == 2 })
	mu.Lock()
	defer mu.Unlock()
	if got[0].Count != 1 || got[1].Count != 1 || got[1].Messages[0].MessageID != "m2" {
		t.Fatalf("m2 must go out in its own batch: %+v", got)
	}
	waitFor(t, "drained", func() bool { return b.Pending() == 0 })
}

func TestBatchIDStableAcrossRetries(t *testing.T) {
	db := openTestDB(t)
	p := &posts{fail: 1}
	b, _ := newTestBatcher(t, db, time.Hour, time.Hour, p.post)
	ctx := context.Background()
	_ = b.Add(ctx, chatA, item("m1", 1))
	_ = b.Add(ctx, chatA, item("m2", 2))
	_, _ = b.flushRows(ctx, chatA.ChatJID) // fails
	_, _ = b.flushRows(ctx, chatA.ChatJID) // succeeds
	if len(p.ids) != 1 || p.ids[0] != "batch-"+chatA.ChatJID+"-m1-2" {
		t.Fatalf("batch id = %v", p.ids)
	}
}

// newTestBatcher quiesces the batcher before the temp DB is removed, so late
// timers never write to a deleted file.
func newTestBatcher(t *testing.T, db *sql.DB, quiet, maxWait time.Duration, post func(context.Context, string, []byte) error) (*Batcher, error) {
	t.Helper()
	b, err := NewBatcher(db, quiet, maxWait, post)
	if err == nil {
		t.Cleanup(func() { quiesce(b) })
	}
	return b, err
}

func quiesce(b *Batcher) {
	b.mu.Lock()
	b.closed = true
	for _, buf := range b.chats {
		if buf.timer != nil {
			buf.timer.Stop()
		}
	}
	b.mu.Unlock()
	b.wg.Wait()
}
