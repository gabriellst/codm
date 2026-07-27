package message

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"template/api-go/internal/channel/projections"
)

// ---------------------------------------------------------------------------
// Tests — SqliteMessageProjectionRepository
// ---------------------------------------------------------------------------

func TestSqliteMessageProjectionRepository_Find_Miss(t *testing.T) {
	repo := NewSqliteMessageProjectionRepository(newMessageSqliteStore(t))

	msg, err := repo.Find(context.Background(), uuid.New().String())
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if msg != nil {
		t.Fatalf("expected nil for missing message, got %+v", msg)
	}
}

func TestSqliteMessageProjectionRepository_SaveAndFind(t *testing.T) {
	repo := NewSqliteMessageProjectionRepository(newMessageSqliteStore(t))
	ctx := context.Background()

	proj := makeSqliteMessageProjection(uuid.New().String(), uuid.New().String(), "6281234@s.whatsapp.net", "wamid.001")
	if err := repo.Save(ctx, proj); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got, err := repo.Find(ctx, proj.ID)
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if got == nil {
		t.Fatal("expected message projection, got nil")
	}
	if got.ID != proj.ID {
		t.Errorf("ID: want %q, got %q", proj.ID, got.ID)
	}
	if got.PlatformMessageID != proj.PlatformMessageID {
		t.Errorf("PlatformMessageID: want %q, got %q", proj.PlatformMessageID, got.PlatformMessageID)
	}
	if got.SenderRemoteID != proj.SenderRemoteID {
		t.Errorf("SenderRemoteID: want %q, got %q", proj.SenderRemoteID, got.SenderRemoteID)
	}
	// Every non-identity column must survive the pg -> SQLite type mapping
	// (jsonb -> TEXT, timestamptz -> INTEGER ms, text enum -> CHECKed TEXT).
	if string(got.Content) != string(proj.Content) {
		t.Errorf("Content: want %q, got %q", string(proj.Content), string(got.Content))
	}
	if got.Platform != proj.Platform {
		t.Errorf("Platform: want %q, got %q", proj.Platform, got.Platform)
	}
	if got.Direction != proj.Direction {
		t.Errorf("Direction: want %q, got %q", proj.Direction, got.Direction)
	}
	if !got.OccurredAt.Equal(proj.OccurredAt) {
		t.Errorf("OccurredAt: want %v, got %v", proj.OccurredAt, got.OccurredAt)
	}
	if got.DeliveredAt != nil || got.SeenAt != nil || got.EditedAt != nil || got.DeletedAt != nil {
		t.Errorf("expected all nullable timestamps NULL, got %+v", got)
	}
}

func TestSqliteMessageProjectionRepository_FindByPlatformID(t *testing.T) {
	repo := NewSqliteMessageProjectionRepository(newMessageSqliteStore(t))
	ctx := context.Background()

	channelID := uuid.New().String()
	platformID := "wamid.plat001"
	proj := makeSqliteMessageProjection(uuid.New().String(), channelID, "6281234@s.whatsapp.net", platformID)
	if err := repo.Save(ctx, proj); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got, err := repo.FindByPlatformID(ctx, channelID, platformID)
	if err != nil {
		t.Fatalf("FindByPlatformID: %v", err)
	}
	if got == nil {
		t.Fatal("expected message projection, got nil")
	}
	if got.PlatformMessageID != platformID {
		t.Errorf("PlatformMessageID: want %q, got %q", platformID, got.PlatformMessageID)
	}
}

func TestSqliteMessageProjectionRepository_FindByPlatformID_Miss(t *testing.T) {
	repo := NewSqliteMessageProjectionRepository(newMessageSqliteStore(t))

	got, err := repo.FindByPlatformID(context.Background(), uuid.New().String(), "wamid.nonexistent")
	if err != nil {
		t.Fatalf("FindByPlatformID: %v", err)
	}
	if got != nil {
		t.Fatalf("expected nil for missing platform ID, got %+v", got)
	}
}

