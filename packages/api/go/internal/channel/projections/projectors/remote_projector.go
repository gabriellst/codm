package projectors

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	channelenums "template/api-go/internal/channel/enums"
	ctxevents "template/api-go/internal/channel/events"
	"template/api-go/internal/channel/projections"
	channelrepo "template/api-go/internal/channel/repositories/channel"
	messagerepo "template/api-go/internal/channel/repositories/message"
	remoterepo "template/api-go/internal/channel/repositories/remote"
	"template/core-go/types"
)

// applyToRemote is a shared helper that encapsulates the find → nil-warn →
// mutate → UpdatedAt → save pattern used by most remote projectors.
func applyToRemote(
	ctx context.Context,
	repo remoterepo.RemoteProjectionRepository,
	channelID, remoteID, logLabel string,
	mutate func(*projections.Remote),
) error {
	row, err := repo.Find(ctx, channelID, remoteID)
	if err != nil {
		return err
	}
	if row == nil {
		slog.Warn("remote not found for "+logLabel+" projection",
			"channelId", channelID, "remoteId", remoteID)
		return nil
	}
	mutate(row)
	row.UpdatedAt = time.Now().UTC()
	return repo.Save(ctx, row)
}

// ──────────────────────────────────────────────────────────────────────────────
// RemoteProjector
//
// The single event-driven writer of the remotes projection. All fourteen
// events below — including the cross-aggregate message_received/sent/deleted
// events, which advance last-message/unread state on the remote row — target
// the SAME projection repository (RemoteProjectionRepository), so they own
// one struct rather than one per event. One projector per projection (never
// one per event — that split is the HANDLER pattern): dispatches internally
// via a switch on the event name, keeping the read-model's whole transition
// surface in one place.
//
// channelRepo and msgRepo are read-only lookups that feed a write into THIS
// same projection (platform resolution for RemoteUpdated stubs; internal
// message id resolution for RemoteOnMessageDeleted) — they do not make this a
// second projection.
// ──────────────────────────────────────────────────────────────────────────────

type RemoteProjector struct {
	repo        remoterepo.RemoteProjectionRepository
	channelRepo channelrepo.ChannelRepository
	msgRepo     messagerepo.MessageProjectionRepository
}

// NewRemoteProjector takes the channel repository (platform resolution for the
// RemoteUpdated stub path) and the message projection repository (internal id
// resolution for RemoteOnMessageDeleted) in addition to the remotes projection
// repository itself.
func NewRemoteProjector(
	repo remoterepo.RemoteProjectionRepository,
	channelRepo channelrepo.ChannelRepository,
	msgRepo messagerepo.MessageProjectionRepository,
) *RemoteProjector {
	return &RemoteProjector{repo: repo, channelRepo: channelRepo, msgRepo: msgRepo}
}

// compile-time interface check.
var _ MultiEventProjector = (*RemoteProjector)(nil)

// EventNames lists every event this projector subscribes to.
func (p *RemoteProjector) EventNames() []string {
	return []string{
		ctxevents.RemoteCreatedEventName,
		ctxevents.RemoteDeletedEventName,
		ctxevents.RemoteUpdatedEventName,
		ctxevents.RemotePinnedEventName,
		ctxevents.RemoteUnpinnedEventName,
		ctxevents.RemoteArchivedEventName,
		ctxevents.RemoteUnarchivedEventName,
		ctxevents.RemoteMutedEventName,
		ctxevents.RemoteUnmutedEventName,
		ctxevents.RemoteMarkedAsUnreadEventName,
		ctxevents.RemoteChatSeenEventName,
		ctxevents.MessageReceivedEventName,
		ctxevents.MessageSentEventName,
		ctxevents.MessageDeletedEventName,
	}
}

