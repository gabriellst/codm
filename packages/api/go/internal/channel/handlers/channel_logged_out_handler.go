package handlers

import (
	"context"
	"fmt"
	"log/slog"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	ctxevents "template/api-go/internal/channel/events"
	"template/api-go/internal/channel/entities"
	sharedevents "template/api-go/internal/shared/events"
	repositories "template/api-go/internal/shared/repositories"
	"template/api-go/internal/shared/services/mediator"
	"template/api-go/internal/shared/services/unitofwork"
	"template/api-go/internal/shared/types"
)

type ChannelLoggedOutHandler struct {
	repo             channelrepo.ChannelRepository
	domainEventRepo  repositories.DomainEventRepository
	externalMediator mediator.ExternalMediator
	uow              unitofwork.UnitOfWork
}

func NewChannelLoggedOutHandler(
	repo channelrepo.ChannelRepository,
	domainEventRepo repositories.DomainEventRepository,
	ext mediator.ExternalMediator,
	uow unitofwork.UnitOfWork,
) *ChannelLoggedOutHandler {
	return &ChannelLoggedOutHandler{
		repo:             repo,
		domainEventRepo:  domainEventRepo,
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
		h.externalMediator.Publish(ctx, sharedevents.NewChannelLoggedOutEvent(inst.OwnerID, e.Payload))
	}

	return nil
}
