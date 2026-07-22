package handlers

import (
	"context"

	chanevents "template/api-go/internal/channel/events"
	"template/contracts-go/wire"
	"template/core-go/services/mediator"
	fwtypes "template/core-go/types"
)

// egress_readmodel.go bridges the read-model DOMAIN facts (events/readmodel.go)
// to the FROZEN wire integration events, one handler per fact. Same shape as the
// lifecycle egress in egress.go: a mediator.DomainEventHandler registered on the
// InternalMediator, publishing the flat wire event on the ExternalMediator.

// ── channel_message.sent → integration.channel_message.sent ──────────────────────

type MessageSentEgress struct{ ext mediator.ExternalMediator }

func NewMessageSentEgress(ext mediator.ExternalMediator) *MessageSentEgress {
	return &MessageSentEgress{ext: ext}
}

var _ mediator.DomainEventHandler = (*MessageSentEgress)(nil)

func (h *MessageSentEgress) EventName() string { return chanevents.MessageSentEventName }

func (h *MessageSentEgress) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	ev, err := fwtypes.UnmarshalDomainEvent[chanevents.MessageSentPayload](event)
	if err != nil {
		return err
	}
	p := ev.Payload
	out := wire.ChannelMessageSentEvent{
		Name:              wire.ChannelMessageSentEventName,
		EntityID:          p.ChannelID.String(),
		OwnerID:           p.OwnerID,
		OccurredAt:        ev.Time,
		ChannelID:         p.ChannelID.String(),
		MessageID:         p.MessageID,
		InternalMessageID: p.InternalMessageID.String(),
		RemoteID:          p.RemoteID,
		SenderID:          p.SenderID,
		IsGroup:           p.IsGroup,
		Timestamp:         p.Timestamp,
		ObservedAt:        p.ObservedAt,
		MessageType:       p.MessageType,
		ContentJson:       string(p.Content),
		Platform:          p.Platform,
	}
	return h.ext.Publish(ctx, wireEnvelope{wire.ChannelMessageSentEventName, p.OwnerID, out})
}

// ── channel_message.edited → integration.channel_message.edited ──────────────────

type MessageEditedEgress struct{ ext mediator.ExternalMediator }

func NewMessageEditedEgress(ext mediator.ExternalMediator) *MessageEditedEgress {
	return &MessageEditedEgress{ext: ext}
}

var _ mediator.DomainEventHandler = (*MessageEditedEgress)(nil)

func (h *MessageEditedEgress) EventName() string { return chanevents.MessageEditedEventName }

func (h *MessageEditedEgress) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	ev, err := fwtypes.UnmarshalDomainEvent[chanevents.MessageEditedPayload](event)
	if err != nil {
		return err
	}
	p := ev.Payload
	out := wire.ChannelMessageEditedEvent{
		Name:        wire.ChannelMessageEditedEventName,
		EntityID:    p.ChannelID.String(),
		OwnerID:     p.OwnerID,
		OccurredAt:  ev.Time,
		ChannelID:   p.ChannelID.String(),
		MessageID:   p.MessageID,
		RemoteID:    p.RemoteID,
		SenderID:    p.SenderID,
		Timestamp:   p.Timestamp,
		MessageType: p.MessageType,
		ContentJson: string(p.Content),
		Platform:    p.Platform,
	}
	return h.ext.Publish(ctx, wireEnvelope{wire.ChannelMessageEditedEventName, p.OwnerID, out})
}

// ── channel_message.deleted → integration.channel_message.deleted ────────────────

type MessageDeletedEgress struct{ ext mediator.ExternalMediator }

func NewMessageDeletedEgress(ext mediator.ExternalMediator) *MessageDeletedEgress {
	return &MessageDeletedEgress{ext: ext}
}

var _ mediator.DomainEventHandler = (*MessageDeletedEgress)(nil)

func (h *MessageDeletedEgress) EventName() string { return chanevents.MessageDeletedEventName }

