package usecases

import (
	"context"
	"log/slog"
	"time"

	remoteevents "template/api-go/internal/channel/events"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	"template/api-go/internal/channel/services/registry"
	"template/api-go/internal/channel/utils"
	sharedrepos "template/api-go/internal/shared/repositories"
	"template/api-go/internal/shared/types"
)

type MarkRemoteAsSeenInput struct {
	ChannelID string `validate:"required,uuid"`
	RemoteID  string `validate:"required"`
	OwnerID   string `validate:"required,uuid"`
}

type MarkRemoteAsSeenOutput struct{}

// MarkRemoteAsSeenHandler closes the unread watermark for a remote. It emits
// the `channel.remote_chat_seen` domain event locally in addition to pushing
// the app-state patch to WhatsApp so the BFF sidebar reflects the "seen" state
// immediately, without waiting for the echo from the gateway.
type MarkRemoteAsSeenHandler struct {
	channelRepo     channelrepo.ChannelRepository
	registry        registry.ChannelRegistry
	domainEventRepo sharedrepos.DomainEventRepository
}

func NewMarkRemoteAsSeenHandler(
	channelRepo channelrepo.ChannelRepository,
	reg registry.ChannelRegistry,
	domainEventRepo sharedrepos.DomainEventRepository,
) *MarkRemoteAsSeenHandler {
	return &MarkRemoteAsSeenHandler{channelRepo: channelRepo, registry: reg, domainEventRepo: domainEventRepo}
}

func (h *MarkRemoteAsSeenHandler) Name() string { return "MarkRemoteAsSeen" }

func (h *MarkRemoteAsSeenHandler) Execute(ctx context.Context, input MarkRemoteAsSeenInput) (MarkRemoteAsSeenOutput, error) {
	channelID, live, ownerID, err := utils.ResolveActiveChannel(ctx, input.ChannelID, h.channelRepo, h.registry)
	if err != nil {
		return MarkRemoteAsSeenOutput{}, err
	}

	if err := live.MarkChatRead(ctx, input.RemoteID, true); err != nil {
		return MarkRemoteAsSeenOutput{}, err
	}

	event := remoteevents.NewRemoteChatSeenEvent(channelID, ownerID, remoteevents.ChannelRemoteChatSeenPayload{
		ChannelID: channelID,
		RemoteID:  input.RemoteID,
		At:        time.Now().UTC(),
		OwnerID:   ownerID,
	})
	if err := h.domainEventRepo.SaveAll(ctx, []types.DomainEventI{event}); err != nil {
		slog.Error("mark_remote_as_seen: save domain event failed",
			"channelId", input.ChannelID,
			"remoteId", input.RemoteID,
			"error", err,
		)
		return MarkRemoteAsSeenOutput{}, err
	}

	return MarkRemoteAsSeenOutput{}, nil
}
