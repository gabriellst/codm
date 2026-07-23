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
	"template/api-go/internal/shared/types"
)

type MarkRemoteAsUnreadInput struct {
	ChannelID string `validate:"required,uuid"`
	RemoteID  string `validate:"required"`
	OwnerID   string `validate:"required,uuid"`
}

type MarkRemoteAsUnreadOutput struct{}

type MarkRemoteAsUnreadHandler struct {
	channelRepo     channelrepo.ChannelRepository
	registry        registry.ChannelRegistry
	domainEventRepo sharedrepos.DomainEventRepository
	uow             unitofwork.UnitOfWork
}

func NewMarkRemoteAsUnreadHandler(
	channelRepo channelrepo.ChannelRepository,
	reg registry.ChannelRegistry,
	domainEventRepo sharedrepos.DomainEventRepository,
	uow unitofwork.UnitOfWork,
) *MarkRemoteAsUnreadHandler {
	return &MarkRemoteAsUnreadHandler{channelRepo: channelRepo, registry: reg, domainEventRepo: domainEventRepo, uow: uow}
}

func (h *MarkRemoteAsUnreadHandler) Name() string { return "mark_remote_as_unread" }

func (h *MarkRemoteAsUnreadHandler) Execute(ctx context.Context, input MarkRemoteAsUnreadInput) (MarkRemoteAsUnreadOutput, error) {
	channelID, live, ownerID, err := utils.ResolveActiveChannel(ctx, input.ChannelID, h.channelRepo, h.registry)
	if err != nil {
		return MarkRemoteAsUnreadOutput{}, err
	}

	if err := live.MarkChatRead(ctx, input.RemoteID, false); err != nil {
		return MarkRemoteAsUnreadOutput{}, err
	}

	event := remoteevents.NewRemoteMarkedAsUnreadEvent(channelID, ownerID, remoteevents.ChannelRemoteMarkedAsUnreadPayload{
		ChannelID: channelID,
		RemoteID:  input.RemoteID,
		At:        time.Now().UTC(),
		OwnerID:   ownerID,
	})
	err = h.uow.Execute(ctx, func(txCtx context.Context) error {
		return h.domainEventRepo.SaveAll(txCtx, []types.DomainEventI{event})
	})
	if err != nil {
		return MarkRemoteAsUnreadOutput{}, err
	}

	return MarkRemoteAsUnreadOutput{}, nil
}