func (h *MessageDeletedEgress) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	ev, err := fwtypes.UnmarshalDomainEvent[chanevents.MessageDeletedPayload](event)
	if err != nil {
		return err
	}
	p := ev.Payload
	out := wire.ChannelMessageDeletedEvent{
		Name:       wire.ChannelMessageDeletedEventName,
		EntityID:   p.ChannelID.String(),
		OwnerID:    p.OwnerID,
		OccurredAt: ev.Time,
		ChannelID:  p.ChannelID.String(),
		MessageID:  p.MessageID,
		RemoteID:   p.RemoteID,
		Platform:   p.Platform,
	}
	return h.ext.Publish(ctx, wireEnvelope{wire.ChannelMessageDeletedEventName, p.OwnerID, out})
}

// ── channel_message.delivered → integration.channel_message.delivered ────────────

type MessageDeliveredEgress struct{ ext mediator.ExternalMediator }

func NewMessageDeliveredEgress(ext mediator.ExternalMediator) *MessageDeliveredEgress {
	return &MessageDeliveredEgress{ext: ext}
}

var _ mediator.DomainEventHandler = (*MessageDeliveredEgress)(nil)

func (h *MessageDeliveredEgress) EventName() string { return chanevents.MessageDeliveredEventName }

func (h *MessageDeliveredEgress) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	ev, err := fwtypes.UnmarshalDomainEvent[chanevents.MessageDeliveredPayload](event)
	if err != nil {
		return err
	}
	p := ev.Payload
	ids := p.MessageIDs
	if ids == nil {
		ids = []string{}
	}
	out := wire.ChannelMessageDeliveredEvent{
		Name:       wire.ChannelMessageDeliveredEventName,
		EntityID:   p.ChannelID.String(),
		OwnerID:    p.OwnerID,
		OccurredAt: ev.Time,
		ChannelID:  p.ChannelID.String(),
		RemoteID:   p.RemoteID,
		SenderID:   p.SenderID,
		MessageIds: ids,
		Timestamp:  p.Timestamp,
		Platform:   p.Platform,
	}
	return h.ext.Publish(ctx, wireEnvelope{wire.ChannelMessageDeliveredEventName, p.OwnerID, out})
}

// ── channel_message.seen → integration.channel_message.seen ──────────────────────

type MessageSeenEgress struct{ ext mediator.ExternalMediator }

func NewMessageSeenEgress(ext mediator.ExternalMediator) *MessageSeenEgress {
	return &MessageSeenEgress{ext: ext}
}

var _ mediator.DomainEventHandler = (*MessageSeenEgress)(nil)

func (h *MessageSeenEgress) EventName() string { return chanevents.MessageSeenEventName }

func (h *MessageSeenEgress) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	ev, err := fwtypes.UnmarshalDomainEvent[chanevents.MessageSeenPayload](event)
	if err != nil {
		return err
	}
	p := ev.Payload
	ids := p.MessageIDs
	if ids == nil {
		ids = []string{}
	}
	out := wire.ChannelMessageSeenEvent{
		Name:       wire.ChannelMessageSeenEventName,
		EntityID:   p.ChannelID.String(),
		OwnerID:    p.OwnerID,
		OccurredAt: ev.Time,
		ChannelID:  p.ChannelID.String(),
		RemoteID:   p.RemoteID,
		SenderID:   p.SenderID,
		MessageIds: ids,
		Timestamp:  p.Timestamp,
		Self:       p.Self,
		Platform:   p.Platform,
	}
	return h.ext.Publish(ctx, wireEnvelope{wire.ChannelMessageSeenEventName, p.OwnerID, out})
}

// ── channel.remote_created → integration.channel.remote_created ──────────────────

type RemoteCreatedEgress struct{ ext mediator.ExternalMediator }

