package projectors

import (
	"context"
	"log/slog"
	"time"

	channelenums "template/api-go/internal/channel/enums"
	ctxevents "template/api-go/internal/channel/events"
	"template/api-go/internal/channel/projections"
	messagerepo "template/api-go/internal/channel/repositories/message"
	"template/core-go/types"
)

// ──────────────────────────────────────────────────────────────────────────────
// MessageProjector
//
// The single event-driven writer of the messages projection. One projector
// per projection (never one per event — that split is the HANDLER pattern):
// subscribes to every event that mutates a message row — received, sent,
// edited, deleted, delivered, seen — and dispatches internally via a switch
// on the event name, keeping the read-model's whole transition surface in
// one place.
// ──────────────────────────────────────────────────────────────────────────────

type MessageProjector struct {
	repo messagerepo.MessageProjectionRepository
}

func NewMessageProjector(repo messagerepo.MessageProjectionRepository) *MessageProjector {
	return &MessageProjector{repo: repo}
}

// compile-time interface check.
var _ MultiEventProjector = (*MessageProjector)(nil)

// EventNames lists every event this projector subscribes to. RegisterAll fans
// registration out across all of them, delegating each to the same Handle.
func (p *MessageProjector) EventNames() []string {
	return []string{
		ctxevents.MessageReceivedEventName,
		ctxevents.MessageSentEventName,
		ctxevents.MessageEditedEventName,
		ctxevents.MessageDeletedEventName,
		ctxevents.MessageDeliveredEventName,
		ctxevents.MessageSeenEventName,
	}
}

func (p *MessageProjector) Handle(ctx context.Context, event types.DomainEventI) error {
	switch event.GetEventName() {
	case ctxevents.MessageReceivedEventName:
		return p.handleReceived(ctx, event)
	case ctxevents.MessageSentEventName:
		return p.handleSent(ctx, event)
	case ctxevents.MessageEditedEventName:
		return p.handleEdited(ctx, event)
	case ctxevents.MessageDeletedEventName:
		return p.handleDeleted(ctx, event)
	case ctxevents.MessageDeliveredEventName:
		return p.handleDelivered(ctx, event)
	case ctxevents.MessageSeenEventName:
		return p.handleSeen(ctx, event)
	default:
		return nil
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// handleReceived
//
// Inserts an inbound live message row into messages. InsertIfNew is
// idempotent: if the same (channel_id, platform_message_id) already exists the
// insert is a no-op (the UNIQUE index protects deduplication).
// ──────────────────────────────────────────────────────────────────────────────

func (p *MessageProjector) handleReceived(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelMessageReceivedPayload](event)
	if err != nil {
		return err
	}
	pl := e.Payload
	if pl.Platform == string(channelenums.PlatformInternal) {
		return nil
	}
	msg := &projections.Message{
		ID:                pl.InternalMessageID.String(),
		ChannelID:         pl.ChannelID.String(),
		RemoteID:          pl.RemoteID,
		PlatformMessageID: pl.MessageID,
		Direction:         string(channelenums.DirectionReceived),
		Platform:          channelenums.Platform(pl.Platform),
		SenderRemoteID:    pl.SenderID,
		MessageType:       pl.MessageType,
		Content:           pl.Content,
		OccurredAt:        pl.OccurredAt,
		ObservedAt:        pl.ObservedAt,
	}
	inserted, err := p.repo.InsertIfNew(ctx, msg)
	if err != nil {
		return err
	}
	if !inserted {
		slog.Debug("message_received already projected (duplicate)",
			"channelId", pl.ChannelID,
			"messageId", pl.MessageID,
		)
	}
	return nil
}

// ──────────────────────────────────────────────────────────────────────────────
// handleSent
//
// Inserts an outbound live message row into messages. InsertIfNew is
// idempotent — duplicate sends (e.g. multi-device echo) are silently dropped.
// ──────────────────────────────────────────────────────────────────────────────

func (p *MessageProjector) handleSent(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelMessageSentPayload](event)
	if err != nil {
		return err
	}
	pl := e.Payload
	if pl.Platform == channelenums.PlatformInternal {
		return nil
	}
	msg := &projections.Message{
		ID:                pl.InternalMessageID.String(),
		ChannelID:         pl.ChannelID.String(),
		RemoteID:          pl.RemoteID,
		PlatformMessageID: pl.MessageID,
		Direction:         string(channelenums.DirectionSent),
		Platform:          pl.Platform,
		SenderRemoteID:    pl.SenderID,
		MessageType:       pl.MessageType,
		Content:           pl.Content,
		OccurredAt:        pl.OccurredAt,
		ObservedAt:        pl.ObservedAt,
	}
	inserted, err := p.repo.InsertIfNew(ctx, msg)
	if err != nil {
		return err
	}
	if !inserted {
		slog.Debug("message_sent already projected (duplicate)",
			"channelId", pl.ChannelID,
			"messageId", pl.MessageID,
		)
	}
	return nil
}

