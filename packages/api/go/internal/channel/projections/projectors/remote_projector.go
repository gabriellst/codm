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
	"template/core-go/services/mediator"
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
// RemoteCreatedProjector
//
// Upserts a minimal row into remotes when a new Remote aggregate is
// first constructed. Name, AvatarURL, and other mirror fields arrive later via
// remote_updated events.
// ──────────────────────────────────────────────────────────────────────────────

type RemoteCreatedProjector struct {
	repo remoterepo.RemoteProjectionRepository
}

func NewRemoteCreatedProjector(repo remoterepo.RemoteProjectionRepository) *RemoteCreatedProjector {
	return &RemoteCreatedProjector{repo: repo}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*RemoteCreatedProjector)(nil)

func (p *RemoteCreatedProjector) EventName() string { return ctxevents.RemoteCreatedEventName }

func (p *RemoteCreatedProjector) Handle(ctx context.Context, event types.DomainEventI) error {
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
// RemoteDeletedProjector
//
// Sets deleted_at on the projection row when the Remote aggregate is soft-deleted.
// ──────────────────────────────────────────────────────────────────────────────

type RemoteDeletedProjector struct {
	repo remoterepo.RemoteProjectionRepository
}

func NewRemoteDeletedProjector(repo remoterepo.RemoteProjectionRepository) *RemoteDeletedProjector {
	return &RemoteDeletedProjector{repo: repo}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*RemoteDeletedProjector)(nil)

func (p *RemoteDeletedProjector) EventName() string { return ctxevents.RemoteDeletedEventName }

func (p *RemoteDeletedProjector) Handle(ctx context.Context, event types.DomainEventI) error {
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
// RemoteUpdatedProjector
//
// Applies mirror fields (name, description is not stored in projection) that
// arrive from a live profile change or bootstrap observation.
// ──────────────────────────────────────────────────────────────────────────────

type RemoteUpdatedProjector struct {
	repo        remoterepo.RemoteProjectionRepository
	channelRepo channelrepo.ChannelRepository
}

// NewRemoteUpdatedProjector takes the channel repository in addition to the
// projection repo: the stub path below has to resolve the remote's platform, and
// a remote's platform is by definition its channel's.
func NewRemoteUpdatedProjector(
	repo remoterepo.RemoteProjectionRepository,
	channelRepo channelrepo.ChannelRepository,
) *RemoteUpdatedProjector {
	return &RemoteUpdatedProjector{repo: repo, channelRepo: channelRepo}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*RemoteUpdatedProjector)(nil)

func (p *RemoteUpdatedProjector) EventName() string { return ctxevents.RemoteUpdatedEventName }

func (p *RemoteUpdatedProjector) Handle(ctx context.Context, event types.DomainEventI) error {
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
func (p *RemoteUpdatedProjector) resolvePlatform(ctx context.Context, channelID string) (channelenums.Platform, error) {
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
// RemotePinnedProjector
// ──────────────────────────────────────────────────────────────────────────────

type RemotePinnedProjector struct {
	repo remoterepo.RemoteProjectionRepository
}

func NewRemotePinnedProjector(repo remoterepo.RemoteProjectionRepository) *RemotePinnedProjector {
	return &RemotePinnedProjector{repo: repo}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*RemotePinnedProjector)(nil)

func (p *RemotePinnedProjector) EventName() string { return ctxevents.RemotePinnedEventName }

func (p *RemotePinnedProjector) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelRemotePinnedPayload](event)
	if err != nil {
		return err
	}
	return applyToRemote(ctx, p.repo, e.Payload.ChannelID.String(), e.Payload.RemoteID, "pin",
		func(r *projections.Remote) { r.ApplyPinned(e.Payload.At) },
	)
}

// ──────────────────────────────────────────────────────────────────────────────
// RemoteUnpinnedProjector
// ──────────────────────────────────────────────────────────────────────────────

type RemoteUnpinnedProjector struct {
	repo remoterepo.RemoteProjectionRepository
}

func NewRemoteUnpinnedProjector(repo remoterepo.RemoteProjectionRepository) *RemoteUnpinnedProjector {
	return &RemoteUnpinnedProjector{repo: repo}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*RemoteUnpinnedProjector)(nil)

func (p *RemoteUnpinnedProjector) EventName() string { return ctxevents.RemoteUnpinnedEventName }

func (p *RemoteUnpinnedProjector) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelRemoteUnpinnedPayload](event)
	if err != nil {
		return err
	}
	return applyToRemote(ctx, p.repo, e.Payload.ChannelID.String(), e.Payload.RemoteID, "unpin",
		func(r *projections.Remote) { r.ApplyUnpinned() },
	)
}

