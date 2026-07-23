package handlers

import (
	"context"
	"log/slog"
	"time"

	ctxevents "template/api-go/internal/channel/events"
	repositories "template/api-go/internal/shared/repositories"
	"template/api-go/internal/shared/services/mediator"
	"template/core-go/types"
)

// ──────────────────────────────────────────────
// Sync started — listens to channel.gateway_connected

type SyncStartedHandler struct {
	domainEventRepo repositories.DomainEventRepository
}

func NewSyncStartedHandler(repo repositories.DomainEventRepository) *SyncStartedHandler {
	return &SyncStartedHandler{domainEventRepo: repo}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*SyncStartedHandler)(nil)

func (h *SyncStartedHandler) EventName() string {
	return ctxevents.GatewayConnectedEventName
}

func (h *SyncStartedHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.GatewayConnectedPayload](event)
	if err != nil {
		return err
	}
	domain := ctxevents.NewSyncStartedEvent(e.Payload.ChannelID, e.OwnerID, ctxevents.ChannelSyncStartedPayload{
		ChannelID: e.Payload.ChannelID,
		OwnerID:   e.OwnerID,
		StartedAt: time.Now().UTC(),
	})
	if err := h.domainEventRepo.Save(ctx, domain); err != nil {
		slog.Warn("failed to save sync_started event",
			"channelId", e.Payload.ChannelID, "error", err)
		return err
	}
	return nil
}

// ──────────────────────────────────────────────
// Sync progress — listens to channel.gateway.history_sync

type SyncProgressHandler struct {
	domainEventRepo repositories.DomainEventRepository
}

func NewSyncProgressHandler(repo repositories.DomainEventRepository) *SyncProgressHandler {
	return &SyncProgressHandler{domainEventRepo: repo}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*SyncProgressHandler)(nil)

func (h *SyncProgressHandler) EventName() string {
	return ctxevents.GatewayHistorySyncEventName
}

func (h *SyncProgressHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelGatewayHistorySyncPayload](event)
	if err != nil {
		return err
	}
	domain := ctxevents.NewSyncProgressEvent(e.Payload.ChannelID, e.OwnerID, ctxevents.ChannelSyncProgressPayload{
		ChannelID:       e.Payload.ChannelID,
		OwnerID:         e.OwnerID,
		HistorySyncType: e.Payload.HistorySyncType,
		Percent:         e.Payload.Percent,
	})
	if err := h.domainEventRepo.Save(ctx, domain); err != nil {
		slog.Warn("failed to save sync_progress event",
			"channelId", e.Payload.ChannelID, "error", err)
		return err
	}
	return nil
}

// ──────────────────────────────────────────────
// Sync completed — listens to channel.gateway.sync_complete

type SyncCompletedHandler struct {
	domainEventRepo repositories.DomainEventRepository
}

func NewSyncCompletedHandler(repo repositories.DomainEventRepository) *SyncCompletedHandler {
	return &SyncCompletedHandler{domainEventRepo: repo}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*SyncCompletedHandler)(nil)

func (h *SyncCompletedHandler) EventName() string {
	return ctxevents.GatewaySyncCompleteEventName
}

func (h *SyncCompletedHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelGatewaySyncCompletePayload](event)
	if err != nil {
		return err
	}
	domain := ctxevents.NewSyncCompletedEvent(e.Payload.ChannelID, e.OwnerID, ctxevents.ChannelSyncCompletedPayload{
		ChannelID:   e.Payload.ChannelID,
		OwnerID:     e.OwnerID,
		CompletedAt: time.Now().UTC(),
	})
	if err := h.domainEventRepo.Save(ctx, domain); err != nil {
		slog.Warn("failed to save sync_completed event",
			"channelId", e.Payload.ChannelID, "error", err)
		return err
	}
	return nil
}
