package usecases

import (
	"context"
	"template/api-go/internal/channel/entities"
	"template/api-go/internal/channel/enums"
	ctxerrors "template/api-go/internal/channel/errors"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	sharedenums "template/api-go/internal/shared/enums"
	"template/api-go/internal/shared/errors"
	"template/api-go/internal/shared/services/unitofwork"
)

type CreateChannelInput struct {
	Name     string               `validate:"required,min=1,max=100"`
	Platform sharedenums.Platform `validate:"required,oneof=WHATSAPP" json:"platform"`
	OwnerID  string               `validate:"omitempty"`
}

type CreateChannelOutput struct {
	ID        string               `json:"id" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	Name      string               `json:"name" example:"my-instance"`
	Platform  sharedenums.Platform `json:"platform" example:"WHATSAPP"`
	Status    enums.ChannelStatus  `json:"status" example:"CREATED"`
	CreatedAt string               `json:"createdAt" format:"date-time" example:"2026-02-19T10:30:00Z"`
}

type CreateChannelHandler struct {
	repo channelrepo.ChannelRepository
	uow  unitofwork.UnitOfWork
}

func NewCreateChannelHandler(
	repo channelrepo.ChannelRepository,
	uow unitofwork.UnitOfWork,
) *CreateChannelHandler {
	return &CreateChannelHandler{repo: repo, uow: uow}
}

func (h *CreateChannelHandler) Name() string { return "CreateInstance" }

func (h *CreateChannelHandler) Execute(ctx context.Context, input CreateChannelInput) (CreateChannelOutput, error) {
	// Check name uniqueness
	existing, _ := h.repo.FindByName(ctx, input.Name)
	if existing != nil {
		return CreateChannelOutput{}, errors.NewBaseError(ctxerrors.CodeChannelNameAlreadyExists, "instance name already exists")
	}

	integration, err := entities.NewChannel(entities.NewChannelParams{
		Name:     input.Name,
		Platform: input.Platform,
		OwnerID:  input.OwnerID,
	})
	if err != nil {
		return CreateChannelOutput{}, err
	}

	err = h.uow.Execute(ctx, func(txCtx context.Context) error {
		// Save persists the aggregate's pulled domain events itself.
		return h.repo.Save(txCtx, integration)
	})
	if err != nil {
		return CreateChannelOutput{}, err
	}

	return CreateChannelOutput{
		ID:        integration.ID.String(),
		Name:      integration.Name,
		Platform:  integration.Platform,
		Status:    integration.Status,
		CreatedAt: integration.CreatedAt.Format("2006-01-02T15:04:05Z"),
	}, nil
}
