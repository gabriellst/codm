package handlers

import (
	"context"

	chanevents "template/api-go/internal/channel/events"
	"template/contracts-go/wire"
	"template/core-go/services/mediator"
	fwtypes "template/core-go/types"
)

// The egress handlers are the write-side translation layer: one domain fact →
// one frozen wire integration event, published on the ExternalMediator. Each is
// a mediator.DomainEventHandler registered on the InternalMediator; the
// OutboxDispatcher drives them from the durable outbox, so a crash between the
// domain-event save and the Redis publish is retried, not lost.

func contactKind(isGroup bool) wire.ContactKind {
	if isGroup {
		return wire.ContactKindGROUP
	}
	return wire.ContactKindCONTACT
}

func optStr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// ── channel.message_received → integration.channel_message.received ──────────────

type MessageReceivedEgress struct{ ext mediator.ExternalMediator }

func NewMessageReceivedEgress(ext mediator.ExternalMediator) *MessageReceivedEgress {
	return &MessageReceivedEgress{ext: ext}
}

var _ mediator.DomainEventHandler = (*MessageReceivedEgress)(nil)

func (h *MessageReceivedEgress) EventName() string { return chanevents.MessageReceivedEventName }

func (h *MessageReceivedEgress) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	ev, err := fwtypes.UnmarshalDomainEvent[chanevents.MessageReceivedPayload](event)
	if err != nil {
		return err
	}
	p := ev.Payload
	out := wire.ChannelMessageReceivedEvent{
		Name:               wire.ChannelMessageReceivedEventName,
		EntityID:           p.ChannelID.String(),
		OwnerID:            p.OwnerID,
		OccurredAt:         ev.Time,
		ChannelID:          p.ChannelID.String(),
		MessageID:          p.MessageID,
		ContactExternalID:  p.ContactID,
		ContactDisplayName: p.DisplayName,
		ContactKind:        contactKind(p.IsGroup),
		SenderExternalID:   p.SenderID,
		IsGroup:            p.IsGroup,
		Text:               p.Text,
		QuotedEntryID:      optStr(p.QuotedID),
		Platform:           p.Kind,
		ReceivedAt:         p.ReceivedAt,
	}
	return h.ext.Publish(ctx, wireEnvelope{wire.ChannelMessageReceivedEventName, p.OwnerID, out})
}

// ── channel.connected → integration.channel.connected ────────────────────────────

type ConnectedEgress struct{ ext mediator.ExternalMediator }

func NewConnectedEgress(ext mediator.ExternalMediator) *ConnectedEgress {
	return &ConnectedEgress{ext: ext}
}

var _ mediator.DomainEventHandler = (*ConnectedEgress)(nil)

func (h *ConnectedEgress) EventName() string { return chanevents.ConnectedEventName }

func (h *ConnectedEgress) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	ev, err := fwtypes.UnmarshalDomainEvent[chanevents.ConnectedPayload](event)
	if err != nil {
		return err
	}
	p := ev.Payload
	out := wire.ChannelConnectedEvent{
		Name:          wire.ChannelConnectedEventName,
		EntityID:      p.ChannelID.String(),
		OwnerID:       p.OwnerID,
		OccurredAt:    ev.Time,
		ChannelID:     p.ChannelID.String(),
		Kind:          p.Kind,
		AccountDetail: p.AccountDetail,
		PairedAt:      p.PairedAt,
	}
	return h.ext.Publish(ctx, wireEnvelope{wire.ChannelConnectedEventName, p.OwnerID, out})
}

// ── channel.disconnected → integration.channel.disconnected ──────────────────────

type DisconnectedEgress struct{ ext mediator.ExternalMediator }

func NewDisconnectedEgress(ext mediator.ExternalMediator) *DisconnectedEgress {
	return &DisconnectedEgress{ext: ext}
}

var _ mediator.DomainEventHandler = (*DisconnectedEgress)(nil)

func (h *DisconnectedEgress) EventName() string { return chanevents.DisconnectedEventName }

func (h *DisconnectedEgress) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	ev, err := fwtypes.UnmarshalDomainEvent[chanevents.DisconnectedPayload](event)
	if err != nil {
		return err
	}
	p := ev.Payload
	out := wire.ChannelDisconnectedEvent{
		Name:              wire.ChannelDisconnectedEventName,
		EntityID:          p.ChannelID.String(),
		OwnerID:           p.OwnerID,
		OccurredAt:        ev.Time,
		ChannelID:         p.ChannelID.String(),
		Kind:              p.Kind,
		AffectedThreadIds: []string{}, // the core resolves affected threads by channelId
	}
	return h.ext.Publish(ctx, wireEnvelope{wire.ChannelDisconnectedEventName, p.OwnerID, out})
}

// ── channel.pairing_qr_updated → integration.channel.pairing_qr_updated ──────────

type PairingQRUpdatedEgress struct{ ext mediator.ExternalMediator }

func NewPairingQRUpdatedEgress(ext mediator.ExternalMediator) *PairingQRUpdatedEgress {
	return &PairingQRUpdatedEgress{ext: ext}
}

var _ mediator.DomainEventHandler = (*PairingQRUpdatedEgress)(nil)

func (h *PairingQRUpdatedEgress) EventName() string { return chanevents.PairingQRUpdatedEventName }

func (h *PairingQRUpdatedEgress) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	ev, err := fwtypes.UnmarshalDomainEvent[chanevents.PairingQRUpdatedPayload](event)
	if err != nil {
		return err
	}
	p := ev.Payload
	out := wire.ChannelPairingQrUpdatedEvent{
		Name:        wire.ChannelPairingQrUpdatedEventName,
		EntityID:    p.ChannelID.String(),
		OwnerID:     p.OwnerID,
		OccurredAt:  ev.Time,
		ChannelID:   p.ChannelID.String(),
		Kind:        p.Kind,
		QrPayload:   p.QRPayload,
		QrExpiresAt: p.QRExpiresAt,
	}
	return h.ext.Publish(ctx, wireEnvelope{wire.ChannelPairingQrUpdatedEventName, p.OwnerID, out})
}

// ── channel.outbound_delivered → integration.channel.outbound_delivered ──────────

type OutboundDeliveredEgress struct{ ext mediator.ExternalMediator }

func NewOutboundDeliveredEgress(ext mediator.ExternalMediator) *OutboundDeliveredEgress {
	return &OutboundDeliveredEgress{ext: ext}
}

var _ mediator.DomainEventHandler = (*OutboundDeliveredEgress)(nil)

func (h *OutboundDeliveredEgress) EventName() string { return chanevents.OutboundDeliveredEventName }

func (h *OutboundDeliveredEgress) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	ev, err := fwtypes.UnmarshalDomainEvent[chanevents.OutboundDeliveredPayload](event)
	if err != nil {
		return err
	}
	p := ev.Payload
	out := wire.ChannelOutboundDeliveredEvent{
		Name:               wire.ChannelOutboundDeliveredEventName,
		EntityID:           p.ChannelID.String(),
		OwnerID:            p.OwnerID,
		OccurredAt:         ev.Time,
		ChannelID:          p.ChannelID.String(),
		ContactExternalID:  p.ContactID,
		ContactDisplayName: p.DisplayName,
		ContactKind:        contactKind(p.IsGroup),
		LabelIssueKey:      optStr(p.LabelIssueKey),
		LabelThreadID:      optStr(p.LabelThreadID),
		SenderIdentity:     p.SenderIdentity,
		DeliveredAt:        p.DeliveredAt,
	}
	return h.ext.Publish(ctx, wireEnvelope{wire.ChannelOutboundDeliveredEventName, p.OwnerID, out})
}
