package usecases

import (
	"context"
	"encoding/json"
	"time"

	"template/api-go/internal/channel/enums"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	sharedenums "template/api-go/internal/shared/enums"
)

type ListChannelsInput struct {
	OwnerID string `validate:"required"`
	Limit   int    `validate:"omitempty,min=1,max=100"`
	Offset  int    `validate:"omitempty,min=0"`
}

type ListChannelsItem struct {
	ID          string               `json:"id" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	Name        string               `json:"name" example:"my-instance"`
	Platform    sharedenums.Platform `json:"platform" example:"WHATSAPP"`
	Credentials json.RawMessage      `json:"credentials"`
	Status      enums.ChannelStatus  `json:"status" example:"CREATED"`
	CreatedAt   string               `json:"createdAt" format:"date-time" example:"2026-02-19T10:30:00Z"`
}

type ListChannelsOutput struct {
	Items []ListChannelsItem `json:"items"`
	Total int                `json:"total" example:"42"`
}

type ListChannelsHandler struct {
	repo channelrepo.ChannelRepository
}

func NewListChannelsHandler(repo channelrepo.ChannelRepository) *ListChannelsHandler {
	return &ListChannelsHandler{repo: repo}
}

func (h *ListChannelsHandler) Name() string { return "ListChannels" }

func (h *ListChannelsHandler) Execute(ctx context.Context, input ListChannelsInput) (ListChannelsOutput, error) {
	if input.Limit == 0 {
		input.Limit = 20
	}

	results, total, err := h.repo.FindAll(ctx, input.OwnerID, input.Limit, input.Offset)
	if err != nil {
		return ListChannelsOutput{}, err
	}

	items := make([]ListChannelsItem, len(results))
	for i, e := range results {
		items[i] = ListChannelsItem{
			ID:          e.ID.String(),
			Name:        e.Name,
			Platform:    e.Platform,
			Credentials: e.Credentials,
			Status:      e.Status,
			CreatedAt:   e.CreatedAt.UTC().Format(time.RFC3339),
		}
	}

	return ListChannelsOutput{
		Items: items,
		Total: total,
	}, nil
}
