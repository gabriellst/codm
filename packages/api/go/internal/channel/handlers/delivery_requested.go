package handlers

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"

	chanevents "template/api-go/internal/channel/events"
	"template/api-go/internal/channel/services/registry"
	"template/contracts-go/wire"
	"template/core-go/repositories"
	"template/core-go/services/mediator"
	fwtypes "template/core-go/types"
)

// DeliveryRequestedHandler is the gateway's inbound (external) handler for
// integration.channel.delivery_requested (BC4 → BC1). It drives the live
// platform session: look up the connected channel, send the text, then raise a
// durable channel.outbound_delivered domain fact (which the egress path turns
// into integration.channel.outbound_delivered). In the source system this was a
// synchronous HTTP send; here it rides the same outbox/transport as the rest of
// the frozen contract.
type DeliveryRequestedHandler struct {
	registry        registry.ChannelRegistry
	domainEventRepo repositories.DomainEventRepository
}

func NewDeliveryRequestedHandler(
	reg registry.ChannelRegistry,
	repo repositories.DomainEventRepository,
) *DeliveryRequestedHandler {
	return &DeliveryRequestedHandler{registry: reg, domainEventRepo: repo}
}

var _ mediator.IntegrationEventHandler = (*DeliveryRequestedHandler)(nil)

func (h *DeliveryRequestedHandler) EventName() string {
	return wire.ChannelDeliveryRequestedEventName
}

func (h *DeliveryRequestedHandler) Handle(ctx context.Context, event fwtypes.IntegrationEventI) error {
	typed, err := fwtypes.UnmarshalIntegrationEvent[wire.ChannelDeliveryRequestedEvent](event)
	if err != nil {
		return err
	}
	p := typed.Payload

	channelID, err := uuid.Parse(p.ChannelID)
	if err != nil {
		return fmt.Errorf("delivery_requested: invalid channelId %q: %w", p.ChannelID, err)
	}

	ch, ok := h.registry.Get(channelID)
	if !ok {
		return fmt.Errorf("delivery_requested: channel %s not connected", p.ChannelID)
	}

	if _, err := ch.SendText(ctx, p.ContactExternalID, prefixedText(p)); err != nil {
		return fmt.Errorf("delivery_requested: send failed: %w", err)
	}

	// Optimistic delivered emit — durable via the outbox.
	delivered := chanevents.NewOutboundDeliveredEvent(channelID, p.OwnerID, chanevents.OutboundDeliveredPayload{
		ChannelID:      channelID,
		ContactID:      p.ContactExternalID,
		DisplayName:    p.ContactDisplayName,
		IsGroup:        p.ContactKind == wire.ContactKindGROUP,
		SenderIdentity: p.SenderIdentity,
		LabelIssueKey:  labelIssueKey(p),
		LabelThreadID:  labelThreadID(p),
		DeliveredAt:    time.Now().UTC(),
		OwnerID:        p.OwnerID,
	})
	if err := h.domainEventRepo.Save(ctx, delivered); err != nil {
		slog.Warn("delivery_requested: failed to emit outbound_delivered", "channelId", channelID, "error", err)
	}

	return nil
}

// prefixedText applies the IssueLabel published-language prefix to agent replies.
// "the label is the protocol": every AGENT outbound carries its issue key so the
// counterparty (and the router on the way back) can attribute the reply.
func prefixedText(p wire.ChannelDeliveryRequestedEvent) string {
	if p.SenderIdentity == wire.SenderIdentityAGENT && p.LabelIssueKey != nil && *p.LabelIssueKey != "" {
		return fmt.Sprintf("[%s] %s", *p.LabelIssueKey, p.Text)
	}
	return p.Text
}

func labelIssueKey(p wire.ChannelDeliveryRequestedEvent) string {
	if p.LabelIssueKey != nil {
		return *p.LabelIssueKey
	}
	return ""
}

func labelThreadID(p wire.ChannelDeliveryRequestedEvent) string {
	if p.LabelThreadID != nil {
		return *p.LabelThreadID
	}
	return ""
}
