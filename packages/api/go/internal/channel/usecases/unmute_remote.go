package usecases

import (
	"context"
	"time"

	remoteevents "template/api-go/internal/channel/events"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	"template/api-go/internal/channel/services/registry"
	"template/api-go/internal/channel/utils"
	sharedrepos "template/api-go/internal/shared/repositories"
	"template/api-go/internal/shared/types"
)

type UnmuteRemoteInput struct {
	ChannelID string `validate:"required,uuid"`
	RemoteID  string `validate:"required"`
	OwnerID   string `validate:"required,uuid"`
}

type UnmuteRemoteOutput struct{}

type UnmuteRemoteHandler struct {
	channelRepo     channelrepo.ChannelRepository
	registry        registry.ChannelRegistry
	domainEventRepo sharedrepos.DomainEventRepository
}

func NewUnmuteRemoteHandler(
	channelRepo channelrepo.ChannelRepository,
	reg registry.ChannelRegistry,
	domainEventRepo sharedrepos.DomainEventRepository,
) *UnmuteRemoteHandler {
	return &UnmuteRemoteHandler{channelRepo: channelRepo, registry: reg, domainEventRepo: domainEventRepo}
}

func (h *UnmuteRemoteHandler) Name() string { return "unmute_remote" }

func (h *UnmuteRemoteHandler) Execute(ctx context.Context, input UnmuteRemoteInput) (UnmuteRemoteOutput, error) {
	channelID, live, ownerID, err := utils.ResolveActiveChannel(ctx, input.ChannelID, h.channelRepo, h.registry)
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
	if err := h.domainEventRepo.SaveAll(ctx, []types.DomainEventI{event}); err != nil {
		return UnmuteRemoteOutput{}, err
	}

	return UnmuteRemoteOutput{}, nil
}
