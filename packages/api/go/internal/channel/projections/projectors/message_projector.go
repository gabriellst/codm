package projectors

import (
	"context"
	"log/slog"
	"time"

	channelenums "template/api-go/internal/channel/enums"
	ctxevents "template/api-go/internal/channel/events"
	"template/api-go/internal/channel/projections"
	messagerepo "template/api-go/internal/channel/repositories/message"
	sharedenums "template/api-go/internal/shared/enums"
	"template/api-go/internal/shared/services/mediator"
	"template/api-go/internal/shared/types"
)

// ──────────────────────────────────────────────────────────────────────────────
// MessageReceivedProjector
//
// Inserts an inbound live message row into messages. InsertIfNew is
// idempotent: if the same (channel_id, platform_message_id) already exists the
// insert is a no-op (the UNIQUE index protects deduplication).
// ──────────────────────────────────────────────────────────────────────────────

type MessageReceivedProjector struct {
	repo messagerepo.MessageProjectionRepository
}

func NewMessageReceivedProjector(repo messagerepo.MessageProjectionRepository) *MessageReceivedProjector {
	return &MessageReceivedProjector{repo: repo}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*MessageReceivedProjector)(nil)

func (p *MessageReceivedProjector) EventName() string { return ctxevents.MessageReceivedEventName }

func (p *MessageReceivedProjector) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelMessageReceivedPayload](event)
	if err != nil {
		return err
	}
	pl := e.Payload
	if pl.Platform == sharedenums.PlatformInternal {
		return nil
	}
	msg := &projections.Message{
		ID:                pl.InternalMessageID.String(),
		ChannelID:         pl.ChannelID.String(),
		RemoteID:          pl.RemoteID,
		PlatformMessageID: pl.MessageID,
		Direction:         string(channelenums.DirectionReceived),
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
		slog.Debug("message_received already projected (duplicate)",
			"channelId", pl.ChannelID,
			"messageId", pl.MessageID,
		)
	}
	return nil
}

// ──────────────────────────────────────────────────────────────────────────────
// MessageSentProjector
//
// Inserts an outbound live message row into messages. InsertIfNew is
// idempotent — duplicate sends (e.g. multi-device echo) are silently dropped.
// ──────────────────────────────────────────────────────────────────────────────

type MessageSentProjector struct {
	repo messagerepo.MessageProjectionRepository
}

func NewMessageSentProjector(repo messagerepo.MessageProjectionRepository) *MessageSentProjector {
	return &MessageSentProjector{repo: repo}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*MessageSentProjector)(nil)

func (p *MessageSentProjector) EventName() string { return ctxevents.MessageSentEventName }

func (p *MessageSentProjector) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelMessageSentPayload](event)
	if err != nil {
		return err
	}
	pl := e.Payload
	if pl.Platform == sharedenums.PlatformInternal {
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
// MessageEditedProjector
//
// Looks up the projection row by platform message ID, then applies the content
// revision. If the row is absent (e.g. edit arrived before the original insert
// during a replay), logs a warning and returns nil.
// ──────────────────────────────────────────────────────────────────────────────

type MessageEditedProjector struct {
	repo messagerepo.MessageProjectionRepository
}

func NewMessageEditedProjector(repo messagerepo.MessageProjectionRepository) *MessageEditedProjector {
	return &MessageEditedProjector{repo: repo}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*MessageEditedProjector)(nil)

func (p *MessageEditedProjector) EventName() string { return ctxevents.MessageEditedEventName }

func (p *MessageEditedProjector) Handle(ctx context.Context, event types.DomainEventI) error {
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
// MessageDeletedProjector
//
// Soft-deletes a message row by recording deleted_at. The row is kept for
// audit — only the read query filters it out.
// ──────────────────────────────────────────────────────────────────────────────

type MessageDeletedProjector struct {
	repo messagerepo.MessageProjectionRepository
}

func NewMessageDeletedProjector(repo messagerepo.MessageProjectionRepository) *MessageDeletedProjector {
	return &MessageDeletedProjector{repo: repo}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*MessageDeletedProjector)(nil)

func (p *MessageDeletedProjector) EventName() string { return ctxevents.MessageDeletedEventName }

func (p *MessageDeletedProjector) Handle(ctx context.Context, event types.DomainEventI) error {
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
// MessageDeliveredProjector
//
// Marks each message in MessageIDs as delivered using the atomic UpdateDelivered
// operation. The payload may also carry a watermark Timestamp but this projector
// only processes explicit MessageIDs. Watermark-only receipts (empty MessageIDs)
// are skipped — the payload does not provide enough information to resolve which
// rows to update without a range query the repository does not expose.
// ──────────────────────────────────────────────────────────────────────────────

type MessageDeliveredProjector struct {
	repo messagerepo.MessageProjectionRepository
}

func NewMessageDeliveredProjector(repo messagerepo.MessageProjectionRepository) *MessageDeliveredProjector {
	return &MessageDeliveredProjector{repo: repo}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*MessageDeliveredProjector)(nil)

func (p *MessageDeliveredProjector) EventName() string { return ctxevents.MessageDeliveredEventName }

func (p *MessageDeliveredProjector) Handle(ctx context.Context, event types.DomainEventI) error {
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
// MessageSeenProjector
//
// Marks each message in MessageIDs as seen using the atomic UpdateSeen operation.
// Same watermark-only caveat as MessageDeliveredProjector applies.
// ──────────────────────────────────────────────────────────────────────────────

type MessageSeenProjector struct {
	repo messagerepo.MessageProjectionRepository
}

func NewMessageSeenProjector(repo messagerepo.MessageProjectionRepository) *MessageSeenProjector {
	return &MessageSeenProjector{repo: repo}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*MessageSeenProjector)(nil)

func (p *MessageSeenProjector) EventName() string { return ctxevents.MessageSeenEventName }

func (p *MessageSeenProjector) Handle(ctx context.Context, event types.DomainEventI) error {
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
