package usecases

import (
	"context"

	"github.com/google/uuid"

	"template/api-go/internal/channel/projections"
	"template/api-go/internal/channel/services/registry"
	"template/contracts-go/wire"
	"template/core-go/errors"
)

type LogoutChannelInput struct {
	ChannelID string
}

type LogoutChannelOutput struct {
	ChannelID string `json:"channelId"`
	Status    string `json:"status"`
}

type LogoutChannelHandler struct {
	registry registry.ChannelRegistry
	repo     projections.ChannelProjectionRepository
}

func NewLogoutChannelHandler(
	reg registry.ChannelRegistry,
	repo projections.ChannelProjectionRepository,
) *LogoutChannelHandler {
	return &LogoutChannelHandler{registry: reg, repo: repo}
}

func (h *LogoutChannelHandler) Name() string { return "LogoutChannel" }

func (h *LogoutChannelHandler) Execute(ctx context.Context, input LogoutChannelInput) (LogoutChannelOutput, error) {
	channelID, err := uuid.Parse(input.ChannelID)
	if err != nil {
		return LogoutChannelOutput{}, errors.NewBaseError(errors.CodeBadRequest, "invalid channelId")
	}

	if ch, ok := h.registry.Get(channelID); ok {
		_ = ch.Logout(ctx)
		h.registry.Remove(channelID)
	}

	if err := h.repo.SetStatus(ctx, channelID.String(), wire.ChannelStatusDISCONNECTED, ""); err != nil {
		return LogoutChannelOutput{}, err
	}

	return LogoutChannelOutput{ChannelID: channelID.String(), Status: string(wire.ChannelStatusDISCONNECTED)}, nil
}
