package projectors

import (
	"context"
	"log/slog"
	"time"

	chanevents "template/api-go/internal/channel/events"
	"template/api-go/internal/channel/projections"
	messagerepo "template/api-go/internal/channel/repositories/message"
	"template/contracts-go/wire"
	"template/core-go/services/mediator"
	fwtypes "template/core-go/types"
)

// message_projector.go keeps the gateway.messages read model fresh from the
// read-model domain facts. Ported from the medscall channel message projectors,
// adapted to CodeDM's mediator.DomainEventHandler seam.

// ── MessageReceivedProjector ─────────────────────────────────────────────────────
//
// Inserts an inbound live message row into gateway.messages. InsertIfNew is
// idempotent: a duplicate (channel_id, platform_message_id) is a no-op.

type MessageReceivedProjector struct {
	repo messagerepo.MessageProjectionRepository
}

func NewMessageReceivedProjector(repo messagerepo.MessageProjectionRepository) *MessageReceivedProjector {
	return &MessageReceivedProjector{repo: repo}
}

var _ mediator.DomainEventHandler = (*MessageReceivedProjector)(nil)

func (p *MessageReceivedProjector) EventName() string { return chanevents.MessageReceivedEventName }

func (p *MessageReceivedProjector) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	e, err := fwtypes.UnmarshalDomainEvent[chanevents.MessageReceivedPayload](event)
	if err != nil {
		return err
	}
	pl := e.Payload
	msg := &projections.Message{
		ID:                pl.InternalMessageID.String(),
		ChannelID:         pl.ChannelID.String(),
		RemoteID:          pl.RemoteID,
		PlatformMessageID: pl.MessageID,
		Direction:         string(wire.DirectionRECEIVED),
		Platform:          pl.Kind,
		SenderRemoteID:    pl.SenderID,
		Content:           pl.Content,
		OccurredAt:        pl.ReceivedAt,
		ObservedAt:        pl.ObservedAt,
	}
	inserted, err := p.repo.InsertIfNew(ctx, msg)
	if err != nil {
		return err
	}
	if !inserted {
		slog.Debug("message_received already projected (duplicate)",
			"channelId", pl.ChannelID, "messageId", pl.MessageID)
	}
	return nil
}

// ── MessageSentProjector ─────────────────────────────────────────────────────────
//
// Inserts an outbound live message row into gateway.messages. InsertIfNew is
// idempotent — duplicate sends (multi-device echo) are silently dropped.

type MessageSentProjector struct {
	repo messagerepo.MessageProjectionRepository
}

func NewMessageSentProjector(repo messagerepo.MessageProjectionRepository) *MessageSentProjector {
	return &MessageSentProjector{repo: repo}
}

var _ mediator.DomainEventHandler = (*MessageSentProjector)(nil)

func (p *MessageSentProjector) EventName() string { return chanevents.MessageSentEventName }

func (p *MessageSentProjector) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	e, err := fwtypes.UnmarshalDomainEvent[chanevents.MessageSentPayload](event)
	if err != nil {
		return err
	}
	pl := e.Payload
	msg := &projections.Message{
		ID:                pl.InternalMessageID.String(),
		ChannelID:         pl.ChannelID.String(),
		RemoteID:          pl.RemoteID,
		PlatformMessageID: pl.MessageID,
		Direction:         string(wire.DirectionSENT),
		Platform:          pl.Platform,
		SenderRemoteID:    pl.SenderID,
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
			"channelId", pl.ChannelID, "messageId", pl.MessageID)
	}
	return nil
}

// ── MessageEditedProjector ───────────────────────────────────────────────────────
//
// Looks up the projection row by platform message ID, then overlays the content
// revision. Absent row (edit before insert) logs a warning and returns nil.

type MessageEditedProjector struct {
	repo messagerepo.MessageProjectionRepository
}

func NewMessageEditedProjector(repo messagerepo.MessageProjectionRepository) *MessageEditedProjector {
	return &MessageEditedProjector{repo: repo}
}

var _ mediator.DomainEventHandler = (*MessageEditedProjector)(nil)

func (p *MessageEditedProjector) EventName() string { return chanevents.MessageEditedEventName }

func (p *MessageEditedProjector) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	e, err := fwtypes.UnmarshalDomainEvent[chanevents.MessageEditedPayload](event)
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
			"channelId", pl.ChannelID, "messageId", pl.MessageID)
		return nil
	}
	editedAt := time.Unix(pl.Timestamp, 0).UTC()
	row.ApplyEdited(pl.Content, editedAt)
	return p.repo.Save(ctx, row)
}

