package projectors

import (
	"context"
	"log/slog"

	ctxevents "template/api-go/internal/channel/events"
	remoterepo "template/api-go/internal/channel/repositories/remote"
	"template/core-go/services/mediator"
	"template/core-go/types"
)

// ──────────────────────────────────────────────────────────────────────────────
// MembershipAddedProjector
//
// Reacts to channel.membership_added which signals that a single participant
// has joined (or been added to) a group. Atomically upserts the member row
// into remote_memberships without touching other members.
// ──────────────────────────────────────────────────────────────────────────────

type MembershipAddedProjector struct {
	repo remoterepo.RemoteProjectionRepository
}

func NewMembershipAddedProjector(repo remoterepo.RemoteProjectionRepository) *MembershipAddedProjector {
	return &MembershipAddedProjector{repo: repo}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*MembershipAddedProjector)(nil)

func (p *MembershipAddedProjector) EventName() string {
	return ctxevents.MembershipAddedEventName
}

func (p *MembershipAddedProjector) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelMembershipAddedPayload](event)
	if err != nil {
		return err
	}
	pl := e.Payload

	member := remoterepo.MembershipRow{
		MemberID: pl.MemberID,
		IsAdmin:  pl.IsAdmin,
		JoinedAt: pl.JoinedAt,
	}
	if err := p.repo.AddMember(ctx, pl.ChannelID.String(), pl.GroupID, member); err != nil {
		slog.Warn("failed to add member on membership_added",
			"channelId", pl.ChannelID,
			"groupId", pl.GroupID,
			"memberId", pl.MemberID,
			"error", err,
		)
		return err
	}
	return nil
}

// ──────────────────────────────────────────────────────────────────────────────
// MembershipRemovedProjector
//
// Reacts to channel.membership_removed which signals that a single participant
// has left (or been removed from) a group. Atomically deletes the member row
// from remote_memberships without touching other members.
// ──────────────────────────────────────────────────────────────────────────────

type MembershipRemovedProjector struct {
	repo remoterepo.RemoteProjectionRepository
}

func NewMembershipRemovedProjector(repo remoterepo.RemoteProjectionRepository) *MembershipRemovedProjector {
	return &MembershipRemovedProjector{repo: repo}
}

// compile-time interface check.
var _ mediator.DomainEventHandler = (*MembershipRemovedProjector)(nil)

func (p *MembershipRemovedProjector) EventName() string {
	return ctxevents.MembershipRemovedEventName
}

func (p *MembershipRemovedProjector) Handle(ctx context.Context, event types.DomainEventI) error {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelMembershipRemovedPayload](event)
	if err != nil {
		return err
	}
	pl := e.Payload

	if err := p.repo.RemoveMember(ctx, pl.ChannelID.String(), pl.GroupID, pl.MemberID); err != nil {
		slog.Warn("failed to remove member on membership_removed",
			"channelId", pl.ChannelID,
			"groupId", pl.GroupID,
			"memberId", pl.MemberID,
			"error", err,
		)
		return err
	}
	return nil
}
