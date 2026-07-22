package usecases

import (
	"context"
	"template/api-go/internal/channel/enums"
	channelerrors "template/api-go/internal/channel/errors"
	msgerrors "template/api-go/internal/channel/errors"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	"template/api-go/internal/channel/services/registry"
	"template/api-go/internal/shared/errors"
)

type CheckIsOnPlatformInput struct {
	ChannelID   string   `validate:"required,uuid"`
	Identifiers []string `validate:"required,min=1"`
}

type ContactCheck struct {
	Identifier   string `json:"identifier" example:"5511999999999"`
	IsOnPlatform bool   `json:"isOnPlatform" example:"true"`
	PlatformID   string `json:"platformId" example:"5511999999999@s.whatsapp.net"`
}

type CheckIsOnPlatformOutput struct {
	Results []ContactCheck `json:"results"`
}

type CheckIsOnPlatformHandler struct {
	integrationRepo channelrepo.ChannelRepository
	registry        registry.ChannelRegistry
}

func NewCheckIsOnPlatformHandler(
	integrationRepo channelrepo.ChannelRepository,
	registry registry.ChannelRegistry,
) *CheckIsOnPlatformHandler {
	return &CheckIsOnPlatformHandler{
		integrationRepo: integrationRepo,
		registry:        registry,
	}
}

func (h *CheckIsOnPlatformHandler) Name() string { return "CheckIsOnPlatform" }

func (h *CheckIsOnPlatformHandler) Execute(ctx context.Context, input CheckIsOnPlatformInput) (CheckIsOnPlatformOutput, error) {
	if len(input.Identifiers) == 0 {
		return CheckIsOnPlatformOutput{}, errors.NewBaseError(msgerrors.CodeEmptyNumberList, "identifiers list cannot be empty")
	}

	instance, err := h.integrationRepo.Find(ctx, input.ChannelID)
	if err != nil {
		return CheckIsOnPlatformOutput{}, err
	}
	if instance == nil {
		return CheckIsOnPlatformOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotFound, "instance not found")
	}
	if instance.Status != enums.ChannelStatusConnected {
		return CheckIsOnPlatformOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "instance is not connected")
	}

	ch, ok := h.registry.Get(instance.ID.UUID())
	if !ok {
		return CheckIsOnPlatformOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "instance channel not available")
	}

	validations, err := ch.CheckIsOnPlatform(ctx, input.Identifiers)
	if err != nil {
		return CheckIsOnPlatformOutput{}, err
	}

	results := make([]ContactCheck, len(validations))
	for i, v := range validations {
		results[i] = ContactCheck{
			Identifier:   v.Identifier,
			IsOnPlatform: v.IsOnPlatform,
			PlatformID:   v.PlatformID,
		}
	}

	return CheckIsOnPlatformOutput{
		Results: results,
	}, nil
}
