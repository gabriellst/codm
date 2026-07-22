package usecases

import (
	"context"
	"time"

	"template/api-go/internal/channel/projections"
)

type ListChannelsInput struct {
	OwnerID string
}

// ChannelView is one row of the channels read model.
type ChannelView struct {
	ID            string    `json:"id"`
	Kind          string    `json:"kind"`
	Status        string    `json:"status"`
	AccountDetail string    `json:"accountDetail"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

type ListChannelsOutput struct {
	Channels []ChannelView `json:"channels"`
}

type ListChannelsHandler struct {
	repo projections.ChannelProjectionRepository
}

func NewListChannelsHandler(repo projections.ChannelProjectionRepository) *ListChannelsHandler {
	return &ListChannelsHandler{repo: repo}
}

func (h *ListChannelsHandler) Name() string { return "ListChannels" }

func (h *ListChannelsHandler) Execute(ctx context.Context, input ListChannelsInput) (ListChannelsOutput, error) {
	ownerID := input.OwnerID
	if ownerID == "" {
		ownerID = OperatorID
	}

	rows, err := h.repo.ListByOwner(ctx, ownerID)
	if err != nil {
		return ListChannelsOutput{}, err
	}

	views := make([]ChannelView, 0, len(rows))
	for _, r := range rows {
		views = append(views, ChannelView{
			ID:            r.ID,
			Kind:          string(r.Kind),
			Status:        string(r.Status),
			AccountDetail: r.AccountDetail,
			CreatedAt:     r.CreatedAt,
			UpdatedAt:     r.UpdatedAt,
		})
	}
	return ListChannelsOutput{Channels: views}, nil
}