func (p *RemoteProjector) Handle(ctx context.Context, event types.DomainEventI) error {
	switch event.GetEventName() {
	case ctxevents.RemoteCreatedEventName:
		return p.handleCreated(ctx, event)
	case ctxevents.RemoteDeletedEventName:
		return p.handleDeleted(ctx, event)
	case ctxevents.RemoteUpdatedEventName:
		return p.handleUpdated(ctx, event)
	case ctxevents.RemotePinnedEventName:
		return p.handlePinned(ctx, event)
	case ctxevents.RemoteUnpinnedEventName:
		return p.handleUnpinned(ctx, event)
	case ctxevents.RemoteArchivedEventName:
		return p.handleArchived(ctx, event)
	case ctxevents.RemoteUnarchivedEventName:
		return p.handleUnarchived(ctx, event)
	case ctxevents.RemoteMutedEventName:
		return p.handleMuted(ctx, event)
	case ctxevents.RemoteUnmutedEventName:
		return p.handleUnmuted(ctx, event)
	case ctxevents.RemoteMarkedAsUnreadEventName:
		return p.handleMarkedAsUnread(ctx, event)
	case ctxevents.RemoteChatSeenEventName:
		return p.handleChatSeen(ctx, event)
	case ctxevents.MessageReceivedEventName:
		return p.handleOnMessageReceived(ctx, event)
	case ctxevents.MessageSentEventName:
		return p.handleOnMessageSent(ctx, event)
	case ctxevents.MessageDeletedEventName:
		return p.handleOnMessageDeleted(ctx, event)
	default:
		return nil
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// handleCreated
//
// Upserts a minimal row into remotes when a new Remote aggregate is
// first constructed. Name, AvatarURL, and other mirror fields arrive later via
// remote_updated events.
// ──────────────────────────────────────────────────────────────────────────────

func (p *RemoteProjector) handleCreated(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelRemoteCreatedPayload](event)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	row := &projections.Remote{
		ChannelID: e.Payload.ChannelID.String(),
		RemoteID:  e.Payload.RemoteID,
		Type:      string(e.Payload.RemoteType),
		Platform:  e.Payload.Platform,
		CreatedAt: now,
		UpdatedAt: now,
	}
	inserted, err := p.repo.InsertIfNew(ctx, row)
	if err != nil {
		return err
	}
	if !inserted {
		slog.Debug("remote already exists — created event is a no-op",
			"channelId", e.Payload.ChannelID,
			"remoteId", e.Payload.RemoteID,
		)
	}
	return nil
}

// ──────────────────────────────────────────────────────────────────────────────
// handleDeleted
//
// Sets deleted_at on the projection row when the Remote aggregate is soft-deleted.
// ──────────────────────────────────────────────────────────────────────────────

func (p *RemoteProjector) handleDeleted(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelRemoteDeletedPayload](event)
	if err != nil {
		return err
	}
	row, err := p.repo.Find(ctx, e.Payload.ChannelID.String(), e.Payload.RemoteID)
	if err != nil {
		return err
	}
	if row == nil {
		slog.Warn("remote not found for delete projection",
			"channelId", e.Payload.ChannelID,
			"remoteId", e.Payload.RemoteID,
		)
		return nil
	}
	row.DeletedAt = &e.Payload.At
	row.UpdatedAt = time.Now().UTC()
	return p.repo.Save(ctx, row)
}

// ──────────────────────────────────────────────────────────────────────────────
// handleUpdated
//
// Applies mirror fields (name, description is not stored in projection) that
// arrive from a live profile change or bootstrap observation.
// ──────────────────────────────────────────────────────────────────────────────

func (p *RemoteProjector) handleUpdated(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelRemoteUpdatedPayload](event)
	if err != nil {
		return err
	}
	row, err := p.repo.Find(ctx, e.Payload.ChannelID.String(), e.Payload.RemoteID)
	if err != nil {
		return err
	}
	if row == nil {
		slog.Warn("remote not found for updated projection — creating stub",
			"channelId", e.Payload.ChannelID,
			"remoteId", e.Payload.RemoteID,
		)
		// ChannelRemoteUpdatedPayload does not carry Platform, and the column is a
		// closed set (CHECK platform IN (...)) — an empty string is REJECTED by the
		// store, which would drop the whole stub write. Resolve it from the owning
		// channel, the authoritative source: a remote's platform is its channel's.
		platform, err := p.resolvePlatform(ctx, e.Payload.ChannelID.String())
		if err != nil {
			return err
		}
		now := time.Now().UTC()
		row = &projections.Remote{
			ChannelID: e.Payload.ChannelID.String(),
			RemoteID:  e.Payload.RemoteID,
			Type:      string(e.Payload.Type),
			Platform:  platform,
			CreatedAt: now,
		}
	}
	// Apply the fields carried by this event.
	row.Name = e.Payload.Name
	row.Type = string(e.Payload.Type)
	row.UpdatedAt = time.Now().UTC()
	return p.repo.Save(ctx, row)
}