func TestSqliteMessageProjectionRepository_InsertIfNew_Insert(t *testing.T) {
	repo := NewSqliteMessageProjectionRepository(newMessageSqliteStore(t))

	proj := makeSqliteMessageProjection(uuid.New().String(), uuid.New().String(), "6282222@s.whatsapp.net", "wamid.new001")
	inserted, err := repo.InsertIfNew(context.Background(), proj)
	if err != nil {
		t.Fatalf("InsertIfNew: %v", err)
	}
	if !inserted {
		t.Error("expected inserted=true for new message")
	}
}

func TestSqliteMessageProjectionRepository_InsertIfNew_Conflict(t *testing.T) {
	repo := NewSqliteMessageProjectionRepository(newMessageSqliteStore(t))
	ctx := context.Background()

	channelID := uuid.New().String()
	platformID := "wamid.dup001"
	proj := makeSqliteMessageProjection(uuid.New().String(), channelID, "6283333@s.whatsapp.net", platformID)
	if _, err := repo.InsertIfNew(ctx, proj); err != nil {
		t.Fatalf("first InsertIfNew: %v", err)
	}

	// Same (channelID, platformID), different message UUID — the unique index on
	// (channel_id, platform_message_id) is what must reject this, not the PK.
	proj2 := makeSqliteMessageProjection(uuid.New().String(), channelID, "6283333@s.whatsapp.net", platformID)
	inserted, err := repo.InsertIfNew(ctx, proj2)
	if err != nil {
		t.Fatalf("second InsertIfNew: %v", err)
	}
	if inserted {
		t.Error("expected inserted=false on conflict (duplicate platform message ID)")
	}

	// The original row must survive untouched — DO NOTHING, not DO UPDATE.
	got, err := repo.FindByPlatformID(ctx, channelID, platformID)
	if err != nil || got == nil {
		t.Fatalf("FindByPlatformID: err=%v got=%v", err, got)
	}
	if got.ID != proj.ID {
		t.Errorf("conflicting insert overwrote the original row: want id %q, got %q", proj.ID, got.ID)
	}
}

func TestSqliteMessageProjectionRepository_UpsertAllIfNew_Count(t *testing.T) {
	repo := NewSqliteMessageProjectionRepository(newMessageSqliteStore(t))
	ctx := context.Background()

	channelID := uuid.New().String()
	remoteID := "6284444@s.whatsapp.net"

	msgs := make([]*projections.Message, 5)
	for i := range msgs {
		msgs[i] = makeSqliteMessageProjection(uuid.New().String(), channelID, remoteID,
			"wamid.bulk_"+uuid.New().String()[:8])
	}

	n, err := repo.UpsertAllIfNew(ctx, msgs)
	if err != nil {
		t.Fatalf("UpsertAllIfNew: %v", err)
	}
	if n != 5 {
		t.Errorf("inserted count: want 5, got %d", n)
	}

	// Replaying the same batch must report zero inserts. This is the assertion
	// the SQLite port had to re-engineer: Postgres distinguished insert from
	// update via `(xmax = 0)`, SQLite via RETURNING only firing for real inserts.
	n2, err := repo.UpsertAllIfNew(ctx, msgs)
	if err != nil {
		t.Fatalf("second UpsertAllIfNew: %v", err)
	}
	if n2 != 0 {
		t.Errorf("duplicate batch: want 0 inserted, got %d", n2)
	}
}

func TestSqliteMessageProjectionRepository_UpsertAllIfNew_LargeBatch(t *testing.T) {
	repo := NewSqliteMessageProjectionRepository(newMessageSqliteStore(t))
	ctx := context.Background()

	channelID := uuid.New().String()
	remoteID := "6285555@s.whatsapp.net"

	// 600 rows — exceeds the 500-row chunk, so the chunk loop must run twice and
	// the counts must add up.
	msgs := make([]*projections.Message, 600)
	for i := range msgs {
		msgs[i] = makeSqliteMessageProjection(uuid.New().String(), channelID, remoteID,
			"wamid.large_"+uuid.New().String())
	}

	n, err := repo.UpsertAllIfNew(ctx, msgs)
	if err != nil {
		t.Fatalf("UpsertAllIfNew large batch: %v", err)
	}
	if n != 600 {
		t.Errorf("large batch: want 600 inserted, got %d", n)
	}
}

