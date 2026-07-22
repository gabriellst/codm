// CONTEXT-ORIGIN: medscall/software/monorepo/packages/channel@ff66dbb1ee0fcd6212e5bf68879fa1d5a0a9cd1b (2026-07-20)
// Source path: packages/channel/internal/channel/usecases/create_channel.go
// Harvested verbatim for the usecase skill exemplar set — do not edit; re-harvest instead.
package usecases

import (
	"context"
	"monorepo/api/internal/channel/entities"
	"monorepo/api/internal/channel/enums"
	ctxerrors "monorepo/api/internal/channel/errors"
	channelrepo "monorepo/api/internal/channel/repositories/channel"
	sharedenums "monorepo/api/internal/shared/enums"
	"monorepo/api/internal/shared/errors"
	repositories "monorepo/api/internal/shared/repositories"
	"monorepo/api/internal/shared/services/unitofwork"
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
	repo            channelrepo.ChannelRepository
	uow             unitofwork.UnitOfWork
	domainEventRepo repositories.DomainEventRepository
}

func NewCreateChannelHandler(
	repo channelrepo.ChannelRepository,
	uow unitofwork.UnitOfWork,
	domainEventRepo repositories.DomainEventRepository,
) *CreateChannelHandler {
	return &CreateChannelHandler{repo: repo, uow: uow, domainEventRepo: domainEventRepo}
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
		if err := h.repo.Save(txCtx, integration); err != nil {
			return err
		}

		for _, event := range integration.PullDomainEvents() {
			if err := h.domainEventRepo.Save(txCtx, event); err != nil {
				return err
			}
		}

		return nil
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
