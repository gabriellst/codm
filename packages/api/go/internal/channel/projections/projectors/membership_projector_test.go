package projectors

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	ctxevents "template/api-go/internal/channel/events"
)

// MembershipUpdatedProjector tests removed in T16 — MembershipUpdatedProjector deleted.
// MembershipSyncedProjector tests removed in T9 — MembershipSyncedProjector deleted.

// ──────────────────────────────────────────────────────────────────────────────
// Tests — MembershipAddedProjector
// ──────────────────────────────────────────────────────────────────────────────

func TestMembershipAddedProjector_EventName(t *testing.T) {
	repo := newMockRemoteRepo()
	p := NewMembershipAddedProjector(repo)
	if got := p.EventName(); got != ctxevents.MembershipAddedEventName {
		t.Errorf("EventName() = %q, want %q", got, ctxevents.MembershipAddedEventName)
	}
}

func TestMembershipAddedProjector_CallsAddMember(t *testing.T) {
	repo := newMockRemoteRepo()
	p := NewMembershipAddedProjector(repo)

	channelID := uuid.New()
	joinedAt := time.Now().UTC()
	evt := ctxevents.NewMembershipAddedEvent(channelID, "tenant", ctxevents.ChannelMembershipAddedPayload{
		ChannelID: channelID,
		GroupID:   "group-1@g.us",
		MemberID:  "member-1@s.whatsapp.net",
		IsAdmin:   true,
		JoinedAt:  joinedAt,
		OwnerID:   "tenant",
	})

	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if len(repo.addMemberCalls) != 1 {
		t.Fatalf("expected 1 AddMember call, got %d", len(repo.addMemberCalls))
	}
	call := repo.addMemberCalls[0]
	if call.channelID != channelID.String() {
		t.Errorf("channelID mismatch: got %s", call.channelID)
	}
	if call.groupID != "group-1@g.us" {
		t.Errorf("groupID mismatch: got %s", call.groupID)
	}
	if call.member.MemberID != "member-1@s.whatsapp.net" {
		t.Errorf("memberID mismatch: got %s", call.member.MemberID)
	}
	if !call.member.IsAdmin {
		t.Error("expected IsAdmin=true")
	}
	if !call.member.JoinedAt.Equal(joinedAt) {
		t.Errorf("joinedAt mismatch: got %v, want %v", call.member.JoinedAt, joinedAt)
	}
	// UpdateMembership must NOT have been called.
	if len(repo.updateMembershipCalls) != 0 {
		t.Errorf("unexpected UpdateMembership call(s): %d", len(repo.updateMembershipCalls))
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests — MembershipRemovedProjector
// ──────────────────────────────────────────────────────────────────────────────

func TestMembershipRemovedProjector_EventName(t *testing.T) {
	repo := newMockRemoteRepo()
	p := NewMembershipRemovedProjector(repo)
	if got := p.EventName(); got != ctxevents.MembershipRemovedEventName {
		t.Errorf("EventName() = %q, want %q", got, ctxevents.MembershipRemovedEventName)
	}
}

func TestMembershipRemovedProjector_CallsRemoveMember(t *testing.T) {
	repo := newMockRemoteRepo()
	p := NewMembershipRemovedProjector(repo)

	channelID := uuid.New()
	evt := ctxevents.NewMembershipRemovedEvent(channelID, "tenant", ctxevents.ChannelMembershipRemovedPayload{
		ChannelID: channelID,
		GroupID:   "group-1@g.us",
		MemberID:  "member-1@s.whatsapp.net",
		RemovedAt: time.Now().UTC(),
		OwnerID:   "tenant",
	})

	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if len(repo.removeMemberCalls) != 1 {
		t.Fatalf("expected 1 RemoveMember call, got %d", len(repo.removeMemberCalls))
	}
	call := repo.removeMemberCalls[0]
	if call.channelID != channelID.String() {
		t.Errorf("channelID mismatch: got %s", call.channelID)
	}
	if call.groupID != "group-1@g.us" {
		t.Errorf("groupID mismatch: got %s", call.groupID)
	}
	if call.memberID != "member-1@s.whatsapp.net" {
		t.Errorf("memberID mismatch: got %s", call.memberID)
	}
	// UpdateMembership must NOT have been called.
	if len(repo.updateMembershipCalls) != 0 {
		t.Errorf("unexpected UpdateMembership call(s): %d", len(repo.updateMembershipCalls))
	}
}