// UpsertAllIfNew keeps the forward-only receipt merge that Postgres expressed as
// the ON CONFLICT DO UPDATE branch: a replayed message carrying a NEWER receipt
// advances delivered_at/seen_at on the existing row, an OLDER one does not, and
// no other column moves.
func TestSqliteMessageProjectionRepository_UpsertAllIfNew_MergesReceiptsForwardOnly(t *testing.T) {
	repo := NewSqliteMessageProjectionRepository(newMessageSqliteStore(t))
	ctx := context.Background()

	channelID := uuid.New().String()
	proj := makeSqliteMessageProjection(uuid.New().String(), channelID, "6289000@s.whatsapp.net", "wamid.merge001")
	if _, err := repo.UpsertAllIfNew(ctx, []*projections.Message{proj}); err != nil {
		t.Fatalf("seed UpsertAllIfNew: %v", err)
	}

	newer := time.Now().UTC().Truncate(time.Millisecond)
	older := newer.Add(-10 * time.Minute)

	// Replay with the NEWER receipt: no insert, but the receipt lands.
	replay := makeSqliteMessageProjection(uuid.New().String(), channelID, "6289000@s.whatsapp.net", "wamid.merge001")
	replay.DeliveredAt = &newer
	replay.SeenAt = &newer
	replay.Content = []byte(`{"text":"MUST NOT OVERWRITE"}`)
	n, err := repo.UpsertAllIfNew(ctx, []*projections.Message{replay})
	if err != nil {
		t.Fatalf("replay UpsertAllIfNew: %v", err)
	}
	if n != 0 {
		t.Errorf("replay should insert nothing, got %d", n)
	}

	got, err := repo.FindByPlatformID(ctx, channelID, "wamid.merge001")
	if err != nil || got == nil {
		t.Fatalf("FindByPlatformID: err=%v got=%v", err, got)
	}
	if got.DeliveredAt == nil || !got.DeliveredAt.Equal(newer) {
		t.Errorf("DeliveredAt: want %v, got %v", newer, got.DeliveredAt)
	}
	if got.SeenAt == nil || !got.SeenAt.Equal(newer) {
		t.Errorf("SeenAt: want %v, got %v", newer, got.SeenAt)
	}
	if string(got.Content) == `{"text":"MUST NOT OVERWRITE"}` {
		t.Error("the receipt merge must not touch content")
	}

	// Replay with an OLDER receipt: forward-only, so nothing moves back.
	stale := makeSqliteMessageProjection(uuid.New().String(), channelID, "6289000@s.whatsapp.net", "wamid.merge001")
	stale.DeliveredAt = &older
	stale.SeenAt = &older
	if _, err := repo.UpsertAllIfNew(ctx, []*projections.Message{stale}); err != nil {
		t.Fatalf("stale UpsertAllIfNew: %v", err)
	}

	after, err := repo.FindByPlatformID(ctx, channelID, "wamid.merge001")
	if err != nil || after == nil {
		t.Fatalf("FindByPlatformID (after): err=%v got=%v", err, after)
	}
	if after.DeliveredAt == nil || !after.DeliveredAt.Equal(newer) {
		t.Errorf("forward-only violated for delivered_at: want %v, got %v", newer, after.DeliveredAt)
	}
	if after.SeenAt == nil || !after.SeenAt.Equal(newer) {
		t.Errorf("forward-only violated for seen_at: want %v, got %v", newer, after.SeenAt)
	}
}

func TestSqliteMessageProjectionRepository_UpsertAllIfNew_Empty(t *testing.T) {
	repo := NewSqliteMessageProjectionRepository(newMessageSqliteStore(t))

	n, err := repo.UpsertAllIfNew(context.Background(), nil)
	if err != nil {
		t.Fatalf("UpsertAllIfNew(nil): %v", err)
	}
	if n != 0 {
		t.Errorf("want 0 inserted, got %d", n)
	}
}

