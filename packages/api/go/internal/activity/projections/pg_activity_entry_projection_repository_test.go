package projections

import (
	"context"
	"database/sql"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// openMigratedDB returns a live connection when DATABASE_URL is set AND the
// activity.activity_entries table has been migrated (bun migrate:dev).
// There is no pg-less Go harness in this repo (the embedded migrations dir is
// fixtures-only), so this test self-skips everywhere else and go test ./...
// stays green without Docker.
func openMigratedDB(t *testing.T) *sql.DB {
	t.Helper()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set, skipping pg integration test")
	}

	db, err := sql.Open("pgx", dbURL)
	if err != nil {
		t.Skipf("open postgres: %v", err)
	}
	if err := db.Ping(); err != nil {
		db.Close()
		t.Skipf("postgres unreachable: %v", err)
	}

	var exists bool
	err = db.QueryRow(
		`SELECT EXISTS (
		   SELECT 1 FROM information_schema.tables
		   WHERE table_schema = 'activity' AND table_name = 'activity_entries'
		 )`,
	).Scan(&exists)
	if err != nil || !exists {
		db.Close()
		t.Skip("activity.activity_entries not migrated (run bun migrate:dev), skipping")
	}

	t.Cleanup(func() { db.Close() })
	return db
}

func newTestEntry(ownerID string, at time.Time) *ActivityEntry {
	return &ActivityEntry{
		ID:              uuid.NewString(),
		OwnerID:         ownerID,
		EventName:       "integration.example.fact_recorded",
		EntityID:        uuid.NewString(),
		FirstOccurredAt: at,
		LastOccurredAt:  at,
		OccurrenceCount: 1,
		RecordedAt:      time.Now().UTC(),
		Version:         1,
	}
}

func TestPgActivityEntryProjectionRepository(t *testing.T) {
	db := openMigratedDB(t)
	repo := NewPgActivityEntryProjectionRepository(db)
	ctx := context.Background()

	// Random owner isolates this run from real data; rows are removed on cleanup.
	ownerID := uuid.NewString()
	t.Cleanup(func() {
		_, _ = db.Exec(`DELETE FROM activity.activity_entries WHERE owner_id = $1`, ownerID)
	})

	base := time.Date(2026, 7, 1, 12, 0, 0, 0, time.UTC)

	t.Run("FindByKey returns (nil, nil) when absent", func(t *testing.T) {
		row, err := repo.FindByKey(ctx, ownerID, "integration.example.fact_recorded", uuid.NewString())
		if err != nil {
			t.Fatalf("FindByKey() error = %v", err)
		}
		if row != nil {
			t.Fatalf("FindByKey() = %+v, want nil", row)
		}
	})

	t.Run("InsertIfNew inserts then dedupes", func(t *testing.T) {
		entry := newTestEntry(ownerID, base)

		inserted, err := repo.InsertIfNew(ctx, entry)
		if err != nil || !inserted {
			t.Fatalf("InsertIfNew() = (%v, %v), want (true, nil)", inserted, err)
		}

		duplicate := *entry
		duplicate.ID = uuid.NewString()
		inserted, err = repo.InsertIfNew(ctx, &duplicate)
		if err != nil || inserted {
			t.Fatalf("InsertIfNew(duplicate) = (%v, %v), want (false, nil)", inserted, err)
		}

		row, err := repo.FindByKey(ctx, entry.OwnerID, entry.EventName, entry.EntityID)
		if err != nil || row == nil {
			t.Fatalf("FindByKey() = (%v, %v), want row", row, err)
		}
		if row.ID != entry.ID {
			t.Errorf("ID = %q, want the first insert %q", row.ID, entry.ID)
		}
	})

	t.Run("Save persists ApplyOccurrence and bumps version", func(t *testing.T) {
		entry := newTestEntry(ownerID, base)
		if _, err := repo.InsertIfNew(ctx, entry); err != nil {
			t.Fatalf("InsertIfNew() error = %v", err)
		}

		row, err := repo.FindByKey(ctx, entry.OwnerID, entry.EventName, entry.EntityID)
		if err != nil || row == nil {
			t.Fatalf("FindByKey() = (%v, %v), want row", row, err)
		}
		row.ApplyOccurrence(base.Add(time.Hour))
		if err := repo.Save(ctx, row); err != nil {
			t.Fatalf("Save() error = %v", err)
		}

		updated, err := repo.FindByKey(ctx, entry.OwnerID, entry.EventName, entry.EntityID)
		if err != nil || updated == nil {
			t.Fatalf("FindByKey() = (%v, %v), want row", updated, err)
		}
		if updated.OccurrenceCount != 2 {
			t.Errorf("OccurrenceCount = %d, want 2", updated.OccurrenceCount)
		}
		if !updated.LastOccurredAt.Equal(base.Add(time.Hour)) {
			t.Errorf("LastOccurredAt = %v, want %v", updated.LastOccurredAt, base.Add(time.Hour))
		}
		if updated.Version != row.Version+1 {
			t.Errorf("Version = %d, want %d", updated.Version, row.Version+1)
		}
	})

	t.Run("ListByOwner orders newest first and honors the cursor", func(t *testing.T) {
		listOwner := uuid.NewString()
		t.Cleanup(func() {
			_, _ = db.Exec(`DELETE FROM activity.activity_entries WHERE owner_id = $1`, listOwner)
		})

		for i := 0; i < 3; i++ {
			entry := newTestEntry(listOwner, base.Add(time.Duration(i)*time.Hour))
			if _, err := repo.InsertIfNew(ctx, entry); err != nil {
				t.Fatalf("InsertIfNew() error = %v", err)
			}
		}

		rows, err := repo.ListByOwner(ctx, listOwner, CursorOptions{Limit: 10})
		if err != nil {
			t.Fatalf("ListByOwner() error = %v", err)
		}
		if len(rows) != 3 {
			t.Fatalf("len(rows) = %d, want 3", len(rows))
		}
		if !rows[0].LastOccurredAt.Equal(base.Add(2 * time.Hour)) {
			t.Errorf("rows[0].LastOccurredAt = %v, want newest %v", rows[0].LastOccurredAt, base.Add(2*time.Hour))
		}

		cursor := base.Add(2 * time.Hour)
		paged, err := repo.ListByOwner(ctx, listOwner, CursorOptions{Limit: 10, Before: &cursor})
		if err != nil {
			t.Fatalf("ListByOwner(cursor) error = %v", err)
		}
		if len(paged) != 2 {
			t.Fatalf("len(paged) = %d, want 2", len(paged))
		}
	})
}
