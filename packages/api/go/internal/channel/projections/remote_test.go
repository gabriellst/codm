package projections_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"template/api-go/internal/channel/projections"
)

func TestRemote_ApplyMessageReceived_IncrementsUnreadAndAdvancesLastMessageAt(t *testing.T) {
	r := &projections.Remote{}

	t1 := time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC)
	r.ApplyMessageReceived("msg-1", t1)

	assert.Equal(t, 1, r.UnreadMessageCount)
	require.NotNil(t, r.LastMessageAt)
	assert.Equal(t, t1, *r.LastMessageAt)
	require.NotNil(t, r.LastMessageID)
	assert.Equal(t, "msg-1", *r.LastMessageID)
}

func TestRemote_ApplyMessageReceived_LastMessageAt_ForwardOnly(t *testing.T) {
	r := &projections.Remote{}

	t1 := time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC)
	t2 := time.Date(2026, 1, 1, 9, 0, 0, 0, time.UTC) // earlier

	r.ApplyMessageReceived("msg-1", t1)
	r.ApplyMessageReceived("msg-2", t2) // out-of-order: older timestamp should not roll back

	assert.Equal(t, 2, r.UnreadMessageCount, "unread counter still increments")
	assert.Equal(t, t1, *r.LastMessageAt, "LastMessageAt stays at the later time")
	assert.Equal(t, "msg-1", *r.LastMessageID, "older message must not overwrite preview id")
}

func TestRemote_ApplyMessageReceived_MultipleMessages(t *testing.T) {
	r := &projections.Remote{}

	t1 := time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC)
	t2 := time.Date(2026, 1, 1, 11, 0, 0, 0, time.UTC)
	t3 := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)

	r.ApplyMessageReceived("msg-1", t1)
	r.ApplyMessageReceived("msg-2", t2)
	r.ApplyMessageReceived("msg-3", t3)

	assert.Equal(t, 3, r.UnreadMessageCount)
	assert.Equal(t, t3, *r.LastMessageAt)
	require.NotNil(t, r.LastMessageID)
	assert.Equal(t, "msg-3", *r.LastMessageID)
}

func TestRemote_ApplyMessageSent_DoesNotTouchUnreadCounter(t *testing.T) {
	r := &projections.Remote{UnreadMessageCount: 5}

	t1 := time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC)
	r.ApplyMessageSent("msg-1", t1)

	assert.Equal(t, 5, r.UnreadMessageCount, "sent messages must not change unread count")
	assert.Equal(t, t1, *r.LastMessageAt)
	require.NotNil(t, r.LastMessageID)
	assert.Equal(t, "msg-1", *r.LastMessageID)
}

func TestRemote_ApplyMessageSent_LastMessageAt_ForwardOnly(t *testing.T) {
	r := &projections.Remote{}

	t1 := time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC)
	t2 := time.Date(2026, 1, 1, 9, 0, 0, 0, time.UTC) // earlier

	r.ApplyMessageSent("msg-1", t1)
	r.ApplyMessageSent("msg-2", t2)

	assert.Equal(t, t1, *r.LastMessageAt, "out-of-order sent does not roll back LastMessageAt")
	assert.Equal(t, "msg-1", *r.LastMessageID, "older message must not overwrite preview id")
}

func TestRemote_ApplyChatSeen_ResetsUnreadState(t *testing.T) {
	r := &projections.Remote{
		UnreadMessageCount: 7,
		MarkedAsUnread:     true,
	}

	r.ApplyChatSeen()

	assert.Equal(t, 0, r.UnreadMessageCount)
	assert.False(t, r.MarkedAsUnread)
}

func TestRemote_ApplyMirrorDiff_UpdatesExternalFields(t *testing.T) {
	r := &projections.Remote{
		Name:      "Old Name",
		AvatarURL: "https://old.example.com/avatar.jpg",
		IsBlocked: false,
	}

	r.ApplyMirrorDiff("New Name", "https://new.example.com/avatar.jpg", true)

	assert.Equal(t, "New Name", r.Name)
	assert.Equal(t, "https://new.example.com/avatar.jpg", r.AvatarURL)
	assert.True(t, r.IsBlocked)
}

func TestRemote_ApplyMirrorDiff_ClearsAvatarURL(t *testing.T) {
	r := &projections.Remote{AvatarURL: "https://example.com/avatar.jpg"}

	r.ApplyMirrorDiff("Name", "", false)

	assert.Equal(t, "", r.AvatarURL)
}

func TestRemote_ApplyPinned_SetsPinnedAt(t *testing.T) {
	r := &projections.Remote{}
	at := time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC)

	r.ApplyPinned(at)

	require.NotNil(t, r.PinnedAt)
	assert.Equal(t, at, *r.PinnedAt)
}

func TestRemote_ApplyUnpinned_ClearsPinnedAt(t *testing.T) {
	at := time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC)
	r := &projections.Remote{PinnedAt: &at}

	r.ApplyUnpinned()

	assert.Nil(t, r.PinnedAt)
}

func TestRemote_ApplyArchived_UnarchiveCycle(t *testing.T) {
	r := &projections.Remote{}

	r.ApplyArchived()
	assert.True(t, r.Archived)

	r.ApplyUnarchived()
	assert.False(t, r.Archived)
}

func TestRemote_ApplyMuted_SetsAndClears(t *testing.T) {
	r := &projections.Remote{}
	until := time.Date(2026, 12, 31, 23, 59, 59, 0, time.UTC)

	r.ApplyMuted(until)
	require.NotNil(t, r.MuteExpiration)
	assert.Equal(t, until, *r.MuteExpiration)

	r.ApplyUnmuted()
	assert.Nil(t, r.MuteExpiration)
}

func TestRemote_ApplyMarkedAsUnread_SetsFlag(t *testing.T) {
	r := &projections.Remote{MarkedAsUnread: false}

	r.ApplyMarkedAsUnread()

	assert.True(t, r.MarkedAsUnread)
}
