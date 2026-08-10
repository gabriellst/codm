package usecases

import (
	"context"
	"time"

	remoteevents "template/api-go/internal/channel/events"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	"template/api-go/internal/channel/services/pool"
	"template/api-go/internal/channel/utils"
	sharedrepos "template/core-go/repositories"
	"template/core-go/services/unitofwork"
	"template/core-go/types"
)

type UnarchiveRemoteInput struct {
	ChannelID string `validate:"required,uuid"`
	RemoteID  string `validate:"required"`
	OwnerID   string `validate:"required,uuid"`
}

type UnarchiveRemoteOutput struct{}

type UnarchiveRemoteHandler struct {
	channelRepo     channelrepo.ChannelRepository
	pool            pool.ChannelPool
	domainEventRepo sharedrepos.DomainEventRepository
	uow             unitofwork.UnitOfWork
}

func NewUnarchiveRemoteHandler(
	channelRepo channelrepo.ChannelRepository,
	pool pool.ChannelPool,
	domainEventRepo sharedrepos.DomainEventRepository,
	uow unitofwork.UnitOfWork,
) *UnarchiveRemoteHandler {
	return &UnarchiveRemoteHandler{channelRepo: channelRepo, pool: pool, domainEventRepo: domainEventRepo, uow: uow}
}

func (h *UnarchiveRemoteHandler) Name() string { return "unarchive_remote" }

func (h *UnarchiveRemoteHandler) Execute(ctx context.Context, input UnarchiveRemoteInput) (UnarchiveRemoteOutput, error) {
	channelID, live, ownerID, err := utils.ResolveActiveChannel(ctx, input.ChannelID, h.channelRepo, h.pool)
	if err != nil {
		return UnarchiveRemoteOutput{}, err
	}

	if err := live.ArchiveChat(ctx, input.RemoteID, false); err != nil {
		return UnarchiveRemoteOutput{}, err
	}

	event := remoteevents.NewRemoteUnarchivedEvent(channelID, ownerID, remoteevents.ChannelRemoteUnarchivedPayload{
		ChannelID: channelID,
		RemoteID:  input.RemoteID,
		At:        time.Now().UTC(),
		OwnerID:   ownerID,
	})
	err = h.uow.Execute(ctx, func(txCtx context.Context) error {
		return h.domainEventRepo.SaveAll(txCtx, []types.DomainEventI{event})
	})
	if err != nil {
		return UnarchiveRemoteOutput{}, err
	}

	return UnarchiveRemoteOutput{}, nil
}