// ──────────────────────────────────────────────────────────────────────────────
// handleEdited
//
// Looks up the projection row by platform message ID, then applies the content
// revision. If the row is absent (e.g. edit arrived before the original insert
// during a replay), logs a warning and returns nil.
// ──────────────────────────────────────────────────────────────────────────────

func (p *MessageProjector) handleEdited(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelMessageEditedPayload](event)
	if err != nil {
		return err
	}
	pl := e.Payload
	row, err := p.repo.FindByPlatformID(ctx, pl.ChannelID.String(), pl.MessageID)
	if err != nil {
		return err
	}
	if row == nil {
		slog.Warn("message not found for edit projection",
			"channelId", pl.ChannelID,
			"messageId", pl.MessageID,
		)
		return nil
	}
	editedAt := time.Unix(pl.Timestamp, 0).UTC()
	row.ApplyEdited(pl.Content, editedAt)
	return p.repo.Save(ctx, row)
}

// ──────────────────────────────────────────────────────────────────────────────
// handleDeleted
//
// Soft-deletes a message row by recording deleted_at. The row is kept for
// audit — only the read query filters it out.
// ──────────────────────────────────────────────────────────────────────────────

func (p *MessageProjector) handleDeleted(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelMessageDeletedPayload](event)
	if err != nil {
		return err
	}
	pl := e.Payload
	row, err := p.repo.FindByPlatformID(ctx, pl.ChannelID.String(), pl.MessageID)
	if err != nil {
		return err
	}
	if row == nil {
		slog.Warn("message not found for delete projection",
			"channelId", pl.ChannelID,
			"messageId", pl.MessageID,
		)
		return nil
	}
	row.ApplySoftDelete(time.Now().UTC())
	return p.repo.Save(ctx, row)
}

// ──────────────────────────────────────────────────────────────────────────────
// handleDelivered
//
// Marks each message in MessageIDs as delivered using the atomic UpdateDelivered
// operation. The payload may also carry a watermark Timestamp but this branch
// only processes explicit MessageIDs. Watermark-only receipts (empty MessageIDs)
// are skipped — the payload does not provide enough information to resolve which
// rows to update without a range query the repository does not expose.
// ──────────────────────────────────────────────────────────────────────────────

func (p *MessageProjector) handleDelivered(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelMessageDeliveredPayload](event)
	if err != nil {
		return err
	}
	pl := e.Payload
	if len(pl.MessageIDs) == 0 {
		// Watermark-only receipt — no specific message IDs to resolve.
		slog.Debug("message_delivered carries no message IDs (watermark-only) — skipping projection",
			"channelId", pl.ChannelID,
			"remoteId", pl.RemoteID,
		)
		return nil
	}
	deliveredAt := time.Unix(pl.Timestamp, 0).UTC()
	// MessageIDs is typically 1–20 per receipt event. Two roundtrips per ID
	// (FindByPlatformID + UpdateDelivered) is acceptable at current scale.
	// TODO: batch via UpdateDeliveredBatch / UpdateSeenBatch if this becomes a bottleneck.
	for _, platformMsgID := range pl.MessageIDs {
		row, err := p.repo.FindByPlatformID(ctx, pl.ChannelID.String(), platformMsgID)
		if err != nil {
			return err
		}
		if row == nil {
			slog.Debug("message not found for delivered projection (may not be projected yet)",
				"channelId", pl.ChannelID,
				"messageId", platformMsgID,
			)
			continue
		}
		if err := p.repo.UpdateDelivered(ctx, row.ID, deliveredAt); err != nil {
			return err
		}
	}
	return nil
}

// ──────────────────────────────────────────────────────────────────────────────
// handleSeen
//
// Marks each message in MessageIDs as seen using the atomic UpdateSeen operation.
// Same watermark-only caveat as handleDelivered applies.
// ──────────────────────────────────────────────────────────────────────────────

func (p *MessageProjector) handleSeen(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelMessageSeenPayload](event)
	if err != nil {
		return err
	}
	pl := e.Payload
	if len(pl.MessageIDs) == 0 {
		slog.Debug("message_seen carries no message IDs (watermark-only) — skipping projection",
			"channelId", pl.ChannelID,
			"remoteId", pl.RemoteID,
		)
		return nil
	}
	seenAt := time.Unix(pl.Timestamp, 0).UTC()
	// MessageIDs is typically 1–20 per receipt event. Two roundtrips per ID
	// (FindByPlatformID + UpdateSeen) is acceptable at current scale.
	// TODO: batch via UpdateDeliveredBatch / UpdateSeenBatch if this becomes a bottleneck.
	for _, platformMsgID := range pl.MessageIDs {
		row, err := p.repo.FindByPlatformID(ctx, pl.ChannelID.String(), platformMsgID)
		if err != nil {
			return err
		}
		if row == nil {
			slog.Debug("message not found for seen projection (may not be projected yet)",
				"channelId", pl.ChannelID,
				"messageId", platformMsgID,
			)
			continue
		}
		if err := p.repo.UpdateSeen(ctx, row.ID, seenAt); err != nil {
			return err
		}
	}
	return nil
}
