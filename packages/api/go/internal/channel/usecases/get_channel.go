package usecases

import (
	"context"
	"encoding/json"
	"time"

	"template/api-go/internal/channel/enums"
	ctxerrors "template/api-go/internal/channel/errors"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	sharedenums "template/api-go/internal/shared/enums"
	"template/api-go/internal/shared/errors"
)

type GetChannelInput struct {
	ID string `validate:"required,uuid"`
}

type GetChannelOutput struct {
	ID            string               `json:"id" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	Name          string               `json:"name" example:"my-instance"`
	Platform      sharedenums.Platform `json:"platform" example:"WHATSAPP"`
	OwnerRemoteID string               `json:"ownerRemoteId" example:""`
	Credentials   json.RawMessage      `json:"credentials"`
	Status        enums.ChannelStatus  `json:"status" example:"CREATED"`
	CreatedAt     string               `json:"createdAt" format:"date-time" example:"2026-02-19T10:30:00Z"`
}

type GetChannelHandler struct {
	repo channelrepo.ChannelRepository
}

func NewGetChannelHandler(repo channelrepo.ChannelRepository) *GetChannelHandler {
	return &GetChannelHandler{repo: repo}
}

func (h *GetChannelHandler) Name() string { return "GetInstance" }

func (h *GetChannelHandler) Execute(ctx context.Context, input GetChannelInput) (GetChannelOutput, error) {
	instance, err := h.repo.Find(ctx, input.ID)
	if err != nil {
		return GetChannelOutput{}, err
	}
	if instance == nil {
		return GetChannelOutput{}, errors.NewBaseError(ctxerrors.CodeChannelNotFound, "instance not found")
	}

	return GetChannelOutput{
		ID:            instance.ID.String(),
		Name:          instance.Name,
		Platform:      instance.Platform,
		OwnerRemoteID: instance.OwnerRemoteID,
		Credentials:   instance.Credentials,
		Status:        instance.Status,
		CreatedAt:     instance.CreatedAt.UTC().Format(time.RFC3339),
	}, nil
}
