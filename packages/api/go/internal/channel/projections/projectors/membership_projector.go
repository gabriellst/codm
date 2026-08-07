package projectors

import (
	"context"
	"log/slog"

	ctxevents "template/api-go/internal/channel/events"
	remoterepo "template/api-go/internal/channel/repositories/remote"
	"template/core-go/types"
)

// ──────────────────────────────────────────────────────────────────────────────
// MembershipProjector
//
// The single event-driven writer of the remote_memberships projection.
// Subscribes to every event that mutates group membership — added, removed —
// and dispatches internally via a switch on the event name.
// ──────────────────────────────────────────────────────────────────────────────

type MembershipProjector struct {
	repo remoterepo.RemoteProjectionRepository
}

func NewMembershipProjector(repo remoterepo.RemoteProjectionRepository) *MembershipProjector {
	return &MembershipProjector{repo: repo}
}

// compile-time interface check.
var _ MultiEventProjector = (*MembershipProjector)(nil)

// EventNames lists every event this projector subscribes to.
func (p *MembershipProjector) EventNames() []string {
	return []string{
		ctxevents.MembershipAddedEventName,
		ctxevents.MembershipRemovedEventName,
	}
}

func (p *MembershipProjector) Handle(ctx context.Context, event types.DomainEventI) error {
	switch event.GetEventName() {
	case ctxevents.MembershipAddedEventName:
		return p.handleAdded(ctx, event)
	case ctxevents.MembershipRemovedEventName:
		return p.handleRemoved(ctx, event)
	default:
		return nil
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// handleAdded
//
// Reacts to channel.membership_added which signals that a single participant
// has joined (or been added to) a group. Atomically upserts the member row
// into remote_memberships without touching other members.
// ──────────────────────────────────────────────────────────────────────────────

func (p *MembershipProjector) handleAdded(ctx context.Context, event types.DomainEventI) error {
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
// handleRemoved
//
// Reacts to channel.membership_removed which signals that a single participant
// has left (or been removed from) a group. Atomically deletes the member row
// from remote_memberships without touching other members.
// ──────────────────────────────────────────────────────────────────────────────

func (p *MembershipProjector) handleRemoved(ctx context.Context, event types.DomainEventI) error {
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
