package handlers

import (
	"context"
	"fmt"
	"log/slog"
	"template/api-go/internal/channel/entities"
	ctxevents "template/api-go/internal/channel/events"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	sharedevents "template/api-go/internal/shared/events"
	"template/api-go/internal/shared/services/mediator"
	"template/api-go/internal/shared/services/unitofwork"
	"template/api-go/internal/shared/types"
)

type ChannelLoggedOutHandler struct {
	repo             channelrepo.ChannelRepository
	externalMediator mediator.ExternalMediator
	uow              unitofwork.UnitOfWork
}

func NewChannelLoggedOutHandler(
	repo channelrepo.ChannelRepository,
	ext mediator.ExternalMediator,
	uow unitofwork.UnitOfWork,
) *ChannelLoggedOutHandler {
	return &ChannelLoggedOutHandler{
		repo:             repo,
		externalMediator: ext,
		uow:              uow,
	}
}

func (h *ChannelLoggedOutHandler) EventName() string {
	return ctxevents.GatewayLoggedOutEventName
}

func (h *ChannelLoggedOutHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelLoggedOutPayload](event)
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
			slog.Error("failed to update instance on logout", "error", err)
			return err
		}

		return nil
	})
	if err != nil {
		return err
	}

	// Publish integration event AFTER transaction commits
	if inst != nil {
		if err := h.externalMediator.Publish(ctx, sharedevents.NewChannelLoggedOutEvent(inst.OwnerID, e.Payload)); err != nil {
			slog.Error("failed to publish channel logged out integration event", "channelId", e.Payload.ChannelID, "error", err)
		}
	}

	return nil
}
