package projectors

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"template/api-go/internal/activity/projections"
	"template/contracts-go/wire"
	fwtypes "template/core-go/types"
)

// ─── in-memory fake repository ───────────────────────────────────────────────

type fakeActivityEntryRepo struct {
	rows    map[string]*projections.ActivityEntry // key: owner|event|entity
	saves   int
	inserts int
}

func newFakeActivityEntryRepo() *fakeActivityEntryRepo {
	return &fakeActivityEntryRepo{rows: map[string]*projections.ActivityEntry{}}
}

func key(ownerID, eventName, entityID string) string {
	return ownerID + "|" + eventName + "|" + entityID
}

func (f *fakeActivityEntryRepo) FindByKey(_ context.Context, ownerID, eventName, entityID string) (*projections.ActivityEntry, error) {
	row, ok := f.rows[key(ownerID, eventName, entityID)]
	if !ok {
		return nil, nil
	}
	cp := *row
	return &cp, nil
}

func (f *fakeActivityEntryRepo) ListByOwner(_ context.Context, ownerID string, _ projections.CursorOptions) ([]*projections.ActivityEntry, error) {
	var out []*projections.ActivityEntry
	for _, row := range f.rows {
		if row.OwnerID == ownerID {
			cp := *row
			out = append(out, &cp)
		}
	}
	return out, nil
}

func (f *fakeActivityEntryRepo) Save(_ context.Context, entry *projections.ActivityEntry) error {
	f.saves++
	cp := *entry
	f.rows[key(entry.OwnerID, entry.EventName, entry.EntityID)] = &cp
	return nil
}

func (f *fakeActivityEntryRepo) InsertIfNew(_ context.Context, entry *projections.ActivityEntry) (bool, error) {
	k := key(entry.OwnerID, entry.EventName, entry.EntityID)
	if _, ok := f.rows[k]; ok {
		return false, nil
	}
	f.inserts++
	cp := *entry
	f.rows[k] = &cp
	return true, nil
}

var _ projections.ActivityEntryProjectionRepository = (*fakeActivityEntryRepo)(nil)

// ─── raw wire event (slow path: decoded from the stream envelope) ────────────

// rawWireEvent mirrors the mediator's raw stream entry: the full flat wire JSON
// is exposed through GetPayload and the typed struct is recovered by
// fwtypes.UnmarshalIntegrationEvent.
type rawWireEvent struct {
	name string
	raw  json.RawMessage
}

func (e *rawWireEvent) GetEventName() string        { return e.name }
func (e *rawWireEvent) GetOwnerID() string          { return "" }
func (e *rawWireEvent) GetPayload() json.RawMessage { return e.raw }

var _ fwtypes.IntegrationEventI = (*rawWireEvent)(nil)

// ─── tests ───────────────────────────────────────────────────────────────────

const (
	testOwnerID  = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"
	testEntityID = "7c9e6679-7425-40de-944b-e07fc1f90ae7"
)

func typedEvent(ownerID, entityID string, occurredAt time.Time) fwtypes.IntegrationEventI {
	return fwtypes.NewIntegrationEvent(wire.SubscriptionChangedEventName, ownerID, wire.SubscriptionChangedEvent{
		Name:       wire.SubscriptionChangedEventName,
		EntityID:   entityID,
		OwnerID:    ownerID,
		OccurredAt: occurredAt,
	})
}

