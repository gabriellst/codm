package triage

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

func openSent(t *testing.T) (*SentLog, *sql.DB, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "sent.db")
	db, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	s, err := newSentLogDB(db)
	if err != nil {
		t.Fatal(err)
	}
	return s, db, path
}

func TestSentLogRememberAndHas(t *testing.T) {
	s, _, _ := openSent(t)
	ctx := context.Background()
	if s.Has(ctx, "abc") {
		t.Fatal("empty log should not have id")
	}
	s.Remember(ctx, "abc")
	if !s.Has(ctx, "abc") {
		t.Fatal("expected remembered id")
	}
	if s.Has(ctx, "xyz") {
		t.Fatal("other id must not match")
	}
}

func TestSentLogSurvivesReopen(t *testing.T) {
	s, db, path := openSent(t)
	ctx := context.Background()
	s.Remember(ctx, "persisted-id")
	_ = db.Close()

	db2, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db2.Close() })
	s2, err := newSentLogDB(db2)
	if err != nil {
		t.Fatal(err)
	}
	if !s2.Has(ctx, "persisted-id") {
		t.Fatal("remembered id must survive reopen (restart)")
	}
}

func TestOwnSendWaitsForInFlight(t *testing.T) {
	s, _, _ := openSent(t)
	ctx := context.Background()
	s.BeginSend()
	defer s.EndSend()

	done := make(chan struct{})
	go func() {
		time.Sleep(120 * time.Millisecond)
		s.Remember(ctx, "late-id")
		close(done)
	}()
	if !s.OwnSend(ctx, "late-id", 500*time.Millisecond) {
		t.Fatal("OwnSend should have waited for the in-flight Remember")
	}
	<-done
}

func TestOwnSendDoesNotWaitWhenIdle(t *testing.T) {
	s, _, _ := openSent(t)
	start := time.Now()
	if s.OwnSend(context.Background(), "nope", 500*time.Millisecond) {
		t.Fatal("unknown id")
	}
	if time.Since(start) > 80*time.Millisecond {
		t.Fatal("must not wait when no send is in flight")
	}
}
