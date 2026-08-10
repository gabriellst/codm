package usecases

import (
	"context"
	"log/slog"

	"template/api-go/internal/channel/entities"
	"template/api-go/internal/channel/enums"
	ctxerrors "template/api-go/internal/channel/errors"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	"template/api-go/internal/channel/services/gateway"
	"template/api-go/internal/channel/services/pool"
	"template/core-go/errors"

	"github.com/google/uuid"
)

type ConnectChannelInput struct {
	ID string `validate:"required,uuid"`
}

type ConnectChannelOutput struct {
	ID     string `json:"id" example:"7c9e6679-7425-40de-944b-e07fc1f90ae7"`
	State  string `json:"state" example:"CONNECTING"`
	QRCode string `json:"qrCode,omitempty" example:"2@ABC123..."`
}

type ConnectChannelHandler struct {
	repo channelrepo.ChannelRepository
	pool pool.ChannelPool
}

func NewConnectChannelHandler(
	repo channelrepo.ChannelRepository,
	pool pool.ChannelPool,
) *ConnectChannelHandler {
	return &ConnectChannelHandler{repo: repo, pool: pool}
}

func (h *ConnectChannelHandler) Name() string { return "connect_channel" }

func (h *ConnectChannelHandler) Execute(ctx context.Context, input ConnectChannelInput) (ConnectChannelOutput, error) {
	channel, err := h.repo.Find(ctx, input.ID)
	if err != nil {
		return ConnectChannelOutput{}, err
	}
	if channel == nil {
		return ConnectChannelOutput{}, errors.NewBaseError(ctxerrors.CodeChannelNotFound, "channel not found")
	}

	channelUUID, err := uuid.Parse(input.ID)
	if err != nil {
		return ConnectChannelOutput{}, errors.NewBaseError(errors.CodeValidationFailed, "invalid channel id: "+input.ID)
	}

	ch, err := h.pool.Register(ctx, channelUUID, gateway.ChannelConfig{
		OwnerID:       channel.OwnerID,
		OwnerRemoteID: channel.OwnerRemoteID,
	})
	if err != nil {
		return ConnectChannelOutput{}, err
	}

	// Already connected or connecting — return current state without a DB write.
	switch ch.Status() {
	case gateway.ConnectionStatusConnected:
		return ConnectChannelOutput{ID: input.ID, State: string(enums.ChannelStatusConnected)}, nil
	case gateway.ConnectionStatusConnecting:
		return ConnectChannelOutput{ID: input.ID, State: string(enums.ChannelStatusConnecting)}, nil
	}

	// Try to get QR channel (new pairing or re-pairing)
	qrChan, err := ch.GetQRChannel(ctx)
	if err != nil {
		// Session already stored — just reconnect
		if connectErr := ch.Connect(ctx); connectErr != nil {
			return ConnectChannelOutput{}, connectErr
		}
		h.persistConnecting(ctx, channel)
		return ConnectChannelOutput{ID: input.ID, State: string(enums.ChannelStatusConnecting)}, nil
	}

	qrCode := ""
	select {
	case data, ok := <-qrChan:
		if ok {
			qrCode = data.Code
		}
	case <-ctx.Done():
		return ConnectChannelOutput{}, ctx.Err()
	}

	h.persistConnecting(ctx, channel)
	return ConnectChannelOutput{ID: input.ID, State: string(enums.ChannelStatusConnecting), QRCode: qrCode}, nil
}

// persistConnecting marks the entity as CONNECTING and upserts it. Errors are
// non-fatal — the gateway is already connecting regardless of projection state.
func (h *ConnectChannelHandler) persistConnecting(ctx context.Context, channel *entities.Channel) {
	channel.SetConnecting()
	if err := h.repo.Save(ctx, channel); err != nil {
		slog.Warn("failed to persist CONNECTING status", "channelId", channel.ID.String(), "error", err)
	}
}
