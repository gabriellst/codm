// CONTEXT-ORIGIN: medscall/software/monorepo/packages/channel@ff66dbb1ee0fcd6212e5bf68879fa1d5a0a9cd1b (2026-07-20)
// Source path: packages/channel/internal/channel/handlers/channel_connected_handler.go
// Harvested verbatim for the handler skill exemplar set — do not edit; re-harvest instead.
package handlers

import (
	"context"
	"fmt"
	"log/slog"
	"monorepo/api/internal/channel/entities"
	ctxevents "monorepo/api/internal/channel/events"
	channelrepo "monorepo/api/internal/channel/repositories/channel"
	"monorepo/api/internal/channel/services/registry"
	sharedevents "monorepo/api/internal/shared/events"
	repositories "monorepo/api/internal/shared/repositories"
	"monorepo/api/internal/shared/services/mediator"
	"monorepo/api/internal/shared/services/unitofwork"
	"monorepo/api/internal/shared/types"
)

type ChannelConnectedHandler struct {
	repo             channelrepo.ChannelRepository
	registry         registry.ChannelRegistry
	domainEventRepo  repositories.DomainEventRepository
	externalMediator mediator.ExternalMediator
	uow              unitofwork.UnitOfWork
}

func NewChannelConnectedHandler(
	repo channelrepo.ChannelRepository,
	reg registry.ChannelRegistry,
	domainEventRepo repositories.DomainEventRepository,
	ext mediator.ExternalMediator,
	uow unitofwork.UnitOfWork,
) *ChannelConnectedHandler {
	return &ChannelConnectedHandler{
		repo:             repo,
		registry:         reg,
		domainEventRepo:  domainEventRepo,
		externalMediator: ext,
		uow:              uow,
	}
}

func (h *ChannelConnectedHandler) EventName() string {
	return ctxevents.GatewayConnectedEventName
}

func (h *ChannelConnectedHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.GatewayConnectedPayload](event)
	if err != nil {
		return err
	}

	// DB work: all inside transaction
	var inst *entities.Channel
	err = h.uow.Execute(ctx, func(txCtx context.Context) error {
		var err error
		inst, err = h.repo.Find(txCtx, e.Payload.ChannelID.String())
		if err != nil {
			return err
		}
		if inst == nil {
			return fmt.Errorf("channel %s not found", e.Payload.ChannelID)
		}

		// Resolve ownerRemoteID: prefer live registry (has latest JID), fall back to
		// the value already persisted in the DB (handles startup race).
		ownerRemoteID := inst.OwnerRemoteID
		if ch, ok := h.registry.Get(e.Payload.ChannelID); ok {
			ownerRemoteID = ch.GetOwnerRemoteID()
		} else {
			slog.Warn("channel_connected: channel not in registry, falling back to persisted ownerRemoteID",
				"channelId", e.Payload.ChannelID,
			)
		}

		inst.SetConnected(ownerRemoteID)
		if err := h.repo.Save(txCtx, inst); err != nil {
			slog.Error("failed to update instance on connect", "error", err)
			return err
		}

		for _, evt := range inst.PullDomainEvents() {
			if err := h.domainEventRepo.Save(txCtx, evt); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}

	// Publish integration event AFTER transaction commits
	if inst != nil {
		h.externalMediator.Publish(ctx, sharedevents.NewChannelConnectedEvent(inst.OwnerID, e.Payload))
	}

	return nil
}
