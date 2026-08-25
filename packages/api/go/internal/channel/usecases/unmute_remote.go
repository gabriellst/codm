package usecases

import (
	"context"
	"time"

	remoteevents "template/api-go/internal/channel/events"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	"template/api-go/internal/channel/services/pool"
	sharedrepos "template/core-go/repositories"
	"template/core-go/services/unitofwork"
	"template/core-go/types"
)

type UnmuteRemoteInput struct {
	ChannelID string `validate:"required,uuid"`
	RemoteID  string `validate:"required"`
	OwnerID   string `validate:"required,uuid"`
}

type UnmuteRemoteOutput struct{}

type UnmuteRemoteHandler struct {
	channelRepo     channelrepo.ChannelRepository
	pool            pool.ChannelPool
	domainEventRepo sharedrepos.DomainEventRepository
	uow             unitofwork.UnitOfWork
}

func NewUnmuteRemoteHandler(
	channelRepo channelrepo.ChannelRepository,
	pool pool.ChannelPool,
	domainEventRepo sharedrepos.DomainEventRepository,
	uow unitofwork.UnitOfWork,
) *UnmuteRemoteHandler {
	return &UnmuteRemoteHandler{channelRepo: channelRepo, pool: pool, domainEventRepo: domainEventRepo, uow: uow}
}

func (h *UnmuteRemoteHandler) Name() string { return "unmute_remote" }

func (h *UnmuteRemoteHandler) Execute(ctx context.Context, input UnmuteRemoteInput) (UnmuteRemoteOutput, error) {
	channelID, live, ownerID, err := ResolveActiveChannel(ctx, input.ChannelID, h.channelRepo, h.pool)
	if err != nil {
		return UnmuteRemoteOutput{}, err
	}

	if err := live.MuteChat(ctx, input.RemoteID, false, 0); err != nil {
		return UnmuteRemoteOutput{}, err
	}

	event := remoteevents.NewRemoteUnmutedEvent(channelID, ownerID, remoteevents.ChannelRemoteUnmutedPayload{
		ChannelID: channelID,
		RemoteID:  input.RemoteID,
		At:        time.Now().UTC(),
		OwnerID:   ownerID,
	})
	err = h.uow.Execute(ctx, func(txCtx context.Context) error {
		return h.domainEventRepo.SaveAll(txCtx, []types.DomainEventI{event})
	})
	if err != nil {
		return UnmuteRemoteOutput{}, err
	}

	return UnmuteRemoteOutput{}, nil
}