func TestSqliteMessageProjectionRepository_ListByRemote_CursorPagination(t *testing.T) {
	repo := NewSqliteMessageProjectionRepository(newMessageSqliteStore(t))
	ctx := context.Background()

	channelID := uuid.New().String()
	remoteID := "6286666@s.whatsapp.net"

	base := time.Now().UTC().Truncate(time.Second)
	for i := 0; i < 6; i++ {
		p := makeSqliteMessageProjection(uuid.New().String(), channelID, remoteID,
			"wamid.pg_"+uuid.New().String()[:8])
		p.OccurredAt = base.Add(time.Duration(i) * time.Minute)
		if err := repo.Save(ctx, p); err != nil {
			t.Fatalf("Save %d: %v", i, err)
		}
	}

	first, err := repo.ListByRemote(ctx, channelID, remoteID, CursorOptions{Limit: 3})
	if err != nil {
		t.Fatalf("ListByRemote page 1: %v", err)
	}
	if len(first) != 3 {
		t.Fatalf("page 1: want 3, got %d", len(first))
	}
	// Newest first.
	if !first[0].OccurredAt.Equal(base.Add(5 * time.Minute)) {
		t.Errorf("page 1 head: want %v, got %v", base.Add(5*time.Minute), first[0].OccurredAt)
	}

	cursor := first[len(first)-1].OccurredAt
	second, err := repo.ListByRemote(ctx, channelID, remoteID, CursorOptions{Limit: 3, Before: &cursor})
	if err != nil {
		t.Fatalf("ListByRemote page 2: %v", err)
	}
	if len(second) != 3 {
		t.Errorf("page 2: want 3, got %d", len(second))
	}
	// Strictly-before cursor — the boundary row must not repeat.
	for _, m := range second {
		if !m.OccurredAt.Before(cursor) {
			t.Errorf("page 2 leaked a row at or after the cursor: %v >= %v", m.OccurredAt, cursor)
		}
	}
}