func NewRemoteCreatedEgress(ext mediator.ExternalMediator) *RemoteCreatedEgress {
	return &RemoteCreatedEgress{ext: ext}
}

var _ mediator.DomainEventHandler = (*RemoteCreatedEgress)(nil)

func (h *RemoteCreatedEgress) EventName() string { return chanevents.RemoteCreatedEventName }

func (h *RemoteCreatedEgress) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	ev, err := fwtypes.UnmarshalDomainEvent[chanevents.RemoteCreatedPayload](event)
	if err != nil {
		return err
	}
	p := ev.Payload
	out := wire.ChannelRemoteCreatedEvent{
		Name:        wire.ChannelRemoteCreatedEventName,
		EntityID:    p.ChannelID.String(),
		OwnerID:     p.OwnerID,
		OccurredAt:  ev.Time,
		ChannelID:   p.ChannelID.String(),
		RemoteID:    p.RemoteID,
		ContactKind: p.ContactKind,
		Platform:    p.Platform,
	}
	return h.ext.Publish(ctx, wireEnvelope{wire.ChannelRemoteCreatedEventName, p.OwnerID, out})
}

// ── channel.remote_updated → integration.channel.remote_updated ──────────────────

type RemoteUpdatedEgress struct{ ext mediator.ExternalMediator }

func NewRemoteUpdatedEgress(ext mediator.ExternalMediator) *RemoteUpdatedEgress {
	return &RemoteUpdatedEgress{ext: ext}
}

var _ mediator.DomainEventHandler = (*RemoteUpdatedEgress)(nil)

func (h *RemoteUpdatedEgress) EventName() string { return chanevents.RemoteUpdatedEventName }

func (h *RemoteUpdatedEgress) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	ev, err := fwtypes.UnmarshalDomainEvent[chanevents.RemoteUpdatedPayload](event)
	if err != nil {
		return err
	}
	p := ev.Payload
	out := wire.ChannelRemoteUpdatedEvent{
		Name:        wire.ChannelRemoteUpdatedEventName,
		EntityID:    p.ChannelID.String(),
		OwnerID:     p.OwnerID,
		OccurredAt:  ev.Time,
		ChannelID:   p.ChannelID.String(),
		RemoteID:    p.RemoteID,
		ContactKind: p.ContactKind,
		DisplayName: p.DisplayName,
		Description: p.Description,
		ObservedAt:  p.ObservedAt,
	}
	return h.ext.Publish(ctx, wireEnvelope{wire.ChannelRemoteUpdatedEventName, p.OwnerID, out})
}

// ── channel.remote_deleted → integration.channel.remote_deleted ──────────────────

type RemoteDeletedEgress struct{ ext mediator.ExternalMediator }

func NewRemoteDeletedEgress(ext mediator.ExternalMediator) *RemoteDeletedEgress {
	return &RemoteDeletedEgress{ext: ext}
}

var _ mediator.DomainEventHandler = (*RemoteDeletedEgress)(nil)

func (h *RemoteDeletedEgress) EventName() string { return chanevents.RemoteDeletedEventName }

func (h *RemoteDeletedEgress) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	ev, err := fwtypes.UnmarshalDomainEvent[chanevents.RemoteDeletedPayload](event)
	if err != nil {
		return err
	}
	p := ev.Payload
	out := wire.ChannelRemoteDeletedEvent{
		Name:       wire.ChannelRemoteDeletedEventName,
		EntityID:   p.ChannelID.String(),
		OwnerID:    p.OwnerID,
		OccurredAt: ev.Time,
		ChannelID:  p.ChannelID.String(),
		RemoteID:   p.RemoteID,
		DeletedAt:  p.DeletedAt,
	}
	return h.ext.Publish(ctx, wireEnvelope{wire.ChannelRemoteDeletedEventName, p.OwnerID, out})
}

// ── channel.membership_added → integration.channel.membership_added ──────────────

type MembershipAddedEgress struct{ ext mediator.ExternalMediator }

