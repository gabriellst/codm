// CONTEXT-ORIGIN: medscall/software/monorepo/packages/channel@ff66dbb1ee0fcd6212e5bf68879fa1d5a0a9cd1b (2026-07-20)
// Source path: packages/channel/internal/shared/entities/base_entity.go
// Harvested verbatim for the entity skill exemplar set — do not edit; re-harvest instead.
package entities

import (
	"time"

	"github.com/google/uuid"

	"monorepo/api/internal/shared/objects"
	"monorepo/api/internal/shared/types"
)

// BaseEntity is the base struct for all domain entities.
// Entities that are aggregate roots simply embed this struct —
// the distinction is symbolic/documental, not structural.
type BaseEntity struct {
	ID           objects.ID `json:"id" db:"id"`
	CreatedAt    time.Time  `json:"createdAt" db:"created_at"`
	UpdatedAt    time.Time  `json:"updatedAt" db:"updated_at"`
	Version      int        `json:"version" db:"version"`
	domainEvents []types.DomainEventI
}

// NewBaseEntityParams are optional params for creating a BaseEntity.
type NewBaseEntityParams struct {
	ID objects.ID
}

// NewBaseEntity creates a new BaseEntity. If params.ID is provided, uses it; otherwise generates a random ID.
func NewBaseEntity(params ...NewBaseEntityParams) BaseEntity {
	now := time.Now().UTC()
	id := objects.NewID()

	if len(params) > 0 && !params[0].ID.IsZero() {
		id = params[0].ID
	}

	return BaseEntity{
		ID:        id,
		CreatedAt: now,
		UpdatedAt: now,
		Version:   1,
	}
}

// ReconstructBaseEntityParams holds the fields required to reconstruct a BaseEntity from persistence.
type ReconstructBaseEntityParams struct {
	ID        uuid.UUID
	CreatedAt time.Time
	UpdatedAt time.Time
	Version   int
}

// ReconstructBaseEntity recreates a BaseEntity from persistence without side effects.
// Use this instead of NewBaseEntity when rehydrating from a database row.
func ReconstructBaseEntity(params ReconstructBaseEntityParams) BaseEntity {
	return BaseEntity{
		ID:        objects.IDFromUUID(params.ID),
		CreatedAt: params.CreatedAt,
		UpdatedAt: params.UpdatedAt,
		Version:   params.Version,
	}
}

// IncrementVersion bumps the entity version and refreshes UpdatedAt.
// Returns nil for now; the error return is reserved for future invariant checks.
func (e *BaseEntity) IncrementVersion() error {
	e.Version++
	e.UpdatedAt = time.Now().UTC()
	return nil
}

func (e *BaseEntity) AddDomainEvent(event types.DomainEventI) {
	e.domainEvents = append(e.domainEvents, event)
}

func (e *BaseEntity) PullDomainEvents() []types.DomainEventI {
	pulled := e.domainEvents
	e.domainEvents = nil
	return pulled
}
