package usecases

import (
	"context"
	"time"

	remoteevents "template/api-go/internal/channel/events"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	"template/api-go/internal/channel/services/registry"
	"template/api-go/internal/channel/utils"
	sharedrepos "template/api-go/internal/shared/repositories"
	"template/api-go/internal/shared/services/unitofwork"
	"template/core-go/types"
)

type UnpinRemoteInput struct {
	ChannelID string `validate:"required,uuid"`
	RemoteID  string `validate:"required"`
	OwnerID   string `validate:"required,uuid"`
}

type UnpinRemoteOutput struct{}

type UnpinRemoteHandler struct {
	channelRepo     channelrepo.ChannelRepository
	registry        registry.ChannelRegistry
	domainEventRepo sharedrepos.DomainEventRepository
	uow             unitofwork.UnitOfWork
}

func NewUnpinRemoteHandler(
	channelRepo channelrepo.ChannelRepository,
	reg registry.ChannelRegistry,
	domainEventRepo sharedrepos.DomainEventRepository,
	uow unitofwork.UnitOfWork,
) *UnpinRemoteHandler {
	return &UnpinRemoteHandler{channelRepo: channelRepo, registry: reg, domainEventRepo: domainEventRepo, uow: uow}
}

func (h *UnpinRemoteHandler) Name() string { return "unpin_remote" }

func (h *UnpinRemoteHandler) Execute(ctx context.Context, input UnpinRemoteInput) (UnpinRemoteOutput, error) {
	channelID, live, ownerID, err := utils.ResolveActiveChannel(ctx, input.ChannelID, h.channelRepo, h.registry)
	if err != nil {
		return UnpinRemoteOutput{}, err
	}

	if err := live.PinChat(ctx, input.RemoteID, false); err != nil {
		return UnpinRemoteOutput{}, err
	}

	event := remoteevents.NewRemoteUnpinnedEvent(channelID, ownerID, remoteevents.ChannelRemoteUnpinnedPayload{
		ChannelID: channelID,
		RemoteID:  input.RemoteID,
		At:        time.Now().UTC(),
		OwnerID:   ownerID,
	})
	err = h.uow.Execute(ctx, func(txCtx context.Context) error {
		return h.domainEventRepo.SaveAll(txCtx, []types.DomainEventI{event})
	})
	if err != nil {
		return UnpinRemoteOutput{}, err
	}

	return UnpinRemoteOutput{}, nil
}
