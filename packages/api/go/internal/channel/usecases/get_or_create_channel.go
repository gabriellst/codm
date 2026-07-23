package usecases

import (
	"context"
	"fmt"
	"time"

	"strings"
	"template/api-go/internal/channel/entities"
	"template/api-go/internal/channel/enums"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	"template/api-go/internal/shared/services/unitofwork"
)

type GetOrCreateChannelInput struct {
	Platform enums.Platform `validate:"required,oneof=WHATSAPP" json:"platform"`
	OwnerID  string         `validate:"required"`
}

type GetOrCreateChannelOutput struct {
	ID            string              `json:"id" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	Name          string              `json:"name" example:"whatsapp-default"`
	Platform      enums.Platform      `json:"platform" example:"WHATSAPP"`
	OwnerRemoteID string              `json:"ownerRemoteId" example:""`
	Status        enums.ChannelStatus `json:"status" example:"CREATED"`
	CreatedAt     string              `json:"createdAt" format:"date-time" example:"2026-02-19T10:30:00Z"`
	Created       bool                `json:"created" example:"false"`
}

type GetOrCreateChannelHandler struct {
	repo channelrepo.ChannelRepository
	uow  unitofwork.UnitOfWork
}

func NewGetOrCreateChannelHandler(
	repo channelrepo.ChannelRepository,
	uow unitofwork.UnitOfWork,
) *GetOrCreateChannelHandler {
	return &GetOrCreateChannelHandler{repo: repo, uow: uow}
}

func (h *GetOrCreateChannelHandler) Name() string { return "get_or_create_channel" }

func (h *GetOrCreateChannelHandler) Execute(ctx context.Context, input GetOrCreateChannelInput) (GetOrCreateChannelOutput, error) {
	existing, err := h.repo.FindByOwnerAndPlatform(ctx, input.OwnerID, string(input.Platform))
	if err != nil {
		return GetOrCreateChannelOutput{}, err
	}
	if existing != nil {
		return GetOrCreateChannelOutput{
			ID:            existing.ID.String(),
			Name:          existing.Name,
			Platform:      existing.Platform,
			OwnerRemoteID: existing.OwnerRemoteID,
			Status:        existing.Status,
			CreatedAt:     existing.CreatedAt.UTC().Format(time.RFC3339),
			Created:       false,
		}, nil
	}

	suffix := input.OwnerID
	if len(suffix) > 8 {
		suffix = suffix[:8]
	}
	defaultName := fmt.Sprintf("%s-%s", strings.ToLower(string(input.Platform)), suffix)

	integration, err := entities.NewChannel(entities.NewChannelParams{
		Name:     defaultName,
		Platform: input.Platform,
		OwnerID:  input.OwnerID,
	})
	if err != nil {
		return GetOrCreateChannelOutput{}, err
	}

	err = h.uow.Execute(ctx, func(txCtx context.Context) error {
		return h.repo.Save(txCtx, integration)
	})
	if err != nil {
		return GetOrCreateChannelOutput{}, err
	}

	return GetOrCreateChannelOutput{
		ID:            integration.ID.String(),
		Name:          integration.Name,
		Platform:      integration.Platform,
		OwnerRemoteID: integration.OwnerRemoteID,
		Status:        integration.Status,
		CreatedAt:     integration.CreatedAt.UTC().Format(time.RFC3339),
		Created:       true,
	}, nil
}