// resolvePlatform reads the owning channel's platform. A missing channel is a
// hard error rather than a silent empty write: without it the row cannot satisfy
// the platform CHECK, so failing here lets the outbox retry (the channel row may
// simply not be committed yet) instead of poisoning the projection.
func (p *RemoteProjector) resolvePlatform(ctx context.Context, channelID string) (channelenums.Platform, error) {
	ch, err := p.channelRepo.Find(ctx, channelID)
	if err != nil {
		return "", err
	}
	if ch == nil {
		return "", fmt.Errorf("remote updated projector: channel %s not found — cannot resolve platform for stub remote", channelID)
	}
	return ch.Platform, nil
}

// ──────────────────────────────────────────────────────────────────────────────
// handlePinned
// ──────────────────────────────────────────────────────────────────────────────

func (p *RemoteProjector) handlePinned(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelRemotePinnedPayload](event)
	if err != nil {
		return err
	}
	return applyToRemote(ctx, p.repo, e.Payload.ChannelID.String(), e.Payload.RemoteID, "pin",
		func(r *projections.Remote) { r.ApplyPinned(e.Payload.At) },
	)
}

// ──────────────────────────────────────────────────────────────────────────────
// handleUnpinned
// ──────────────────────────────────────────────────────────────────────────────

func (p *RemoteProjector) handleUnpinned(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelRemoteUnpinnedPayload](event)
	if err != nil {
		return err
	}
	return applyToRemote(ctx, p.repo, e.Payload.ChannelID.String(), e.Payload.RemoteID, "unpin",
		func(r *projections.Remote) { r.ApplyUnpinned() },
	)
}

// ──────────────────────────────────────────────────────────────────────────────
// handleArchived
// ──────────────────────────────────────────────────────────────────────────────

func (p *RemoteProjector) handleArchived(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelRemoteArchivedPayload](event)
	if err != nil {
		return err
	}
	return applyToRemote(ctx, p.repo, e.Payload.ChannelID.String(), e.Payload.RemoteID, "archive",
		func(r *projections.Remote) { r.ApplyArchived() },
	)
}

// ──────────────────────────────────────────────────────────────────────────────
// handleUnarchived
// ──────────────────────────────────────────────────────────────────────────────

func (p *RemoteProjector) handleUnarchived(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelRemoteUnarchivedPayload](event)
	if err != nil {
		return err
	}
	return applyToRemote(ctx, p.repo, e.Payload.ChannelID.String(), e.Payload.RemoteID, "unarchive",
		func(r *projections.Remote) { r.ApplyUnarchived() },
	)
}

// ──────────────────────────────────────────────────────────────────────────────
// handleMuted
// ──────────────────────────────────────────────────────────────────────────────

func (p *RemoteProjector) handleMuted(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelRemoteMutedPayload](event)
	if err != nil {
		return err
	}
	return applyToRemote(ctx, p.repo, e.Payload.ChannelID.String(), e.Payload.RemoteID, "mute",
		func(r *projections.Remote) {
			// MutedUntil nil means "muted forever" — use a far-future sentinel so the
			// projection reflects the mute state without a NULL mute_expiration.
			until := e.Payload.MutedUntil
			if until == nil {
				forever := time.Date(9999, 12, 31, 23, 59, 59, 0, time.UTC)
				until = &forever
			}
			r.ApplyMuted(*until)
		},
	)
}

// ──────────────────────────────────────────────────────────────────────────────
// handleUnmuted
// ──────────────────────────────────────────────────────────────────────────────

func (p *RemoteProjector) handleUnmuted(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelRemoteUnmutedPayload](event)
	if err != nil {
		return err
	}
	return applyToRemote(ctx, p.repo, e.Payload.ChannelID.String(), e.Payload.RemoteID, "unmute",
		func(r *projections.Remote) { r.ApplyUnmuted() },
	)
}

// ──────────────────────────────────────────────────────────────────────────────
// handleMarkedAsUnread
// ──────────────────────────────────────────────────────────────────────────────

func (p *RemoteProjector) handleMarkedAsUnread(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelRemoteMarkedAsUnreadPayload](event)
	if err != nil {
		return err
	}
	return applyToRemote(ctx, p.repo, e.Payload.ChannelID.String(), e.Payload.RemoteID, "mark-as-unread",
		func(r *projections.Remote) { r.ApplyMarkedAsUnread() },
	)
}

