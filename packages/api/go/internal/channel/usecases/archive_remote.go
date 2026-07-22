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

type ArchiveRemoteInput struct {
	ChannelID string `validate:"required,uuid"`
	RemoteID  string `validate:"required"`
	OwnerID   string `validate:"required,uuid"`
}

type ArchiveRemoteOutput struct{}

type ArchiveRemoteHandler struct {
	channelRepo     channelrepo.ChannelRepository
	registry        registry.ChannelRegistry
	domainEventRepo sharedrepos.DomainEventRepository
}

func NewArchiveRemoteHandler(
	channelRepo channelrepo.ChannelRepository,
	reg registry.ChannelRegistry,
	domainEventRepo sharedrepos.DomainEventRepository,
) *ArchiveRemoteHandler {
	return &ArchiveRemoteHandler{channelRepo: channelRepo, registry: reg, domainEventRepo: domainEventRepo}
}

func (h *ArchiveRemoteHandler) Name() string { return "ArchiveRemote" }

func (h *ArchiveRemoteHandler) Execute(ctx context.Context, input ArchiveRemoteInput) (ArchiveRemoteOutput, error) {
	channelID, live, ownerID, err := utils.ResolveActiveChannel(ctx, input.ChannelID, h.channelRepo, h.registry)
	if err != nil {
		return ArchiveRemoteOutput{}, err
	}

	if err := live.ArchiveChat(ctx, input.RemoteID, true); err != nil {
		return ArchiveRemoteOutput{}, err
	}

	event := remoteevents.NewRemoteArchivedEvent(channelID, ownerID, remoteevents.ChannelRemoteArchivedPayload{
		ChannelID: channelID,
		RemoteID:  input.RemoteID,
		At:        time.Now().UTC(),
		OwnerID:   ownerID,
	})
	if err := h.domainEventRepo.SaveAll(ctx, []types.DomainEventI{event}); err != nil {
		return ArchiveRemoteOutput{}, err
	}

	return ArchiveRemoteOutput{}, nil
}