func TestSqliteMessageProjectionRepository_ListByRemote_ScopesByRemote(t *testing.T) {
	repo := NewSqliteMessageProjectionRepository(newMessageSqliteStore(t))
	ctx := context.Background()

	channelID := uuid.New().String()
	mine := "62810001@s.whatsapp.net"
	other := "62810002@s.whatsapp.net"

	for _, rid := range []string{mine, other} {
		p := makeSqliteMessageProjection(uuid.New().String(), channelID, rid, "wamid."+rid)
		if err := repo.Save(ctx, p); err != nil {
			t.Fatalf("Save %s: %v", rid, err)
		}
	}

	got, err := repo.ListByRemote(ctx, channelID, mine, CursorOptions{})
	if err != nil {
		t.Fatalf("ListByRemote: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("want 1 message for %s, got %d", mine, len(got))
	}
	if got[0].RemoteID != mine {
		t.Errorf("RemoteID: want %q, got %q", mine, got[0].RemoteID)
	}
}

func TestSqliteMessageProjectionRepository_UpdateDelivered_ForwardOnly(t *testing.T) {
	repo := NewSqliteMessageProjectionRepository(newMessageSqliteStore(t))
	ctx := context.Background()

	proj := makeSqliteMessageProjection(uuid.New().String(), uuid.New().String(), "6287777@s.whatsapp.net", "wamid.del001")
	if err := repo.Save(ctx, proj); err != nil {
		t.Fatalf("Save: %v", err)
	}

	t1 := time.Now().UTC().Truncate(time.Millisecond)
	t2 := t1.Add(-5 * time.Minute) // older

	if err := repo.UpdateDelivered(ctx, proj.ID, t1); err != nil {
		t.Fatalf("UpdateDelivered t1: %v", err)
	}
	if err := repo.UpdateDelivered(ctx, proj.ID, t2); err != nil {
		t.Fatalf("UpdateDelivered t2 (older): %v", err)
	}

	got, err := repo.Find(ctx, proj.ID)
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if got.DeliveredAt == nil {
		t.Fatal("DeliveredAt should be set")
	}
	if !got.DeliveredAt.Equal(t1) {
		t.Errorf("forward-only violated: want %v, got %v", t1, *got.DeliveredAt)
	}
}

// The COALESCE seed inside MAX() is what makes the FIRST receipt on a row whose
// delivered_at is still NULL write the timestamp instead of NULL. SQLite MAX()
// returns NULL if any argument is NULL, exactly like Postgres GREATEST, so
// dropping the COALESCE would silently blank the column.
func TestSqliteMessageProjectionRepository_UpdateDelivered_FirstReceiptFromNull(t *testing.T) {
	repo := NewSqliteMessageProjectionRepository(newMessageSqliteStore(t))
	ctx := context.Background()

	proj := makeSqliteMessageProjection(uuid.New().String(), uuid.New().String(), "6287778@s.whatsapp.net", "wamid.firstdel")
	if err := repo.Save(ctx, proj); err != nil {
		t.Fatalf("Save: %v", err)
	}

	at := time.Now().UTC().Truncate(time.Millisecond)
	if err := repo.UpdateDelivered(ctx, proj.ID, at); err != nil {
		t.Fatalf("UpdateDelivered: %v", err)
	}
	if err := repo.UpdateSeen(ctx, proj.ID, at); err != nil {
		t.Fatalf("UpdateSeen: %v", err)
	}

	got, err := repo.Find(ctx, proj.ID)
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if got.DeliveredAt == nil || !got.DeliveredAt.Equal(at) {
		t.Errorf("first delivered receipt lost: want %v, got %v", at, got.DeliveredAt)
	}
	if got.SeenAt == nil || !got.SeenAt.Equal(at) {
		t.Errorf("first seen receipt lost: want %v, got %v", at, got.SeenAt)
	}
}

func TestSqliteMessageProjectionRepository_UpdateSeen_ForwardOnly(t *testing.T) {
	repo := NewSqliteMessageProjectionRepository(newMessageSqliteStore(t))
	ctx := context.Background()

	proj := makeSqliteMessageProjection(uuid.New().String(), uuid.New().String(), "6288888@s.whatsapp.net", "wamid.seen001")
	if err := repo.Save(ctx, proj); err != nil {
		t.Fatalf("Save: %v", err)
	}

	t1 := time.Now().UTC().Truncate(time.Millisecond)
	t2 := t1.Add(-10 * time.Minute)

	if err := repo.UpdateSeen(ctx, proj.ID, t1); err != nil {
		t.Fatalf("UpdateSeen t1: %v", err)
	}
	if err := repo.UpdateSeen(ctx, proj.ID, t2); err != nil {
		t.Fatalf("UpdateSeen t2 (older): %v", err)
	}

	got, err := repo.Find(ctx, proj.ID)
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if got.SeenAt == nil {
		t.Fatal("SeenAt should be set")
	}
	if !got.SeenAt.Equal(t1) {
		t.Errorf("forward-only violated: want %v, got %v", t1, *got.SeenAt)
	}
}

func TestSqliteMessageProjectionRepository_UpdateDelivered_Concurrent(t *testing.T) {
	repo := NewSqliteMessageProjectionRepository(newMessageSqliteStore(t))
	ctx := context.Background()

	proj := makeSqliteMessageProjection(uuid.New().String(), uuid.New().String(), "6289999@s.whatsapp.net", "wamid.conc001")
	if err := repo.Save(ctx, proj); err != nil {
		t.Fatalf("Save: %v", err)
	}

	// Concurrent receipts arriving out of order. SQLite is a single-writer store
	// with busy_timeout=5000, so these serialize; MAX() then guarantees the
	// latest timestamp wins regardless of arrival order.
	base := time.Now().UTC().Truncate(time.Second)
	var wg sync.WaitGroup
	errs := make([]error, 5)
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			errs[i] = repo.UpdateDelivered(ctx, proj.ID, base.Add(time.Duration(i)*time.Second))
		}(i)
	}
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Fatalf("concurrent UpdateDelivered %d: %v", i, err)
		}
	}

	got, err := repo.Find(ctx, proj.ID)
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	expected := base.Add(4 * time.Second)
	if got.DeliveredAt == nil || !got.DeliveredAt.Equal(expected) {
		t.Errorf("concurrent delivered: want %v, got %v", expected, got.DeliveredAt)
	}
}

// ---------------------------------------------------------------------------
// Post-sync LID normalization
// ---------------------------------------------------------------------------