// ──────────────────────────────────────────────────────────────────────────────
// RemoteArchivedProjector
// ──────────────────────────────────────────────────────────────────────────────

type RemoteArchivedProjector struct {
	repo remoterepo.RemoteProjectionRepository
}

func NewRemoteArchivedProjector(repo remoterepo.RemoteProjectionRepository) *RemoteArchivedProjector {
	return &RemoteArchivedProjector{repo: repo}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*RemoteArchivedProjector)(nil)

func (p *RemoteArchivedProjector) EventName() string { return ctxevents.RemoteArchivedEventName }

func (p *RemoteArchivedProjector) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelRemoteArchivedPayload](event)
	if err != nil {
		return err
	}
	return applyToRemote(ctx, p.repo, e.Payload.ChannelID.String(), e.Payload.RemoteID, "archive",
		func(r *projections.Remote) { r.ApplyArchived() },
	)
}

// ──────────────────────────────────────────────────────────────────────────────
// RemoteUnarchivedProjector
// ──────────────────────────────────────────────────────────────────────────────

type RemoteUnarchivedProjector struct {
	repo remoterepo.RemoteProjectionRepository
}

func NewRemoteUnarchivedProjector(repo remoterepo.RemoteProjectionRepository) *RemoteUnarchivedProjector {
	return &RemoteUnarchivedProjector{repo: repo}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*RemoteUnarchivedProjector)(nil)

func (p *RemoteUnarchivedProjector) EventName() string { return ctxevents.RemoteUnarchivedEventName }

func (p *RemoteUnarchivedProjector) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelRemoteUnarchivedPayload](event)
	if err != nil {
		return err
	}
	return applyToRemote(ctx, p.repo, e.Payload.ChannelID.String(), e.Payload.RemoteID, "unarchive",
		func(r *projections.Remote) { r.ApplyUnarchived() },
	)
}

// ──────────────────────────────────────────────────────────────────────────────
// RemoteMutedProjector
// ──────────────────────────────────────────────────────────────────────────────

type RemoteMutedProjector struct {
	repo remoterepo.RemoteProjectionRepository
}

func NewRemoteMutedProjector(repo remoterepo.RemoteProjectionRepository) *RemoteMutedProjector {
	return &RemoteMutedProjector{repo: repo}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*RemoteMutedProjector)(nil)

func (p *RemoteMutedProjector) EventName() string { return ctxevents.RemoteMutedEventName }

func (p *RemoteMutedProjector) Handle(ctx context.Context, event types.DomainEventI) error {
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
// RemoteUnmutedProjector
// ──────────────────────────────────────────────────────────────────────────────

type RemoteUnmutedProjector struct {
	repo remoterepo.RemoteProjectionRepository
}

func NewRemoteUnmutedProjector(repo remoterepo.RemoteProjectionRepository) *RemoteUnmutedProjector {
	return &RemoteUnmutedProjector{repo: repo}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*RemoteUnmutedProjector)(nil)

func (p *RemoteUnmutedProjector) EventName() string { return ctxevents.RemoteUnmutedEventName }

func (p *RemoteUnmutedProjector) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelRemoteUnmutedPayload](event)
	if err != nil {
		return err
	}
	return applyToRemote(ctx, p.repo, e.Payload.ChannelID.String(), e.Payload.RemoteID, "unmute",
		func(r *projections.Remote) { r.ApplyUnmuted() },
	)
}

// ──────────────────────────────────────────────────────────────────────────────
// RemoteMarkedAsUnreadProjector
// ──────────────────────────────────────────────────────────────────────────────

type RemoteMarkedAsUnreadProjector struct {
	repo remoterepo.RemoteProjectionRepository
}

func NewRemoteMarkedAsUnreadProjector(repo remoterepo.RemoteProjectionRepository) *RemoteMarkedAsUnreadProjector {
	return &RemoteMarkedAsUnreadProjector{repo: repo}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*RemoteMarkedAsUnreadProjector)(nil)

func (p *RemoteMarkedAsUnreadProjector) EventName() string {
	return ctxevents.RemoteMarkedAsUnreadEventName
}

func (p *RemoteMarkedAsUnreadProjector) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelRemoteMarkedAsUnreadPayload](event)
	if err != nil {
		return err
	}
	return applyToRemote(ctx, p.repo, e.Payload.ChannelID.String(), e.Payload.RemoteID, "mark-as-unread",
		func(r *projections.Remote) { r.ApplyMarkedAsUnread() },
	)
}

