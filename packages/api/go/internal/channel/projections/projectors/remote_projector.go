package projectors

import (
	"context"
	"log/slog"
	"time"

	chanevents "template/api-go/internal/channel/events"
	"template/api-go/internal/channel/projections"
	messagerepo "template/api-go/internal/channel/repositories/message"
	remoterepo "template/api-go/internal/channel/repositories/remote"
	"template/contracts-go/wire"
	"template/core-go/services/mediator"
	fwtypes "template/core-go/types"
)

// remote_projector.go keeps the gateway.remotes / gateway.remote_memberships read
// model fresh from the read-model domain facts. Ported from the medscall channel
// remote projectors, adapted to CodeDM's mediator.DomainEventHandler seam.

// applyToRemote is a shared helper that encapsulates the find → nil-warn →
// mutate → UpdatedAt → save pattern used by the remote projectors.
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

// ── RemoteCreatedProjector ───────────────────────────────────────────────────────
//
// Upserts a minimal row into gateway.remotes when a Remote is first observed.
// Name/AvatarURL arrive later via remote_updated. InsertIfNew gives
// first-write-wins so a late remote_created never clobbers an earlier snapshot.

type RemoteCreatedProjector struct {
	repo remoterepo.RemoteProjectionRepository
}

func NewRemoteCreatedProjector(repo remoterepo.RemoteProjectionRepository) *RemoteCreatedProjector {
	return &RemoteCreatedProjector{repo: repo}
}

var _ mediator.DomainEventHandler = (*RemoteCreatedProjector)(nil)

func (p *RemoteCreatedProjector) EventName() string { return chanevents.RemoteCreatedEventName }

func (p *RemoteCreatedProjector) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	e, err := fwtypes.UnmarshalDomainEvent[chanevents.RemoteCreatedPayload](event)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	row := &projections.Remote{
		ChannelID: e.Payload.ChannelID.String(),
		RemoteID:  e.Payload.RemoteID,
		Type:      string(e.Payload.ContactKind),
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
			"channelId", e.Payload.ChannelID, "remoteId", e.Payload.RemoteID)
	}
	return nil
}

// ── RemoteUpdatedProjector ───────────────────────────────────────────────────────
//
// Applies mirror fields (name, type) from a live profile change or bootstrap
// observation. Creates a stub row when none exists yet.

type RemoteUpdatedProjector struct {
	repo remoterepo.RemoteProjectionRepository
}

func NewRemoteUpdatedProjector(repo remoterepo.RemoteProjectionRepository) *RemoteUpdatedProjector {
	return &RemoteUpdatedProjector{repo: repo}
}

var _ mediator.DomainEventHandler = (*RemoteUpdatedProjector)(nil)

func (p *RemoteUpdatedProjector) EventName() string { return chanevents.RemoteUpdatedEventName }

func (p *RemoteUpdatedProjector) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	e, err := fwtypes.UnmarshalDomainEvent[chanevents.RemoteUpdatedPayload](event)
	if err != nil {
		return err
	}
	row, err := p.repo.Find(ctx, e.Payload.ChannelID.String(), e.Payload.RemoteID)
	if err != nil {
		return err
	}
	if row == nil {
		slog.Warn("remote not found for updated projection — creating stub",
			"channelId", e.Payload.ChannelID, "remoteId", e.Payload.RemoteID)
		now := time.Now().UTC()
		row = &projections.Remote{
			ChannelID: e.Payload.ChannelID.String(),
			RemoteID:  e.Payload.RemoteID,
			Type:      string(e.Payload.ContactKind),
			// Platform is not carried by remote_updated; a subsequent remote_created
			// (which does carry Platform) fills it in via RemoteCreatedProjector.
			CreatedAt: now,
		}
	}
	row.Name = e.Payload.DisplayName
	row.Type = string(e.Payload.ContactKind)
	row.UpdatedAt = time.Now().UTC()
	return p.repo.Save(ctx, row)
}

// ── RemoteDeletedProjector ───────────────────────────────────────────────────────
//
// Stamps deleted_at on the projection row when the Remote is soft-deleted.

type RemoteDeletedProjector struct {
	repo remoterepo.RemoteProjectionRepository
}

func NewRemoteDeletedProjector(repo remoterepo.RemoteProjectionRepository) *RemoteDeletedProjector {
	return &RemoteDeletedProjector{repo: repo}
}

var _ mediator.DomainEventHandler = (*RemoteDeletedProjector)(nil)

func (p *RemoteDeletedProjector) EventName() string { return chanevents.RemoteDeletedEventName }

func (p *RemoteDeletedProjector) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	e, err := fwtypes.UnmarshalDomainEvent[chanevents.RemoteDeletedPayload](event)
	if err != nil {
		return err
	}
	deletedAt := e.Payload.DeletedAt
	return applyToRemote(ctx, p.repo, e.Payload.ChannelID.String(), e.Payload.RemoteID, "delete",
		func(r *projections.Remote) { r.DeletedAt = &deletedAt },
	)
}

// ── MembershipAddedProjector ─────────────────────────────────────────────────────
//
// Atomically upserts a single member row into gateway.remote_memberships.

type MembershipAddedProjector struct {
	repo remoterepo.RemoteProjectionRepository
}

func NewMembershipAddedProjector(repo remoterepo.RemoteProjectionRepository) *MembershipAddedProjector {
	return &MembershipAddedProjector{repo: repo}
}

var _ mediator.DomainEventHandler = (*MembershipAddedProjector)(nil)

func (p *MembershipAddedProjector) EventName() string { return chanevents.MembershipAddedEventName }

