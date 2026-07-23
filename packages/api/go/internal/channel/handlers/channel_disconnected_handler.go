package handlers

import (
	"context"
	"fmt"
	"log/slog"
	"template/api-go/internal/channel/entities"
	ctxevents "template/api-go/internal/channel/events"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	sharedevents "template/api-go/internal/shared/events"
	"template/core-go/services/mediator"
	"template/core-go/services/unitofwork"
	"template/core-go/types"
)

type ChannelDisconnectedHandler struct {
	repo             channelrepo.ChannelRepository
	externalMediator mediator.ExternalMediator
	uow              unitofwork.UnitOfWork
}

func NewChannelDisconnectedHandler(
	repo channelrepo.ChannelRepository,
	ext mediator.ExternalMediator,
	uow unitofwork.UnitOfWork,
) *ChannelDisconnectedHandler {
	return &ChannelDisconnectedHandler{
		repo:             repo,
		externalMediator: ext,
		uow:              uow,
	}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*ChannelDisconnectedHandler)(nil)

func (h *ChannelDisconnectedHandler) EventName() string {
	return ctxevents.GatewayDisconnectedEventName
}

func (h *ChannelDisconnectedHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.GatewayDisconnectedPayload](event)
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

		inst.SetDisconnected()
		if err := h.repo.Save(txCtx, inst); err != nil {
			slog.Error("failed to update instance on disconnect", "error", err)
			return err
		}

		return nil
	})
	if err != nil {
		return err
	}

	// Publish integration event AFTER transaction commits
	if inst != nil {
		if err := h.externalMediator.Publish(ctx, sharedevents.NewChannelDisconnectedEvent(inst.OwnerID, e.Payload)); err != nil {
			slog.Error("failed to publish channel disconnected integration event", "channelId", e.Payload.ChannelID, "error", err)
		}
	}

	return nil
}