func TestSqliteMessageProjectionRepository_FindDistinctLIDRemoteIDs(t *testing.T) {
	repo := NewSqliteMessageProjectionRepository(newMessageSqliteStore(t))
	ctx := context.Background()

	channelID := uuid.New().String()
	otherChannel := uuid.New().String()
	lidA := "111111111111@lid"
	lidB := "222222222222@lid"
	pn := "5583999@s.whatsapp.net"

	// Two messages under lidA (must be de-duplicated by DISTINCT), one under
	// lidB, one PN-keyed (excluded), one LID on another channel (excluded).
	for _, spec := range []struct{ ch, remote string }{
		{channelID, lidA}, {channelID, lidA}, {channelID, lidB},
		{channelID, pn}, {otherChannel, lidA},
	} {
		p := makeSqliteMessageProjection(uuid.New().String(), spec.ch, spec.remote,
			"wamid."+uuid.New().String()[:8])
		if err := repo.Save(ctx, p); err != nil {
			t.Fatalf("Save: %v", err)
		}
	}

	ids, err := repo.FindDistinctLIDRemoteIDs(ctx, channelID)
	if err != nil {
		t.Fatalf("FindDistinctLIDRemoteIDs: %v", err)
	}
	if len(ids) != 2 {
		t.Fatalf("want 2 distinct LID remote ids, got %d (%v)", len(ids), ids)
	}
	seen := map[string]bool{ids[0]: true, ids[1]: true}
	if !seen[lidA] || !seen[lidB] {
		t.Errorf("unexpected LID set: %v", ids)
	}
}

func TestSqliteMessageProjectionRepository_RewriteRemoteIDs(t *testing.T) {
	repo := NewSqliteMessageProjectionRepository(newMessageSqliteStore(t))
	ctx := context.Background()

	channelID := uuid.New().String()
	lid := "333333333333@lid"
	pn := "5583988887777@s.whatsapp.net"
	untouched := "5583911112222@s.whatsapp.net"

	var lidIDs []string
	for i := 0; i < 2; i++ {
		p := makeSqliteMessageProjection(uuid.New().String(), channelID, lid, "wamid.lid"+uuid.New().String()[:8])
		if err := repo.Save(ctx, p); err != nil {
			t.Fatalf("Save lid msg: %v", err)
		}
		lidIDs = append(lidIDs, p.ID)
	}
	keep := makeSqliteMessageProjection(uuid.New().String(), channelID, untouched, "wamid.keep")
	if err := repo.Save(ctx, keep); err != nil {
		t.Fatalf("Save untouched msg: %v", err)
	}

	rewritten, err := repo.RewriteRemoteIDs(ctx, channelID, map[string]string{lid: pn})
	if err != nil {
		t.Fatalf("RewriteRemoteIDs: %v", err)
	}
	if len(rewritten) != 2 {
		t.Fatalf("want 2 rewritten rows returned, got %d", len(rewritten))
	}
	for _, m := range rewritten {
		if m.RemoteID != pn {
			t.Errorf("returned row still LID-keyed: %q", m.RemoteID)
		}
	}

	// Rows are actually re-keyed in the table...
	underPN, err := repo.ListByRemote(ctx, channelID, pn, CursorOptions{})
	if err != nil {
		t.Fatalf("ListByRemote(pn): %v", err)
	}
	if len(underPN) != len(lidIDs) {
		t.Errorf("want %d messages under the PN key, got %d", len(lidIDs), len(underPN))
	}
	// ...and unrelated remotes are left alone.
	underOther, err := repo.ListByRemote(ctx, channelID, untouched, CursorOptions{})
	if err != nil {
		t.Fatalf("ListByRemote(untouched): %v", err)
	}
	if len(underOther) != 1 {
		t.Errorf("unrelated remote was rewritten: want 1 message, got %d", len(underOther))
	}
}

func TestSqliteMessageProjectionRepository_RewriteRemoteIDs_EmptyMap(t *testing.T) {
	repo := NewSqliteMessageProjectionRepository(newMessageSqliteStore(t))

	got, err := repo.RewriteRemoteIDs(context.Background(), uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("RewriteRemoteIDs(nil): %v", err)
	}
	if got != nil {
		t.Errorf("want nil for an empty mapping, got %+v", got)
	}
}