func NewMembershipAddedEgress(ext mediator.ExternalMediator) *MembershipAddedEgress {
	return &MembershipAddedEgress{ext: ext}
}

var _ mediator.DomainEventHandler = (*MembershipAddedEgress)(nil)

func (h *MembershipAddedEgress) EventName() string { return chanevents.MembershipAddedEventName }

func (h *MembershipAddedEgress) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	ev, err := fwtypes.UnmarshalDomainEvent[chanevents.MembershipAddedPayload](event)
	if err != nil {
		return err
	}
	p := ev.Payload
	out := wire.ChannelMembershipAddedEvent{
		Name:       wire.ChannelMembershipAddedEventName,
		EntityID:   p.ChannelID.String(),
		OwnerID:    p.OwnerID,
		OccurredAt: ev.Time,
		ChannelID:  p.ChannelID.String(),
		GroupID:    p.GroupID,
		MemberID:   p.MemberID,
		IsAdmin:    p.IsAdmin,
		JoinedAt:   p.JoinedAt,
	}
	return h.ext.Publish(ctx, wireEnvelope{wire.ChannelMembershipAddedEventName, p.OwnerID, out})
}

// ── channel.membership_removed → integration.channel.membership_removed ──────────

type MembershipRemovedEgress struct{ ext mediator.ExternalMediator }

func NewMembershipRemovedEgress(ext mediator.ExternalMediator) *MembershipRemovedEgress {
	return &MembershipRemovedEgress{ext: ext}
}

var _ mediator.DomainEventHandler = (*MembershipRemovedEgress)(nil)

func (h *MembershipRemovedEgress) EventName() string { return chanevents.MembershipRemovedEventName }

func (h *MembershipRemovedEgress) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	ev, err := fwtypes.UnmarshalDomainEvent[chanevents.MembershipRemovedPayload](event)
	if err != nil {
		return err
	}
	p := ev.Payload
	out := wire.ChannelMembershipRemovedEvent{
		Name:       wire.ChannelMembershipRemovedEventName,
		EntityID:   p.ChannelID.String(),
		OwnerID:    p.OwnerID,
		OccurredAt: ev.Time,
		ChannelID:  p.ChannelID.String(),
		GroupID:    p.GroupID,
		MemberID:   p.MemberID,
		RemovedAt:  p.RemovedAt,
	}
	return h.ext.Publish(ctx, wireEnvelope{wire.ChannelMembershipRemovedEventName, p.OwnerID, out})
}

// ── channel.presence_updated → integration.channel.presence_updated ──────────────

type PresenceUpdatedEgress struct{ ext mediator.ExternalMediator }

func NewPresenceUpdatedEgress(ext mediator.ExternalMediator) *PresenceUpdatedEgress {
	return &PresenceUpdatedEgress{ext: ext}
}

var _ mediator.DomainEventHandler = (*PresenceUpdatedEgress)(nil)

func (h *PresenceUpdatedEgress) EventName() string { return chanevents.PresenceUpdatedEventName }

func (h *PresenceUpdatedEgress) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	ev, err := fwtypes.UnmarshalDomainEvent[chanevents.PresenceUpdatedPayload](event)
	if err != nil {
		return err
	}
	p := ev.Payload
	out := wire.ChannelPresenceUpdatedEvent{
		Name:        wire.ChannelPresenceUpdatedEventName,
		EntityID:    p.ChannelID.String(),
		OwnerID:     p.OwnerID,
		OccurredAt:  ev.Time,
		ChannelID:   p.ChannelID.String(),
		RemoteID:    p.RemoteID,
		Unavailable: p.Unavailable,
		LastSeen:    p.LastSeen,
		ObservedAt:  p.ObservedAt,
	}
	return h.ext.Publish(ctx, wireEnvelope{wire.ChannelPresenceUpdatedEventName, p.OwnerID, out})
}

// ── channel.chat_presence_updated → integration.channel.chat_presence_updated ────

