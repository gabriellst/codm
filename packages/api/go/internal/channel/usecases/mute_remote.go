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

// MuteRemoteInput captures the mute parameters. MuteExpiration is an absolute
// UnixMilli timestamp — 0 (or negative) means "mute forever".
type MuteRemoteInput struct {
	ChannelID      string `validate:"required,uuid"`
	RemoteID       string `validate:"required"`
	OwnerID        string `validate:"required,uuid"`
	MuteExpiration int64  // absolute unix-milli; 0 or negative = forever
}

type MuteRemoteOutput struct{}

type MuteRemoteHandler struct {
	channelRepo     channelrepo.ChannelRepository
	pool            pool.ChannelPool
	domainEventRepo sharedrepos.DomainEventRepository
	uow             unitofwork.UnitOfWork
}

func NewMuteRemoteHandler(
	channelRepo channelrepo.ChannelRepository,
	pool pool.ChannelPool,
	domainEventRepo sharedrepos.DomainEventRepository,
	uow unitofwork.UnitOfWork,
) *MuteRemoteHandler {
	return &MuteRemoteHandler{channelRepo: channelRepo, pool: pool, domainEventRepo: domainEventRepo, uow: uow}
}

func (h *MuteRemoteHandler) Name() string { return "mute_remote" }

func (h *MuteRemoteHandler) Execute(ctx context.Context, input MuteRemoteInput) (MuteRemoteOutput, error) {
	channelID, live, ownerID, err := ResolveActiveChannel(ctx, input.ChannelID, h.channelRepo, h.pool)
	if err != nil {
		return MuteRemoteOutput{}, err
	}

	if err := live.MuteChat(ctx, input.RemoteID, true, input.MuteExpiration); err != nil {
		return MuteRemoteOutput{}, err
	}

	var mutedUntil *time.Time
	if input.MuteExpiration > 0 {
		t := time.UnixMilli(input.MuteExpiration).UTC()
		mutedUntil = &t
	}

	event := remoteevents.NewRemoteMutedEvent(channelID, ownerID, remoteevents.ChannelRemoteMutedPayload{
		ChannelID:  channelID,
		RemoteID:   input.RemoteID,
		At:         time.Now().UTC(),
		MutedUntil: mutedUntil,
		OwnerID:    ownerID,
	})
	err = h.uow.Execute(ctx, func(txCtx context.Context) error {
		return h.domainEventRepo.SaveAll(txCtx, []types.DomainEventI{event})
	})
	if err != nil {
		return MuteRemoteOutput{}, err
	}

	return MuteRemoteOutput{}, nil
}
