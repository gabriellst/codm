// CONTEXT-ORIGIN: medscall/software/monorepo/packages/channel@ff66dbb1ee0fcd6212e5bf68879fa1d5a0a9cd1b (2026-07-20)
// Source path: packages/channel/internal/channel/usecases/connect_channel.go
// Harvested verbatim for the usecase skill exemplar set — do not edit; re-harvest instead.
package usecases

import (
	"context"
	"log/slog"

	"monorepo/api/internal/channel/entities"
	"monorepo/api/internal/channel/enums"
	ctxerrors "monorepo/api/internal/channel/errors"
	channelrepo "monorepo/api/internal/channel/repositories/channel"
	"monorepo/api/internal/channel/services/gateway"
	"monorepo/api/internal/channel/services/registry"
	"monorepo/api/internal/shared/errors"

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
	repo     channelrepo.ChannelRepository
	registry registry.ChannelRegistry
}

func NewConnectChannelHandler(
	repo channelrepo.ChannelRepository,
	registry registry.ChannelRegistry,
) *ConnectChannelHandler {
	return &ConnectChannelHandler{repo: repo, registry: registry}
}

func (h *ConnectChannelHandler) Name() string { return "ConnectInstance" }

func (h *ConnectChannelHandler) Execute(ctx context.Context, input ConnectChannelInput) (ConnectChannelOutput, error) {
	instance, err := h.repo.Find(ctx, input.ID)
	if err != nil {
		return ConnectChannelOutput{}, err
	}
	if instance == nil {
		return ConnectChannelOutput{}, errors.NewBaseError(ctxerrors.CodeChannelNotFound, "instance not found")
	}

	instanceUUID, _ := uuid.Parse(input.ID)

	ch, err := h.registry.Register(ctx, instanceUUID, gateway.ChannelConfig{
		OwnerID:       instance.OwnerID,
		OwnerRemoteID: instance.OwnerRemoteID,
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
		h.persistConnecting(ctx, instance)
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

	h.persistConnecting(ctx, instance)
	return ConnectChannelOutput{ID: input.ID, State: string(enums.ChannelStatusConnecting), QRCode: qrCode}, nil
}

// persistConnecting marks the entity as CONNECTING and upserts it. Errors are
// non-fatal — the gateway is already connecting regardless of projection state.
func (h *ConnectChannelHandler) persistConnecting(ctx context.Context, instance *entities.Channel) {
	instance.SetConnecting()
	if err := h.repo.Save(ctx, instance); err != nil {
		slog.Warn("failed to persist CONNECTING status", "channelId", instance.ID.String(), "error", err)
	}
}