// ── MessageDeletedProjector ──────────────────────────────────────────────────────
//
// Soft-deletes a message row by stamping deleted_at. The row is kept for audit —
// only the read query filters it out.

type MessageDeletedProjector struct {
	repo messagerepo.MessageProjectionRepository
}

func NewMessageDeletedProjector(repo messagerepo.MessageProjectionRepository) *MessageDeletedProjector {
	return &MessageDeletedProjector{repo: repo}
}

var _ mediator.DomainEventHandler = (*MessageDeletedProjector)(nil)

func (p *MessageDeletedProjector) EventName() string { return chanevents.MessageDeletedEventName }

func (p *MessageDeletedProjector) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	e, err := fwtypes.UnmarshalDomainEvent[chanevents.MessageDeletedPayload](event)
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
			"channelId", pl.ChannelID, "messageId", pl.MessageID)
		return nil
	}
	row.ApplySoftDelete(time.Now().UTC())
	return p.repo.Save(ctx, row)
}

// ── MessageDeliveredProjector ────────────────────────────────────────────────────
//
// Marks each message in MessageIDs delivered via the atomic UpdateDelivered.
// Watermark-only receipts (empty MessageIDs) are skipped.

type MessageDeliveredProjector struct {
	repo messagerepo.MessageProjectionRepository
}

func NewMessageDeliveredProjector(repo messagerepo.MessageProjectionRepository) *MessageDeliveredProjector {
	return &MessageDeliveredProjector{repo: repo}
}

var _ mediator.DomainEventHandler = (*MessageDeliveredProjector)(nil)

func (p *MessageDeliveredProjector) EventName() string { return chanevents.MessageDeliveredEventName }

func (p *MessageDeliveredProjector) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	e, err := fwtypes.UnmarshalDomainEvent[chanevents.MessageDeliveredPayload](event)
	if err != nil {
		return err
	}
	pl := e.Payload
	if len(pl.MessageIDs) == 0 {
		slog.Debug("message_delivered carries no message IDs (watermark-only) — skipping projection",
			"channelId", pl.ChannelID, "remoteId", pl.RemoteID)
		return nil
	}
	deliveredAt := time.Unix(pl.Timestamp, 0).UTC()
	for _, platformMsgID := range pl.MessageIDs {
		row, err := p.repo.FindByPlatformID(ctx, pl.ChannelID.String(), platformMsgID)
		if err != nil {
			return err
		}
		if row == nil {
			slog.Debug("message not found for delivered projection (may not be projected yet)",
				"channelId", pl.ChannelID, "messageId", platformMsgID)
			continue
		}
		if err := p.repo.UpdateDelivered(ctx, row.ID, deliveredAt); err != nil {
			return err
		}
	}
	return nil
}

// ── MessageSeenProjector ─────────────────────────────────────────────────────────
//
// Marks each message in MessageIDs seen via the atomic UpdateSeen. Same
// watermark-only caveat as MessageDeliveredProjector.

type MessageSeenProjector struct {
	repo messagerepo.MessageProjectionRepository
}

func NewMessageSeenProjector(repo messagerepo.MessageProjectionRepository) *MessageSeenProjector {
	return &MessageSeenProjector{repo: repo}
}

var _ mediator.DomainEventHandler = (*MessageSeenProjector)(nil)

func (p *MessageSeenProjector) EventName() string { return chanevents.MessageSeenEventName }

func (p *MessageSeenProjector) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	e, err := fwtypes.UnmarshalDomainEvent[chanevents.MessageSeenPayload](event)
	if err != nil {
		return err
	}
	pl := e.Payload
	if len(pl.MessageIDs) == 0 {
		slog.Debug("message_seen carries no message IDs (watermark-only) — skipping projection",
			"channelId", pl.ChannelID, "remoteId", pl.RemoteID)
		return nil
	}
	seenAt := time.Unix(pl.Timestamp, 0).UTC()
	for _, platformMsgID := range pl.MessageIDs {
		row, err := p.repo.FindByPlatformID(ctx, pl.ChannelID.String(), platformMsgID)
		if err != nil {
			return err
		}
		if row == nil {
			slog.Debug("message not found for seen projection (may not be projected yet)",
				"channelId", pl.ChannelID, "messageId", platformMsgID)
			continue
		}
		if err := p.repo.UpdateSeen(ctx, row.ID, seenAt); err != nil {
			return err
		}
	}
	return nil
}
