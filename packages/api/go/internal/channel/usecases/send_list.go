package usecases

import (
	"context"
	errorsStd "errors"
	msgenums "template/api-go/internal/channel/enums"
	channelerrors "template/api-go/internal/channel/errors"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	"template/api-go/internal/channel/services/gateway"
	"template/api-go/internal/channel/services/gateway/whatsapp"
	"template/api-go/internal/channel/services/registry"
	"template/api-go/internal/shared/errors"
	"time"
)

type ListRow struct {
	Title       string `json:"title"       validate:"required" example:"Row 1"`
	Description string `json:"description" validate:"omitempty" example:"Description of row 1"`
	RowID       string `json:"rowId"       validate:"required" example:"row-1"`
}

type ListSection struct {
	Title string    `json:"title" validate:"required" example:"Section 1"`
	Rows  []ListRow `json:"rows"  validate:"required,dive"`
}

type SendListInput struct {
	ChannelID   string        `validate:"required,uuid"`
	RemoteID    string        `validate:"required"`
	Title       string        `validate:"required,max=255"`
	Description string        `validate:"required,max=1024"`
	ButtonText  string        `validate:"required,max=20"`
	FooterText  string        `validate:"omitempty,max=60"`
	Sections    []ListSection `validate:"required,dive"`
}

type SendListOutput struct {
	MessageID string `json:"messageId" example:"3EB0B430A6B7FBEC1200"`
	Timestamp int64  `json:"timestamp" example:"1710000000"`
}

type SendListHandler struct {
	integrationRepo channelrepo.ChannelRepository
	registry        registry.ChannelRegistry
}

func NewSendListHandler(
	integrationRepo channelrepo.ChannelRepository,
	registry registry.ChannelRegistry,
) *SendListHandler {
	return &SendListHandler{
		integrationRepo: integrationRepo,
		registry:        registry,
	}
}

func (h *SendListHandler) Name() string { return "SendList" }

func (h *SendListHandler) Execute(ctx context.Context, input SendListInput) (SendListOutput, error) {
	if len(input.Sections) == 0 {
		return SendListOutput{}, errors.NewBaseError(channelerrors.CodeEmptySections, "sections list cannot be empty")
	}

	instance, err := h.integrationRepo.Find(ctx, input.ChannelID)
	if err != nil {
		return SendListOutput{}, err
	}
	if instance == nil {
		return SendListOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotFound, "instance not found")
	}
	if instance.Status != msgenums.ChannelStatusConnected {
		return SendListOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "instance is not connected")
	}

	ch, ok := h.registry.Get(instance.ID.UUID())
	if !ok {
		return SendListOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "instance channel not available")
	}

	sections := make([]gateway.SendListSection, len(input.Sections))
	for i, s := range input.Sections {
		rows := make([]gateway.SendListRow, len(s.Rows))
		for j, r := range s.Rows {
			rows[j] = gateway.SendListRow{Title: r.Title, Description: r.Description, RowID: r.RowID}
		}
		sections[i] = gateway.SendListSection{Title: s.Title, Rows: rows}
	}
	content := gateway.SendListContent{
		Title: input.Title, Description: input.Description,
		ButtonText: input.ButtonText, FooterText: input.FooterText,
		Sections: sections,
	}

	result, err := ch.SendMessage(ctx, gateway.SendMessageParams{
		To:          input.RemoteID,
		MessageType: msgenums.MessageTypeList,
		Content:     content,
	})
	if err != nil {
		if errorsStd.Is(err, whatsapp.ErrInvalidRemoteID) {
			return SendListOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeInvalidRemoteID, "invalid remote identifier", err)
		}
		return SendListOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeMessageSendFailed, "failed to send list message", err)
	}

	if result.Timestamp == 0 {
		result.Timestamp = time.Now().Unix()
	}

	return SendListOutput{
		MessageID: result.MessageID,
		Timestamp: result.Timestamp,
	}, nil
}
