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

type SendLocationInput struct {
	ChannelID string  `validate:"required,uuid"`
	RemoteID  string  `validate:"required"`
	Latitude  float64 `validate:"required"`
	Longitude float64 `validate:"required"`
	Name      string  `validate:"omitempty,max=255"`
	Address   string  `validate:"omitempty,max=500"`
}

type SendLocationOutput struct {
	MessageID string `json:"messageId" example:"3EB0B430A6B7FBEC1200"`
	Timestamp int64  `json:"timestamp" example:"1710000000"`
}

type SendLocationHandler struct {
	integrationRepo channelrepo.ChannelRepository
	registry        registry.ChannelRegistry
}

func NewSendLocationHandler(
	integrationRepo channelrepo.ChannelRepository,
	registry registry.ChannelRegistry,
) *SendLocationHandler {
	return &SendLocationHandler{
		integrationRepo: integrationRepo,
		registry:        registry,
	}
}

func (h *SendLocationHandler) Name() string { return "send_location" }

func (h *SendLocationHandler) Execute(ctx context.Context, input SendLocationInput) (SendLocationOutput, error) {
	channel, err := h.integrationRepo.Find(ctx, input.ChannelID)
	if err != nil {
		return SendLocationOutput{}, err
	}
	if channel == nil {
		return SendLocationOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotFound, "channel not found")
	}
	if channel.Status != msgenums.ChannelStatusConnected {
		return SendLocationOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel is not connected")
	}

	ch, ok := h.registry.Get(channel.ID.UUID())
	if !ok {
		return SendLocationOutput{}, errors.NewBaseError(channelerrors.CodeChannelNotConnected, "channel not available")
	}

	if input.Latitude < -90 || input.Latitude > 90 || input.Longitude < -180 || input.Longitude > 180 {
		return SendLocationOutput{}, errors.NewBaseError(channelerrors.CodeInvalidCoordinates, "invalid coordinates: latitude must be between -90 and 90, longitude between -180 and 180")
	}

	sendContent := gateway.SendLocationContent{Latitude: input.Latitude, Longitude: input.Longitude, Name: input.Name, Address: input.Address}

	result, err := ch.SendMessage(ctx, gateway.SendMessageParams{
		To:          input.RemoteID,
		MessageType: msgenums.MessageTypeLocation,
		Content:     sendContent,
	})
	if err != nil {
		if errorsStd.Is(err, whatsapp.ErrInvalidRemoteID) {
			return SendLocationOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeInvalidRemoteID, "invalid remote identifier", err)
		}
		return SendLocationOutput{}, errors.NewBaseErrorWithCause(channelerrors.CodeMessageSendFailed, "failed to send location message", err)
	}

	if result.Timestamp == 0 {
		result.Timestamp = time.Now().Unix()
	}

	return SendLocationOutput{
		MessageID: result.MessageID,
		Timestamp: result.Timestamp,
	}, nil
}