// ──────────────────────────────────────────────────────────────────────────────
// RemoteChatSeenProjector
//
// Clears unread state when the user opens the chat. Uses ApplyChatSeen which
// zeroes both UnreadMessageCount and MarkedAsUnread.
// ──────────────────────────────────────────────────────────────────────────────

type RemoteChatSeenProjector struct {
	repo remoterepo.RemoteProjectionRepository
}

func NewRemoteChatSeenProjector(repo remoterepo.RemoteProjectionRepository) *RemoteChatSeenProjector {
	return &RemoteChatSeenProjector{repo: repo}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*RemoteChatSeenProjector)(nil)

func (p *RemoteChatSeenProjector) EventName() string { return ctxevents.RemoteChatSeenEventName }

func (p *RemoteChatSeenProjector) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelRemoteChatSeenPayload](event)
	if err != nil {
		return err
	}
	return applyToRemote(ctx, p.repo, e.Payload.ChannelID.String(), e.Payload.RemoteID, "chat-seen",
		func(r *projections.Remote) { r.ApplyChatSeen() },
	)
}

// ──────────────────────────────────────────────────────────────────────────────
// RemoteOnMessageReceivedProjector
//
// Cross-aggregate: reacts to message_received to bump unread count and advance
// last_message_at. Uses atomic repository methods to avoid read-modify-write
// races when multiple messages arrive concurrently.
// ──────────────────────────────────────────────────────────────────────────────

type RemoteOnMessageReceivedProjector struct {
	repo remoterepo.RemoteProjectionRepository
}

func NewRemoteOnMessageReceivedProjector(repo remoterepo.RemoteProjectionRepository) *RemoteOnMessageReceivedProjector {
	return &RemoteOnMessageReceivedProjector{repo: repo}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*RemoteOnMessageReceivedProjector)(nil)

func (p *RemoteOnMessageReceivedProjector) EventName() string {
	return ctxevents.MessageReceivedEventName
}

func (p *RemoteOnMessageReceivedProjector) Handle(ctx context.Context, event types.DomainEventI) error {
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
// RemoteOnMessageDeletedProjector
//
// Cross-aggregate: reacts to channel.message_deleted. If the deleted message is
// the current last_message_id on any remote, recomputes the preview to the
// next-newest non-deleted message (or clears if none remain).
//
// Resolves the internal UUID via messagerepo.FindByPlatformID — the event
// payload carries the platform id (e.g. WhatsApp message id), not the internal
// projection UUID.
// ──────────────────────────────────────────────────────────────────────────────

type RemoteOnMessageDeletedProjector struct {
	msgRepo    messagerepo.MessageProjectionRepository
	remoteRepo remoterepo.RemoteProjectionRepository
}

func NewRemoteOnMessageDeletedProjector(
	msgRepo messagerepo.MessageProjectionRepository,
	remoteRepo remoterepo.RemoteProjectionRepository,
) *RemoteOnMessageDeletedProjector {
	return &RemoteOnMessageDeletedProjector{msgRepo: msgRepo, remoteRepo: remoteRepo}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*RemoteOnMessageDeletedProjector)(nil)

func (p *RemoteOnMessageDeletedProjector) EventName() string {
	return ctxevents.MessageDeletedEventName
}

func (p *RemoteOnMessageDeletedProjector) Handle(ctx context.Context, event types.DomainEventI) error {
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
	return p.remoteRepo.RecomputePreviewIfLatest(ctx, msg.ChannelID, msg.RemoteID, msg.ID)
}

// ──────────────────────────────────────────────────────────────────────────────
// RemoteOnMessageSentProjector
//
// Cross-aggregate: reacts to message_sent to advance last_message_at only.
// Sent messages do not bump the unread counter.
// ──────────────────────────────────────────────────────────────────────────────

type RemoteOnMessageSentProjector struct {
	repo remoterepo.RemoteProjectionRepository
}

func NewRemoteOnMessageSentProjector(repo remoterepo.RemoteProjectionRepository) *RemoteOnMessageSentProjector {
	return &RemoteOnMessageSentProjector{repo: repo}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*RemoteOnMessageSentProjector)(nil)

func (p *RemoteOnMessageSentProjector) EventName() string { return ctxevents.MessageSentEventName }

func (p *RemoteOnMessageSentProjector) Handle(ctx context.Context, event types.DomainEventI) error {
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
