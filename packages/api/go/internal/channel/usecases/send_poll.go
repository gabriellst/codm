package usecases

import (
	"context"
	errorsStd "errors"
	msgenums "template/api-go/internal/channel/enums"
	channelerrors "template/api-go/internal/channel/errors"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	"template/api-go/internal/channel/services/gateway"
	"template/api-go/internal/channel/services/gateway/whatsapp"
	"template/api-go/internal/channel/services/pool"
	"template/core-go/errors"
	"time"
)

type PollOption struct {
	OptionName string `json:"optionName" validate:"required" example:"Option A"`
}

type SendPollInput struct {
	ChannelID       string       `validate:"required,uuid"`
	RemoteID        string       `validate:"required"`
	PollName        string       `validate:"required,max=255"`
	Options         []PollOption `validate:"required,min=2,max=12,dive"`
	SelectableCount int          `validate:"omitempty,min=0"`
}

type SendPollOutput struct {
	MessageID string `json:"messageId" example:"3EB0B430A6B7FBEC1200"`
	Timestamp int64  `json:"timestamp" example:"1710000000"`
}

type SendPollHandler struct {
	integrationRepo channelrepo.ChannelRepository
	pool            pool.ChannelPool
}

func NewSendPollHandler(
	integrationRepo channelrepo.ChannelRepository,
	pool pool.ChannelPool,
) *SendPollHandler {
	return &SendPollHandler{
		integrationRepo: integrationRepo,
		pool:            pool,
	}
}

func (h *SendPollHandler) Name() string { return "send_poll" }

func (h *SendPollHandler) Execute(ctx context.Context, input SendPollInput) (SendPollOutput, error) {
	if len(input.Options) < 2 {
		return SendPollOutput{}, errors.NewBaseError(channelerrors.CodeTooFewPollOptions, "poll must have at least 2 options")
	}
	if len(input.Options) > 12 {
		return SendPollOutput{}, errors.NewBaseError(channelerrors.CodeTooManyPollOptions, "poll cannot have more than 12 options")
	}

	channel, err := h.integrationRepo.Find(ctx, input.ChannelID)
	if err != nil {
		return SendPollOutput{}, err
	}
	if channel == nil {
		return SendPollOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotFound, "channel not found")
	}
	if channel.Status != msgenums.ChannelStatusConnected {
		return SendPollOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel is not connected")
	}

	ch, ok := h.pool.Get(channel.ID.UUID())
	if !ok {
		return SendPollOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel not available")
	}

	options := make([]gateway.SendPollOption, len(input.Options))
	for i, o := range input.Options {
		options[i] = gateway.SendPollOption{OptionName: o.OptionName}
	}
	content := gateway.SendPollContent{Name: input.PollName, Options: options, SelectableCount: input.SelectableCount}

	result, err := ch.SendMessage(ctx, gateway.SendMessageParams{
		To:          input.RemoteID,
		MessageType: msgenums.MessageTypePoll,
		Content:     content,
	})
	if err != nil {
		if errorsStd.Is(err, whatsapp.ErrInvalidRemoteID) {
			return SendPollOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeInvalidRemoteID, "invalid remote identifier", err)
		}
		return SendPollOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeMessageSendFailed, "failed to send poll message", err)
	}

	if result.Timestamp == 0 {
		result.Timestamp = time.Now().Unix()
	}

	return SendPollOutput{
		MessageID: result.MessageID,
		Timestamp: result.Timestamp,
	}, nil
}
