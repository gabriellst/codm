package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

// IsBusy against a REAL lock, not a hand-built error: one connection holds BEGIN IMMEDIATE and a
// second one, with no busy_timeout, is refused. The wrapped form is what callers actually see
// (`fmt.Errorf("…: %w", err)`), so it is the one asserted.
func TestIsBusyRecognisesARealLockRefusal(t *testing.T) {
	dir := t.TempDir()
	dsn := "file:" + filepath.Join(dir, "busy.db") + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(0)"
	holder, err := sql.Open("sqlite", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer holder.Close()
	if _, err := holder.Exec(`CREATE TABLE t (id INTEGER)`); err != nil {
		t.Fatal(err)
	}

	ctx := context.Background()
	conn, err := holder.Conn(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if _, err := conn.ExecContext(ctx, `BEGIN IMMEDIATE`); err != nil {
		t.Fatal(err)
	}
	defer conn.ExecContext(ctx, `ROLLBACK`) //nolint:errcheck

	other, err := sql.Open("sqlite", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer other.Close()
	_, writeErr := other.Exec(`INSERT INTO t (id) VALUES (1)`)
	if writeErr == nil {
		t.Fatal("expected the second writer to be refused while the first holds the lock")
	}

	if !IsBusy(fmt.Errorf("wrapped: %w", writeErr)) {
		t.Fatalf("IsBusy must recognise a lock refusal, got %v", writeErr)
	}
}

func TestIsBusyRejectsOtherFailures(t *testing.T) {
	db, err := sql.Open("sqlite", "file:"+filepath.Join(t.TempDir(), "other.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, syntaxErr := db.Exec(`NOT SQL`)
	if syntaxErr == nil {
		t.Fatal("expected a syntax error")
	}
	if IsBusy(syntaxErr) || IsBusy(nil) || IsBusy(fmt.Errorf("plain")) {
		t.Fatal("IsBusy must only answer true for a lock refusal")
	}
}
