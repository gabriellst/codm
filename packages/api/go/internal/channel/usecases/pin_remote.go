package usecases

import (
	"context"
	"time"

	remoteevents "template/api-go/internal/channel/events"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	"template/api-go/internal/channel/services/registry"
	"template/api-go/internal/channel/utils"
	sharedrepos "template/core-go/repositories"
	"template/core-go/services/unitofwork"
	"template/core-go/types"
)

// PinRemoteInput carries the identifiers needed to pin a remote. OwnerID is
// injected by the controller from the X-Owner-Id header.
type PinRemoteInput struct {
	ChannelID string `validate:"required,uuid"`
	RemoteID  string `validate:"required"`
	OwnerID   string `validate:"required,uuid"`
}

type PinRemoteOutput struct{}

// PinRemoteHandler is a thin command handler: it resolves the live gateway,
// pushes the pin app-state patch, and records the domain event. It does NOT
// project into a satellite entity — state lives in `shared.events` and is
// consumed by BFF queries.
type PinRemoteHandler struct {
	channelRepo     channelrepo.ChannelRepository
	registry        registry.ChannelRegistry
	domainEventRepo sharedrepos.DomainEventRepository
	uow             unitofwork.UnitOfWork
}

func NewPinRemoteHandler(
	channelRepo channelrepo.ChannelRepository,
	reg registry.ChannelRegistry,
	domainEventRepo sharedrepos.DomainEventRepository,
	uow unitofwork.UnitOfWork,
) *PinRemoteHandler {
	return &PinRemoteHandler{channelRepo: channelRepo, registry: reg, domainEventRepo: domainEventRepo, uow: uow}
}

func (h *PinRemoteHandler) Name() string { return "pin_remote" }

func (h *PinRemoteHandler) Execute(ctx context.Context, input PinRemoteInput) (PinRemoteOutput, error) {
	channelID, live, ownerID, err := utils.ResolveActiveChannel(ctx, input.ChannelID, h.channelRepo, h.registry)
	if err != nil {
		return PinRemoteOutput{}, err
	}

	if err := live.PinChat(ctx, input.RemoteID, true); err != nil {
		return PinRemoteOutput{}, err
	}

	event := remoteevents.NewRemotePinnedEvent(channelID, ownerID, remoteevents.ChannelRemotePinnedPayload{
		ChannelID: channelID,
		RemoteID:  input.RemoteID,
		At:        time.Now().UTC(),
		OwnerID:   ownerID,
	})
	err = h.uow.Execute(ctx, func(txCtx context.Context) error {
		return h.domainEventRepo.SaveAll(txCtx, []types.DomainEventI{event})
	})
	if err != nil {
		return PinRemoteOutput{}, err
	}

	return PinRemoteOutput{}, nil
}