type ChatPresenceUpdatedEgress struct{ ext mediator.ExternalMediator }

func NewChatPresenceUpdatedEgress(ext mediator.ExternalMediator) *ChatPresenceUpdatedEgress {
	return &ChatPresenceUpdatedEgress{ext: ext}
}

var _ mediator.DomainEventHandler = (*ChatPresenceUpdatedEgress)(nil)

func (h *ChatPresenceUpdatedEgress) EventName() string {
	return chanevents.ChatPresenceUpdatedEventName
}

func (h *ChatPresenceUpdatedEgress) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	ev, err := fwtypes.UnmarshalDomainEvent[chanevents.ChatPresenceUpdatedPayload](event)
	if err != nil {
		return err
	}
	p := ev.Payload
	out := wire.ChannelChatPresenceUpdatedEvent{
		Name:       wire.ChannelChatPresenceUpdatedEventName,
		EntityID:   p.ChannelID.String(),
		OwnerID:    p.OwnerID,
		OccurredAt: ev.Time,
		ChannelID:  p.ChannelID.String(),
		ChatID:     p.ChatID,
		SenderID:   p.SenderID,
		State:      p.State,
		ObservedAt: p.ObservedAt,
	}
	return h.ext.Publish(ctx, wireEnvelope{wire.ChannelChatPresenceUpdatedEventName, p.OwnerID, out})
}

// ── channel.contacts_synced → integration.channel.remotes_synced ─────────────────

type ContactsSyncedEgress struct{ ext mediator.ExternalMediator }

func NewContactsSyncedEgress(ext mediator.ExternalMediator) *ContactsSyncedEgress {
	return &ContactsSyncedEgress{ext: ext}
}

var _ mediator.DomainEventHandler = (*ContactsSyncedEgress)(nil)

func (h *ContactsSyncedEgress) EventName() string { return chanevents.ContactsSyncedEventName }

func (h *ContactsSyncedEgress) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	ev, err := fwtypes.UnmarshalDomainEvent[chanevents.ContactsSyncedPayload](event)
	if err != nil {
		return err
	}
	p := ev.Payload
	out := wire.ChannelRemotesSyncedEvent{
		Name:       wire.ChannelRemotesSyncedEventName,
		EntityID:   p.ChannelID.String(),
		OwnerID:    p.OwnerID,
		OccurredAt: ev.Time,
		ChannelID:  p.ChannelID.String(),
		Total:      p.Total,
		Inserted:   p.Inserted,
	}
	return h.ext.Publish(ctx, wireEnvelope{wire.ChannelRemotesSyncedEventName, p.OwnerID, out})
}

// ── channel.messages_synced → integration.channel.messages_synced ────────────────

type MessagesSyncedEgress struct{ ext mediator.ExternalMediator }

func NewMessagesSyncedEgress(ext mediator.ExternalMediator) *MessagesSyncedEgress {
	return &MessagesSyncedEgress{ext: ext}
}

var _ mediator.DomainEventHandler = (*MessagesSyncedEgress)(nil)

func (h *MessagesSyncedEgress) EventName() string { return chanevents.MessagesSyncedEventName }

func (h *MessagesSyncedEgress) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	ev, err := fwtypes.UnmarshalDomainEvent[chanevents.MessagesSyncedPayload](event)
	if err != nil {
		return err
	}
	p := ev.Payload
	out := wire.ChannelMessagesSyncedEvent{
		Name:       wire.ChannelMessagesSyncedEventName,
		EntityID:   p.ChannelID.String(),
		OwnerID:    p.OwnerID,
		OccurredAt: ev.Time,
		ChannelID:  p.ChannelID.String(),
		Total:      p.Total,
		Inserted:   p.Inserted,
	}
	return h.ext.Publish(ctx, wireEnvelope{wire.ChannelMessagesSyncedEventName, p.OwnerID, out})
}
