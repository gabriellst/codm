package projections

import (
	"testing"
	"time"
)

func TestRemote_ApplyMessageReceived_BumpsUnreadAndAdvancesPreview(t *testing.T) {
	r := &Remote{}
	t0 := time.Unix(1_700_000_000, 0).UTC()
	r.ApplyMessageReceived("m1", t0)

	if r.UnreadMessageCount != 1 {
		t.Errorf("unread = %d, want 1", r.UnreadMessageCount)
	}
	if r.LastMessageAt == nil || !r.LastMessageAt.Equal(t0) {
		t.Errorf("lastMessageAt = %v, want %v", r.LastMessageAt, t0)
	}
	if r.LastMessageID == nil || *r.LastMessageID != "m1" {
		t.Errorf("lastMessageId = %v, want m1", r.LastMessageID)
	}

	// A newer message advances the preview and bumps unread again.
	t1 := t0.Add(time.Minute)
	r.ApplyMessageReceived("m2", t1)
	if r.UnreadMessageCount != 2 {
		t.Errorf("unread = %d, want 2", r.UnreadMessageCount)
	}
	if r.LastMessageID == nil || *r.LastMessageID != "m2" {
		t.Errorf("lastMessageId = %v, want m2", r.LastMessageID)
	}

	// An older (out-of-order) message still bumps unread but does NOT roll back
	// the preview pointers.
	tOld := t0.Add(-time.Minute)
	r.ApplyMessageReceived("m0", tOld)
	if r.UnreadMessageCount != 3 {
		t.Errorf("unread = %d, want 3", r.UnreadMessageCount)
	}
	if *r.LastMessageID != "m2" {
		t.Errorf("preview rolled back to %v, want m2", *r.LastMessageID)
	}
}

func TestRemote_ApplyMessageSent_AdvancesPreviewWithoutUnread(t *testing.T) {
	r := &Remote{UnreadMessageCount: 2}
	t0 := time.Unix(1_700_000_000, 0).UTC()
	r.ApplyMessageSent("out1", t0)

	if r.UnreadMessageCount != 2 {
		t.Errorf("sent must not touch unread; got %d", r.UnreadMessageCount)
	}
	if r.LastMessageID == nil || *r.LastMessageID != "out1" {
		t.Errorf("lastMessageId = %v, want out1", r.LastMessageID)
	}
}

func TestRemote_ApplyChatSeen_ClearsUnreadState(t *testing.T) {
	r := &Remote{UnreadMessageCount: 5, MarkedAsUnread: true}
	r.ApplyChatSeen()
	if r.UnreadMessageCount != 0 || r.MarkedAsUnread {
		t.Errorf("chat-seen did not clear unread state: %+v", r)
	}
}

func TestRemote_PinMuteArchiveToggles(t *testing.T) {
	r := &Remote{}
	at := time.Unix(1_700_000_000, 0).UTC()

	r.ApplyPinned(at)
	if r.PinnedAt == nil || !r.PinnedAt.Equal(at) {
		t.Errorf("pinnedAt = %v", r.PinnedAt)
	}
	r.ApplyUnpinned()
	if r.PinnedAt != nil {
		t.Errorf("unpin did not clear pinnedAt")
	}

	r.ApplyMuted(at)
	if r.MuteExpiration == nil {
		t.Errorf("muteExpiration not set")
	}
	r.ApplyUnmuted()
	if r.MuteExpiration != nil {
		t.Errorf("unmute did not clear muteExpiration")
	}

	r.ApplyArchived()
	if !r.Archived {
		t.Errorf("archived not set")
	}
	r.ApplyUnarchived()
	if r.Archived {
		t.Errorf("unarchive did not clear archived")
	}
}

func TestRemote_ApplyMirrorDiff(t *testing.T) {
	r := &Remote{}
	r.ApplyMirrorDiff("Ada Lovelace", "https://cdn/a.jpg", true)
	if r.Name != "Ada Lovelace" || r.AvatarURL != "https://cdn/a.jpg" || !r.IsBlocked {
		t.Errorf("mirror diff not applied: %+v", r)
	}
}
