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
}

func NewMarkRemoteAsUnreadHandler(
	channelRepo channelrepo.ChannelRepository,
	reg registry.ChannelRegistry,
	domainEventRepo sharedrepos.DomainEventRepository,
) *MarkRemoteAsUnreadHandler {
	return &MarkRemoteAsUnreadHandler{channelRepo: channelRepo, registry: reg, domainEventRepo: domainEventRepo}
}

func (h *MarkRemoteAsUnreadHandler) Name() string { return "MarkRemoteAsUnread" }

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
	if err := h.domainEventRepo.SaveAll(ctx, []types.DomainEventI{event}); err != nil {
		return MarkRemoteAsUnreadOutput{}, err
	}

	return MarkRemoteAsUnreadOutput{}, nil
}
