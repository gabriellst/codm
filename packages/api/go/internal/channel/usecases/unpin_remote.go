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
}

func NewUnpinRemoteHandler(
	channelRepo channelrepo.ChannelRepository,
	reg registry.ChannelRegistry,
	domainEventRepo sharedrepos.DomainEventRepository,
) *UnpinRemoteHandler {
	return &UnpinRemoteHandler{channelRepo: channelRepo, registry: reg, domainEventRepo: domainEventRepo}
}

func (h *UnpinRemoteHandler) Name() string { return "UnpinRemote" }

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
	if err := h.domainEventRepo.SaveAll(ctx, []types.DomainEventI{event}); err != nil {
		return UnpinRemoteOutput{}, err
	}

	return UnpinRemoteOutput{}, nil
}
