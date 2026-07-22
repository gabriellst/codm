package projections

import (
	"testing"
	"time"
)

func TestActivityEntry_ApplyOccurrence(t *testing.T) {
	base := time.Date(2026, 7, 1, 12, 0, 0, 0, time.UTC)

	tests := []struct {
		name          string
		occurrences   []time.Time
		wantLast      time.Time
		wantCount     int64
		wantFirstKept bool
	}{
		{
			name:          "newer occurrence advances last and count",
			occurrences:   []time.Time{base.Add(time.Hour)},
			wantLast:      base.Add(time.Hour),
			wantCount:     2,
			wantFirstKept: true,
		},
		{
			name:          "redelivery of the same occurrence is a no-op",
			occurrences:   []time.Time{base},
			wantLast:      base,
			wantCount:     1,
			wantFirstKept: true,
		},
		{
			name:          "out-of-order older occurrence is ignored",
			occurrences:   []time.Time{base.Add(-time.Hour)},
			wantLast:      base,
			wantCount:     1,
			wantFirstKept: true,
		},
		{
			name: "sequence of occurrences counts each forward step once",
			occurrences: []time.Time{
				base.Add(time.Hour),
				base.Add(time.Hour), // redelivery — ignored
				base.Add(2 * time.Hour),
				base.Add(30 * time.Minute), // out of order — ignored
			},
			wantLast:      base.Add(2 * time.Hour),
			wantCount:     3,
			wantFirstKept: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			entry := &ActivityEntry{
				ID:              "e1",
				OwnerID:         "o1",
				EventName:       "integration.example.fact_recorded",
				EntityID:        "a1",
				FirstOccurredAt: base,
				LastOccurredAt:  base,
				OccurrenceCount: 1,
			}

			for _, at := range tt.occurrences {
				entry.ApplyOccurrence(at)
			}

			if !entry.LastOccurredAt.Equal(tt.wantLast) {
				t.Errorf("LastOccurredAt = %v, want %v", entry.LastOccurredAt, tt.wantLast)
			}
			if entry.OccurrenceCount != tt.wantCount {
				t.Errorf("OccurrenceCount = %d, want %d", entry.OccurrenceCount, tt.wantCount)
			}
			if tt.wantFirstKept && !entry.FirstOccurredAt.Equal(base) {
				t.Errorf("FirstOccurredAt mutated to %v, want %v", entry.FirstOccurredAt, base)
			}
		})
	}
}
