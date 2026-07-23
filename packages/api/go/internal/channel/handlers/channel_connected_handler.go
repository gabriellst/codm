package handlers

import (
	"context"
	"fmt"
	"log/slog"
	"template/api-go/internal/channel/entities"
	ctxevents "template/api-go/internal/channel/events"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	"template/api-go/internal/channel/services/registry"
	sharedevents "template/api-go/internal/shared/events"
	"template/api-go/internal/shared/services/mediator"
	"template/api-go/internal/shared/services/unitofwork"
	"template/api-go/internal/shared/types"
)

type ChannelConnectedHandler struct {
	repo             channelrepo.ChannelRepository
	registry         registry.ChannelRegistry
	externalMediator mediator.ExternalMediator
	uow              unitofwork.UnitOfWork
}

func NewChannelConnectedHandler(
	repo channelrepo.ChannelRepository,
	reg registry.ChannelRegistry,
	ext mediator.ExternalMediator,
	uow unitofwork.UnitOfWork,
) *ChannelConnectedHandler {
	return &ChannelConnectedHandler{
		repo:             repo,
		registry:         reg,
		externalMediator: ext,
		uow:              uow,
	}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*ChannelConnectedHandler)(nil)

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

		return nil
	})
	if err != nil {
		return err
	}

	// Publish integration event AFTER transaction commits
	if inst != nil {
		if err := h.externalMediator.Publish(ctx, sharedevents.NewChannelConnectedEvent(inst.OwnerID, e.Payload)); err != nil {
			slog.Error("failed to publish channel connected integration event", "channelId", e.Payload.ChannelID, "error", err)
		}
	}

	return nil
}