// ──────────────────────────────────────────────────────────────────────────────
// handleChatSeen
//
// Clears unread state when the user opens the chat. Uses ApplyChatSeen which
// zeroes both UnreadMessageCount and MarkedAsUnread.
// ──────────────────────────────────────────────────────────────────────────────

func (p *RemoteProjector) handleChatSeen(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelRemoteChatSeenPayload](event)
	if err != nil {
		return err
	}
	return applyToRemote(ctx, p.repo, e.Payload.ChannelID.String(), e.Payload.RemoteID, "chat-seen",
		func(r *projections.Remote) { r.ApplyChatSeen() },
	)
}

// ──────────────────────────────────────────────────────────────────────────────
// handleOnMessageReceived
//
// Cross-aggregate: reacts to message_received to bump unread count and advance
// last_message_at. Uses atomic repository methods to avoid read-modify-write
// races when multiple messages arrive concurrently.
// ──────────────────────────────────────────────────────────────────────────────

func (p *RemoteProjector) handleOnMessageReceived(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelMessageReceivedPayload](event)
	if err != nil {
		return err
	}
	channelID := e.Payload.ChannelID.String()
	remoteID := e.Payload.RemoteID

	// ApplyLatestMessage handles the not-found case as a no-op internally,
	// so there is no need for a pre-fetch Find round-trip on every message event.
	msg := &projections.Message{
		ID:         e.Payload.InternalMessageID.String(),
		ChannelID:  channelID,
		RemoteID:   remoteID,
		Direction:  string(channelenums.DirectionReceived),
		OccurredAt: e.Payload.OccurredAt,
	}
	if err := p.repo.ApplyLatestMessage(ctx, msg); err != nil {
		slog.Warn("failed to apply latest message on message_received",
			"channelId", channelID,
			"remoteId", remoteID,
			"error", err,
		)
		return err
	}
	return nil
}

// ──────────────────────────────────────────────────────────────────────────────
// handleOnMessageDeleted
//
// Cross-aggregate: reacts to channel.message_deleted. If the deleted message is
// the current last_message_id on any remote, recomputes the preview to the
// next-newest non-deleted message (or clears if none remain).
//
// Resolves the internal UUID via messagerepo.FindByPlatformID — the event
// payload carries the platform id (e.g. WhatsApp message id), not the internal
// projection UUID.
// ──────────────────────────────────────────────────────────────────────────────

func (p *RemoteProjector) handleOnMessageDeleted(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelMessageDeletedPayload](event)
	if err != nil {
		return err
	}
	msg, err := p.msgRepo.FindByPlatformID(ctx, e.Payload.ChannelID.String(), e.Payload.MessageID)
	if err != nil {
		return err
	}
	if msg == nil {
		slog.Debug("message not projected; skipping remote preview recompute",
			"channelId", e.Payload.ChannelID, "messageId", e.Payload.MessageID)
		return nil
	}
	return p.repo.RecomputePreviewIfLatest(ctx, msg.ChannelID, msg.RemoteID, msg.ID)
}

// ──────────────────────────────────────────────────────────────────────────────
// handleOnMessageSent
//
// Cross-aggregate: reacts to message_sent to advance last_message_at only.
// Sent messages do not bump the unread counter.
// ──────────────────────────────────────────────────────────────────────────────

func (p *RemoteProjector) handleOnMessageSent(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelMessageSentPayload](event)
	if err != nil {
		return err
	}
	channelID := e.Payload.ChannelID.String()
	remoteID := e.Payload.RemoteID

	// ApplyLatestMessage handles the not-found case as a no-op internally,
	// so there is no need for a pre-fetch Find round-trip on every message event.
	msg := &projections.Message{
		ID:         e.Payload.InternalMessageID.String(),
		ChannelID:  channelID,
		RemoteID:   remoteID,
		Direction:  string(channelenums.DirectionSent),
		OccurredAt: e.Payload.OccurredAt,
	}
	if err := p.repo.ApplyLatestMessage(ctx, msg); err != nil {
		slog.Warn("failed to apply latest message on message_sent",
			"channelId", channelID,
			"remoteId", remoteID,
			"error", err,
		)
		return err
	}
	return nil
}
