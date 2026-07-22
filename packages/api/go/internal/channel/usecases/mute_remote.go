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
	registry        registry.ChannelRegistry
	domainEventRepo sharedrepos.DomainEventRepository
}

func NewMuteRemoteHandler(
	channelRepo channelrepo.ChannelRepository,
	reg registry.ChannelRegistry,
	domainEventRepo sharedrepos.DomainEventRepository,
) *MuteRemoteHandler {
	return &MuteRemoteHandler{channelRepo: channelRepo, registry: reg, domainEventRepo: domainEventRepo}
}

func (h *MuteRemoteHandler) Name() string { return "MuteRemote" }

func (h *MuteRemoteHandler) Execute(ctx context.Context, input MuteRemoteInput) (MuteRemoteOutput, error) {
	channelID, live, ownerID, err := utils.ResolveActiveChannel(ctx, input.ChannelID, h.channelRepo, h.registry)
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
	if err := h.domainEventRepo.SaveAll(ctx, []types.DomainEventI{event}); err != nil {
		return MuteRemoteOutput{}, err
	}

	return MuteRemoteOutput{}, nil
}