func TestActivityEntryProjector_Handle(t *testing.T) {
	base := time.Date(2026, 7, 1, 12, 0, 0, 0, time.UTC)

	type step struct {
		entityID   string
		occurredAt time.Time
	}

	tests := []struct {
		name      string
		steps     []step
		wantRows  int
		wantCount int64
		wantLast  time.Time
	}{
		{
			name:      "first delivery inserts a new entry",
			steps:     []step{{testEntityID, base}},
			wantRows:  1,
			wantCount: 1,
			wantLast:  base,
		},
		{
			name:      "redelivery of the same occurrence stays idempotent",
			steps:     []step{{testEntityID, base}, {testEntityID, base}},
			wantRows:  1,
			wantCount: 1,
			wantLast:  base,
		},
		{
			name:      "new occurrence of the same fact advances the row",
			steps:     []step{{testEntityID, base}, {testEntityID, base.Add(time.Hour)}},
			wantRows:  1,
			wantCount: 2,
			wantLast:  base.Add(time.Hour),
		},
		{
			name:      "out-of-order older occurrence never regresses the row",
			steps:     []step{{testEntityID, base}, {testEntityID, base.Add(-time.Hour)}},
			wantRows:  1,
			wantCount: 1,
			wantLast:  base,
		},
		{
			name: "distinct entities get distinct rows",
			steps: []step{
				{testEntityID, base},
				{"0f8fad5b-d9cb-469f-a165-70867728950e", base.Add(time.Minute)},
			},
			wantRows:  2,
			wantCount: 1,
			wantLast:  base,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := newFakeActivityEntryRepo()
			projector := NewActivityEntryProjector(repo)

			for _, s := range tt.steps {
				if err := projector.Handle(context.Background(), typedEvent(testOwnerID, s.entityID, s.occurredAt)); err != nil {
					t.Fatalf("Handle() error = %v", err)
				}
			}

			if len(repo.rows) != tt.wantRows {
				t.Fatalf("rows = %d, want %d", len(repo.rows), tt.wantRows)
			}
			row, err := repo.FindByKey(context.Background(), testOwnerID, wire.SubscriptionChangedEventName, tt.steps[0].entityID)
			if err != nil || row == nil {
				t.Fatalf("FindByKey() = (%v, %v), want row", row, err)
			}
			if row.OccurrenceCount != tt.wantCount {
				t.Errorf("OccurrenceCount = %d, want %d", row.OccurrenceCount, tt.wantCount)
			}
			if !row.LastOccurredAt.Equal(tt.wantLast) {
				t.Errorf("LastOccurredAt = %v, want %v", row.LastOccurredAt, tt.wantLast)
			}
			if !row.FirstOccurredAt.Equal(tt.steps[0].occurredAt) {
				t.Errorf("FirstOccurredAt = %v, want %v", row.FirstOccurredAt, tt.steps[0].occurredAt)
			}
			if row.EventName != wire.SubscriptionChangedEventName {
				t.Errorf("EventName = %q, want %q", row.EventName, wire.SubscriptionChangedEventName)
			}
		})
	}
}

// TestActivityEntryProjector_Handle_RawWirePayload exercises the slow path the
// Redis mediator uses in production: the event arrives as an opaque envelope
// whose payload is the full flat wire JSON.
func TestActivityEntryProjector_Handle_RawWirePayload(t *testing.T) {
	base := time.Date(2026, 7, 1, 12, 0, 0, 0, time.UTC)

	raw, err := json.Marshal(wire.SubscriptionChangedEvent{
		Name:       wire.SubscriptionChangedEventName,
		EntityID:   testEntityID,
		OwnerID:    testOwnerID,
		OccurredAt: base,
	})
	if err != nil {
		t.Fatalf("marshal wire event: %v", err)
	}

	repo := newFakeActivityEntryRepo()
	projector := NewActivityEntryProjector(repo)

	event := &rawWireEvent{name: wire.SubscriptionChangedEventName, raw: raw}
	if err := projector.Handle(context.Background(), event); err != nil {
		t.Fatalf("Handle() error = %v", err)
	}

	row, err := repo.FindByKey(context.Background(), testOwnerID, wire.SubscriptionChangedEventName, testEntityID)
	if err != nil || row == nil {
		t.Fatalf("FindByKey() = (%v, %v), want row", row, err)
	}
	if row.OwnerID != testOwnerID {
		t.Errorf("OwnerID = %q, want %q (must come from the wire payload, not the envelope)", row.OwnerID, testOwnerID)
	}
	if repo.inserts != 1 {
		t.Errorf("inserts = %d, want 1", repo.inserts)
	}
}
