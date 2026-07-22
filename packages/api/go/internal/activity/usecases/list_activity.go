// Package usecases holds the activity context's application operations.
package usecases

import (
	"context"
	"time"

	"template/api-go/internal/activity/projections"
)

// ListActivityInput is the query input — a ctx-local read over the context's
// own projection (no cross-context joins; UI-shaped BFF queries belong to
// api-typescript).
type ListActivityInput struct {
	OwnerID string `validate:"required,uuid"`
	Limit   int    `validate:"omitempty,min=1,max=100"`
	Before  *time.Time
}

// ActivityEntryDTO is the wire shape of one activity feed entry.
type ActivityEntryDTO struct {
	ID              string    `json:"id" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	EventName       string    `json:"eventName" example:"integration.billing.subscription_changed"`
	EntityID        string    `json:"entityId" example:"0f8fad5b-d9cb-469f-a165-70867728950e"`
	FirstOccurredAt time.Time `json:"firstOccurredAt"`
	LastOccurredAt  time.Time `json:"lastOccurredAt"`
	OccurrenceCount int64     `json:"occurrenceCount" example:"1"`
}

// ListActivityOutput is the query output.
type ListActivityOutput struct {
	Entries []ActivityEntryDTO `json:"entries"`
}

// ListActivityHandler returns the owner-scoped activity feed, newest first.
type ListActivityHandler struct {
	repo projections.ActivityEntryProjectionRepository
}

func NewListActivityHandler(repo projections.ActivityEntryProjectionRepository) *ListActivityHandler {
	return &ListActivityHandler{repo: repo}
}

func (h *ListActivityHandler) Name() string { return "list_activity" }

func (h *ListActivityHandler) Execute(ctx context.Context, input ListActivityInput) (ListActivityOutput, error) {
	limit := input.Limit
	if limit <= 0 {
		limit = 50
	}

	rows, err := h.repo.ListByOwner(ctx, input.OwnerID, projections.CursorOptions{
		Limit:  limit,
		Before: input.Before,
	})
	if err != nil {
		return ListActivityOutput{}, err
	}

	entries := make([]ActivityEntryDTO, 0, len(rows))
	for _, row := range rows {
		entries = append(entries, ActivityEntryDTO{
			ID:              row.ID,
			EventName:       row.EventName,
			EntityID:        row.EntityID,
			FirstOccurredAt: row.FirstOccurredAt,
			LastOccurredAt:  row.LastOccurredAt,
			OccurrenceCount: row.OccurrenceCount,
		})
	}

	return ListActivityOutput{Entries: entries}, nil
}
