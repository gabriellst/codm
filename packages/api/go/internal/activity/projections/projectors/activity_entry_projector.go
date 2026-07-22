// Package projectors keeps the activity projections fresh as integration
// events flow through the system.
package projectors

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"template/api-go/internal/activity/projections"
	"template/contracts-go/wire"
	"template/core-go/services/mediator"
	fwtypes "template/core-go/types"
)

// ──────────────────────────────────────────────────────────────────────────────
// ActivityEntryProjector
//
// The single event-driven writer of the ActivityEntry projection. It consumes
// the wire integration event(s) that feed the activity feed — today that is
// integration.billing.subscription_changed, the only integration event on the
// contracts wire — and materializes one row per logical fact.
//
// Creation path: InsertIfNew (idempotent — the (owner_id, event_name,
// entity_id) unique index makes duplicate deliveries a no-op).
// Mutation path: find → ApplyOccurrence → save. ApplyOccurrence is
// forward-only, so redeliveries and out-of-order occurrences never regress
// the row.
// ──────────────────────────────────────────────────────────────────────────────

type ActivityEntryProjector struct {
	repo projections.ActivityEntryProjectionRepository
}

func NewActivityEntryProjector(repo projections.ActivityEntryProjectionRepository) *ActivityEntryProjector {
	return &ActivityEntryProjector{repo: repo}
}

// compile-time interface check.
var _ mediator.IntegrationEventHandler = (*ActivityEntryProjector)(nil)

func (p *ActivityEntryProjector) EventName() string { return wire.SubscriptionChangedEventName }

func (p *ActivityEntryProjector) Handle(ctx context.Context, event fwtypes.IntegrationEventI) error {
	typed, err := fwtypes.UnmarshalIntegrationEvent[wire.SubscriptionChangedEvent](event)
	if err != nil {
		return err
	}
	pl := typed.Payload

	// The wire shape is flat: the owner travels on the payload; the envelope
	// OwnerID is a fallback for typed in-memory publishes.
	ownerID := pl.OwnerID
	if ownerID == "" {
		ownerID = typed.OwnerID
	}
	eventName := pl.EventName()
	occurredAt := pl.OccurredAt.UTC()

	row, err := p.repo.FindByKey(ctx, ownerID, eventName, pl.EntityID)
	if err != nil {
		return err
	}

	if row == nil {
		entry := &projections.ActivityEntry{
			ID:              uuid.NewString(),
			OwnerID:         ownerID,
			EventName:       eventName,
			EntityID:        pl.EntityID,
			FirstOccurredAt: occurredAt,
			LastOccurredAt:  occurredAt,
			OccurrenceCount: 1,
			RecordedAt:      time.Now().UTC(),
			Version:         1,
		}
		inserted, err := p.repo.InsertIfNew(ctx, entry)
		if err != nil {
			return err
		}
		if !inserted {
			slog.Debug("activity entry already projected (duplicate)",
				"ownerId", ownerID,
				"eventName", eventName,
				"entityId", pl.EntityID,
			)
		}
		return nil
	}

	row.ApplyOccurrence(occurredAt)
	return p.repo.Save(ctx, row)
}
