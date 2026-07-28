package handlers

import (
	"context"
	"log/slog"

	msgenums "template/api-go/internal/channel/enums"
	ctxevents "template/api-go/internal/channel/events"
	"template/api-go/internal/channel/services/registry"
	"template/contracts-go/wire"
	"template/core-go/services/mediator"
	"template/core-go/types"
)

// MessageSentHandler republishes channel.message_sent as an INBOUND integration event, so a message
// the owner typed themselves is HEARD rather than merely stored.
//
// # Why this bridges onto the RECEIVED event rather than the sent one
//
// Both exist on the wire, but only one is consumed: the TS side has an ingestion pipeline behind
// `integration.channel_message.received` (dedup ledger → thread routing → transcript → invocation
// gates → classification), and a message the owner typed needs every one of those legs. Publishing
// `integration.channel_message.sent` instead would mean a second consumer duplicating all of it, for
// a message that differs from an inbound one in exactly two facts — both of which the received
// payload already has fields for:
//
//	FromMe = true   — whose ACCOUNT it came from. The field has existed since the contract was
//	                  written and the mapper hardcodes it to false, so it has always been dead.
//	Author = HUMAN  — whose HAND wrote it. Says nothing yet, because this product cannot send; it
//	                  becomes load-bearing the moment it can, since FromMe alone will no longer
//	                  separate the owner typing from the product replying.
//
// # What this handler deliberately does NOT do
//
// It does not attempt to tell an owner-typed message from an echo of a message this product sent.
// It cannot: `mapper.message.go` raises this event for BOTH, and the emit site that knows the truth
// is the send path, not here. Today that ambiguity is empty — nothing in the product can make it
// send — and the honest guard belongs with the send path when it lands, keyed on the message id
// rather than guessed at here.
type MessageSentHandler struct {
	externalMediator mediator.ExternalMediator
	registry         registry.ChannelRegistry
}

func NewMessageSentHandler(ext mediator.ExternalMediator, reg registry.ChannelRegistry) *MessageSentHandler {
	return &MessageSentHandler{externalMediator: ext, registry: reg}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*MessageSentHandler)(nil)

func (h *MessageSentHandler) EventName() string {
	return ctxevents.MessageSentEventName
}

func (h *MessageSentHandler) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelMessageSentPayload](event)
	if err != nil {
		return err
	}

	sent := e.Payload
	inbound := ctxevents.ChannelMessageReceivedPayload{
		ChannelID:         sent.ChannelID,
		MessageID:         sent.MessageID,
		InternalMessageID: sent.InternalMessageID,
		RemoteID:          sent.RemoteID,
		SenderID:          sent.SenderID,
		FromMe:            true,
		Author:            msgenums.MessageAuthorHuman,
		IsGroup:           sent.IsGroup,
		Timestamp:         sent.Timestamp,
		OccurredAt:        sent.OccurredAt,
		ObservedAt:        sent.ObservedAt,
		MessageType:       sent.MessageType,
		Content:           sent.Content,
		// A cast, because the RECEIVED contract types platform as a bare string while the SENT payload
		// has it as ChannelKind. Seven contracts still carry `platform: string` under a doc comment
		// claiming reconciliation with ChannelKind is deferred because that enum lacks INTERNAL — it does
		// not (channel-kind.tsp declares exactly WHATSAPP and INTERNAL). Own ticket, not this one.
		Platform:     string(sent.Platform),
		PlatformData: sent.PlatformData,
		OwnerID:      sent.OwnerID,
	}

	// Mirrors MessageReceivedHandler: the registry is the only place that knows whether a remote id
	// is a group, and the projection's own IsGroup can be stale for a chat observed before the
	// snapshot landed.
	if ch, ok := h.registry.Get(inbound.ChannelID); ok {
		inbound.IsGroup = ch.IsGroupJID(inbound.RemoteID)
	} else {
		slog.Warn("message_sent: channel not in registry, IsGroup may be inaccurate", "channelId", inbound.ChannelID)
	}

	integrationEvent := types.NewIntegrationEvent(wire.ChannelMessageReceivedEventName, e.OwnerID, inbound)
	if err := h.externalMediator.Publish(ctx, integrationEvent); err != nil {
		slog.Error("failed to publish own-message integration event",
			"error", err,
			"channelId", inbound.ChannelID,
			"messageId", inbound.MessageID,
		)
		return err
	}
	return nil
}