func (p *MembershipAddedProjector) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	e, err := fwtypes.UnmarshalDomainEvent[chanevents.MembershipAddedPayload](event)
	if err != nil {
		return err
	}
	pl := e.Payload
	member := remoterepo.MembershipRow{MemberID: pl.MemberID, IsAdmin: pl.IsAdmin, JoinedAt: pl.JoinedAt}
	if err := p.repo.AddMember(ctx, pl.ChannelID.String(), pl.GroupID, member); err != nil {
		slog.Warn("failed to add member on membership_added",
			"channelId", pl.ChannelID, "groupId", pl.GroupID, "memberId", pl.MemberID, "error", err)
		return err
	}
	return nil
}

// ── MembershipRemovedProjector ───────────────────────────────────────────────────
//
// Atomically deletes a single member row from gateway.remote_memberships.

type MembershipRemovedProjector struct {
	repo remoterepo.RemoteProjectionRepository
}

func NewMembershipRemovedProjector(repo remoterepo.RemoteProjectionRepository) *MembershipRemovedProjector {
	return &MembershipRemovedProjector{repo: repo}
}

var _ mediator.DomainEventHandler = (*MembershipRemovedProjector)(nil)

func (p *MembershipRemovedProjector) EventName() string {
	return chanevents.MembershipRemovedEventName
}

func (p *MembershipRemovedProjector) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	e, err := fwtypes.UnmarshalDomainEvent[chanevents.MembershipRemovedPayload](event)
	if err != nil {
		return err
	}
	pl := e.Payload
	if err := p.repo.RemoveMember(ctx, pl.ChannelID.String(), pl.GroupID, pl.MemberID); err != nil {
		slog.Warn("failed to remove member on membership_removed",
			"channelId", pl.ChannelID, "groupId", pl.GroupID, "memberId", pl.MemberID, "error", err)
		return err
	}
	return nil
}

// ── RemoteOnMessageReceivedProjector ─────────────────────────────────────────────
//
// Cross-aggregate: reacts to channel.message_received to bump unread count and
// advance the preview pointers via the atomic ApplyLatestMessage.

type RemoteOnMessageReceivedProjector struct {
	repo remoterepo.RemoteProjectionRepository
}

func NewRemoteOnMessageReceivedProjector(repo remoterepo.RemoteProjectionRepository) *RemoteOnMessageReceivedProjector {
	return &RemoteOnMessageReceivedProjector{repo: repo}
}

var _ mediator.DomainEventHandler = (*RemoteOnMessageReceivedProjector)(nil)

func (p *RemoteOnMessageReceivedProjector) EventName() string {
	return chanevents.MessageReceivedEventName
}

func (p *RemoteOnMessageReceivedProjector) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	e, err := fwtypes.UnmarshalDomainEvent[chanevents.MessageReceivedPayload](event)
	if err != nil {
		return err
	}
	channelID := e.Payload.ChannelID.String()
	remoteID := e.Payload.RemoteID

	// ApplyLatestMessage handles the not-found case as a no-op internally.
	msg := &projections.Message{
		ID:         e.Payload.InternalMessageID.String(),
		ChannelID:  channelID,
		RemoteID:   remoteID,
		Direction:  string(wire.DirectionRECEIVED),
		OccurredAt: e.Payload.ReceivedAt,
	}
	if err := p.repo.ApplyLatestMessage(ctx, msg); err != nil {
		slog.Warn("failed to apply latest message on message_received",
			"channelId", channelID, "remoteId", remoteID, "error", err)
		return err
	}
	return nil
}

// ── RemoteOnMessageSentProjector ─────────────────────────────────────────────────
//
// Cross-aggregate: reacts to channel_message.sent to advance the preview pointers
// only. Sent messages do not bump the unread counter.

type RemoteOnMessageSentProjector struct {
	repo remoterepo.RemoteProjectionRepository
}

func NewRemoteOnMessageSentProjector(repo remoterepo.RemoteProjectionRepository) *RemoteOnMessageSentProjector {
	return &RemoteOnMessageSentProjector{repo: repo}
}

var _ mediator.DomainEventHandler = (*RemoteOnMessageSentProjector)(nil)

func (p *RemoteOnMessageSentProjector) EventName() string { return chanevents.MessageSentEventName }

func (p *RemoteOnMessageSentProjector) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	e, err := fwtypes.UnmarshalDomainEvent[chanevents.MessageSentPayload](event)
	if err != nil {
		return err
	}
	channelID := e.Payload.ChannelID.String()
	remoteID := e.Payload.RemoteID

	msg := &projections.Message{
		ID:         e.Payload.InternalMessageID.String(),
		ChannelID:  channelID,
		RemoteID:   remoteID,
		Direction:  string(wire.DirectionSENT),
		OccurredAt: e.Payload.OccurredAt,
	}
	if err := p.repo.ApplyLatestMessage(ctx, msg); err != nil {
		slog.Warn("failed to apply latest message on message_sent",
			"channelId", channelID, "remoteId", remoteID, "error", err)
		return err
	}
	return nil
}

// ── RemoteOnMessageDeletedProjector ──────────────────────────────────────────────
//
// Cross-aggregate: reacts to channel_message.deleted. If the deleted message is
// the current last_message_id on any remote, recomputes the preview to the
// next-newest non-deleted message (or clears it). Resolves the internal UUID via
// messagerepo.FindByPlatformID — the payload carries the platform id.

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

var _ mediator.DomainEventHandler = (*RemoteOnMessageDeletedProjector)(nil)

func (p *RemoteOnMessageDeletedProjector) EventName() string {
	return chanevents.MessageDeletedEventName
}

func (p *RemoteOnMessageDeletedProjector) Handle(ctx context.Context, event fwtypes.DomainEventI) error {
	e, err := fwtypes.UnmarshalDomainEvent[chanevents.MessageDeletedPayload](event)
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
