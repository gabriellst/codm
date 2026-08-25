package handlers

import (
	"context"
	"log/slog"

	ctxevents "template/api-go/internal/channel/events"
	projectors "template/api-go/internal/channel/projections/projectors"
	repositories "template/core-go/repositories"
	"template/core-go/services/mediator"
	"template/core-go/types"
)

// ──────────────────────────────────────────────────────────────────────────────
// RemoteSnapshotSyncedHandler
//
// Listens to channel.gateway.sync_complete, delegates phase 1 of the contact
// snapshot to RemoteSnapshotProjector, then raises channel.remotes_synced
// from the counts it returns.
//
// Canon-fix (.plans/2026-08-10-eixo-ambiente-go.md, T13 debt): a Projector's
// surface is its ProjectionRepository — never a DomainEventRepository.
// Before this split, RemoteSnapshotProjector both wrote the contact-snapshot
// projection AND saved channel.remotes_synced itself, which the projector's
// own docblock flagged but never fixed. This handler now owns the
// event-raising half: it calls projector.SyncContactSnapshot DIRECTLY (a
// plain Go call — not mediator dispatch) so phase 1's rows are GUARANTEED to
// have landed before channel.remotes_synced is raised. A second handler
// merely SUBSCRIBED to channel.gateway.sync_complete alongside the projector
// was rejected for exactly this reason: the mediator's fan-out runs
// registered handlers in registration order but gives no ordering guarantee
// against work a sibling handler kicks off itself — only a direct call pins
// "phase 1 committed" strictly before "completion event raised".
//
// channel.remotes_synced (raised here, once SyncContactSnapshot returns) is
// the completion signal: summary counts that let consumers invalidate a
// cache. The pre-existing RemotesSyncedIntegrationHandler
// (handlers/remotes_synced_handler.go, unchanged) republishes it as the
// integration event integration.channel.remotes_synced, which
// packages/api/typescript/src/ui/handlers/ConsumeChannelRemotesSynced.ts
// depends on to invalidate the sidebar.
//
// A channel absent from the pool (disconnected/removed between the fact
// firing and this dispatch) makes SyncContactSnapshot return a nil result —
// this handler treats that as a no-op, exactly as the projector did before
// the split: no completion event without phase 1 rows to summarize.
// ──────────────────────────────────────────────────────────────────────────────

type RemoteSnapshotSyncedHandler struct {
	projector       *projectors.RemoteSnapshotProjector
	domainEventRepo repositories.DomainEventRepository
}

func NewRemoteSnapshotSyncedHandler(
	projector *projectors.RemoteSnapshotProjector,
	repo repositories.DomainEventRepository,
) *RemoteSnapshotSyncedHandler {
	return &RemoteSnapshotSyncedHandler{projector: projector, domainEventRepo: repo}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*RemoteSnapshotSyncedHandler)(nil)

func (h *RemoteSnapshotSyncedHandler) EventName() string {
	return ctxevents.GatewaySyncCompleteEventName
}

func (h *RemoteSnapshotSyncedHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	result, err := h.projector.SyncContactSnapshot(ctx, event)
	if err != nil {
		return err
	}
	if result == nil {
		// Channel not in the pool — SyncContactSnapshot already logged it;
		// nothing landed, so there is nothing to summarize.
		return nil
	}

	summaryEvt := ctxevents.NewRemotesSyncedEvent(result.ChannelID, result.OwnerID, ctxevents.ChannelRemotesSyncedPayload{
		ChannelID: result.ChannelID,
		OwnerID:   result.OwnerID,
		Total:     result.Total,
		Inserted:  result.Inserted,
	})
	if err := h.domainEventRepo.Save(ctx, summaryEvt); err != nil {
		slog.Warn("remote snapshot: failed to save remotes_synced event",
			"channelId", result.ChannelID, "error", err)
	}
	return nil
}
