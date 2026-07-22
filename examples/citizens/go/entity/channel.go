// CONTEXT-ORIGIN: medscall/software/monorepo/packages/channel@ff66dbb1ee0fcd6212e5bf68879fa1d5a0a9cd1b (2026-07-20)
// Source path: packages/channel/internal/channel/entities/channel.go
// Harvested verbatim for the entity skill exemplar set — do not edit; re-harvest instead.
package entities

import (
	"encoding/json"
	"fmt"
	"time"

	"monorepo/api/internal/channel/enums"
	ctxerrors "monorepo/api/internal/channel/errors"
	ctxevents "monorepo/api/internal/channel/events"
	"monorepo/api/internal/shared/entities"
	sharedenums "monorepo/api/internal/shared/enums"
	"monorepo/api/internal/shared/errors"

	"github.com/google/uuid"
)

// Channel is the aggregate root for the channel bounded context.
type Channel struct {
	entities.BaseEntity
	Name          string
	Platform      sharedenums.Platform
	OwnerRemoteID string
	Status        enums.ChannelStatus
	OwnerID       string
	Credentials   json.RawMessage
}

type NewChannelParams struct {
	Name     string
	Platform sharedenums.Platform
	OwnerID  string
}

func NewChannel(params NewChannelParams) (*Channel, error) {
	if params.Name == "" {
		return nil, errors.NewBaseError(ctxerrors.CodeRemoteInvalidParams, "channel name is required")
	}

	ch := &Channel{
		BaseEntity:    entities.NewBaseEntity(),
		Name:          params.Name,
		Platform:      params.Platform,
		OwnerRemoteID: "",
		Status:        enums.ChannelStatusCreated,
		OwnerID:       params.OwnerID,
		Credentials:   json.RawMessage("{}"),
	}

	ch.AddDomainEvent(ctxevents.NewChannelCreatedEvent(
		ch.ID.UUID(),
		params.OwnerID,
		ctxevents.ChannelCreatedPayload{
			ChannelID: ch.ID.UUID(),
			Name:      params.Name,
			Platform:  params.Platform,
			OwnerID:   params.OwnerID,
		},
	))

	return ch, nil
}

type ReconstructChannelParams struct {
	ID            uuid.UUID
	Name          string
	Platform      sharedenums.Platform
	OwnerRemoteID string
	Credentials   json.RawMessage
	Status        enums.ChannelStatus
	OwnerID       string
	CreatedAt     time.Time
	UpdatedAt     time.Time
	Version       int
}

func ReconstructChannel(params ReconstructChannelParams) *Channel {
	return &Channel{
		BaseEntity:    entities.ReconstructBaseEntity(entities.ReconstructBaseEntityParams{ID: params.ID, CreatedAt: params.CreatedAt, UpdatedAt: params.UpdatedAt, Version: params.Version}),
		Name:          params.Name,
		Platform:      params.Platform,
		OwnerRemoteID: params.OwnerRemoteID,
		Status:        params.Status,
		OwnerID:       params.OwnerID,
		Credentials:   params.Credentials,
	}
}

// SetConnecting marks the channel as CONNECTING and emits a ChannelConnectingEvent.
func (c *Channel) SetConnecting() {
	c.Status = enums.ChannelStatusConnecting
	c.IncrementVersion()
	c.AddDomainEvent(ctxevents.NewChannelConnectingEvent(
		c.ID.UUID(),
		c.OwnerID,
		ctxevents.ChannelConnectingPayload{
			ChannelID: c.ID.UUID(),
			OwnerID:   c.OwnerID,
		},
	))
}

// SetConnected marks the channel as CONNECTED and emits a ChannelConnectedEvent.
func (c *Channel) SetConnected(ownerRemoteID string) {
	c.Status = enums.ChannelStatusConnected
	c.OwnerRemoteID = ownerRemoteID
	c.IncrementVersion()
	c.AddDomainEvent(ctxevents.NewChannelConnectedEvent(
		c.ID.UUID(),
		c.OwnerID,
		ctxevents.ChannelConnectedPayload{
			ChannelID:     c.ID.UUID(),
			OwnerRemoteID: ownerRemoteID,
			OwnerID:       c.OwnerID,
		},
	))
}

// SetDisconnected marks the channel as DISCONNECTED and emits a ChannelDisconnectedEvent.
func (c *Channel) SetDisconnected() {
	c.Status = enums.ChannelStatusDisconnected
	c.IncrementVersion()
	c.AddDomainEvent(ctxevents.NewChannelDisconnectedEvent(
		c.ID.UUID(),
		c.OwnerID,
		ctxevents.ChannelDisconnectedPayload{
			ChannelID: c.ID.UUID(),
			OwnerID:   c.OwnerID,
		},
	))
}

// Apply replays a persisted lifecycle event onto the channel's state.
func (c *Channel) Apply(name string, payload json.RawMessage) error {
	switch name {
	case ctxevents.ChannelCreatedEventName:
		var p ctxevents.ChannelCreatedPayload
		if err := json.Unmarshal(payload, &p); err != nil {
			return err
		}
		c.Name = p.Name
		c.Platform = p.Platform
		c.OwnerID = p.OwnerID
		c.Status = enums.ChannelStatusCreated

	case ctxevents.ChannelConnectingEventName:
		c.Status = enums.ChannelStatusConnecting

	case ctxevents.ChannelConnectedEventName:
		var p ctxevents.ChannelConnectedPayload
		if err := json.Unmarshal(payload, &p); err != nil {
			return err
		}
		c.OwnerRemoteID = p.OwnerRemoteID
		c.Status = enums.ChannelStatusConnected

	case ctxevents.GatewayConnectedEventName:
		c.Status = enums.ChannelStatusConnected

	case ctxevents.ChannelDisconnectedEventName, ctxevents.GatewayDisconnectedEventName:
		c.Status = enums.ChannelStatusDisconnected

	case ctxevents.ChannelDeletedEventName:
		c.Status = enums.ChannelStatusDeleted

	default:
		return fmt.Errorf("channel: unknown lifecycle event %q", name)
	}

	c.Version++
	return nil
}
