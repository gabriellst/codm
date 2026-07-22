// Package usecases holds the channel gateway's application operations.
package usecases

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"template/api-go/internal/channel/projections"
	"template/api-go/internal/channel/services/gateway"
	"template/api-go/internal/channel/services/registry"
	"template/contracts-go/wire"
)

// OperatorID is the single implicit operator of the local daemon. CodeDM has no
// accounts/tenancy — the ownerId axis is collapsed to this one constant.
const OperatorID = "00000000-0000-0000-0000-000000000001"

// ConnectChannelInput starts (or resumes) a WhatsApp session for the operator.
type ConnectChannelInput struct {
	OwnerID string
}

// ConnectChannelOutput returns the channel id and its status after the connect
// attempt. A fresh pairing streams QR codes over SSE
// (integration.channel.pairing_qr_updated); a reconnect goes straight to
// CONNECTED once the platform confirms.
type ConnectChannelOutput struct {
	ChannelID string `json:"channelId"`
	Status    string `json:"status"`
}

// ConnectChannelHandler orchestrates get-or-create + registry registration +
// pairing/reconnect.
type ConnectChannelHandler struct {
	registry registry.ChannelRegistry
	repo     projections.ChannelProjectionRepository
}

func NewConnectChannelHandler(
	reg registry.ChannelRegistry,
	repo projections.ChannelProjectionRepository,
) *ConnectChannelHandler {
	return &ConnectChannelHandler{registry: reg, repo: repo}
}

func (h *ConnectChannelHandler) Name() string { return "ConnectChannel" }

func (h *ConnectChannelHandler) Execute(ctx context.Context, input ConnectChannelInput) (ConnectChannelOutput, error) {
	ownerID := input.OwnerID
	if ownerID == "" {
		ownerID = OperatorID
	}

	// Get-or-create the WhatsApp channel row for this operator.
	existing, err := h.repo.FindByOwnerAndKind(ctx, ownerID, wire.ChannelKindWHATSAPP)
	if err != nil {
		return ConnectChannelOutput{}, err
	}

	var channelID uuid.UUID
	accountDetail := ""
	if existing != nil {
		channelID, err = uuid.Parse(existing.ID)
		if err != nil {
			return ConnectChannelOutput{}, err
		}
		accountDetail = existing.AccountDetail
	} else {
		channelID = uuid.New()
		now := time.Now().UTC()
		if err := h.repo.Upsert(ctx, &projections.ChannelProjection{
			ID:        channelID.String(),
			OwnerID:   ownerID,
			Kind:      wire.ChannelKindWHATSAPP,
			Status:    wire.ChannelStatusPAIRING,
			CreatedAt: now,
			UpdatedAt: now,
		}); err != nil {
			return ConnectChannelOutput{}, err
		}
	}

	ch, err := h.registry.Register(ctx, channelID, gateway.ChannelConfig{
		OwnerID:       ownerID,
		OwnerRemoteID: accountDetail,
	})
	if err != nil {
		return ConnectChannelOutput{}, err
	}

	// Reconnect an already-paired device, or start a fresh QR pairing.
	if accountDetail != "" {
		if err := ch.Connect(ctx); err != nil {
			return ConnectChannelOutput{}, err
		}
		return ConnectChannelOutput{ChannelID: channelID.String(), Status: string(wire.ChannelStatusCONNECTED)}, nil
	}

	qrCh, err := ch.GetQRChannel(ctx)
	if err != nil {
		return ConnectChannelOutput{}, err
	}
	// Drain the QR stream so the adapter goroutine keeps producing rotations.
	// Each rotation is emitted as a domain event inside the adapter → SSE.
	go func() {
		for range qrCh {
		}
		slog.Info("qr stream closed", "channelId", channelID)
	}()

	_ = h.repo.SetStatus(ctx, channelID.String(), wire.ChannelStatusPAIRING, "")
	return ConnectChannelOutput{ChannelID: channelID.String(), Status: string(wire.ChannelStatusPAIRING)}, nil
}
