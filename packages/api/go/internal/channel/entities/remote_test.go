package entities_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"template/api-go/internal/channel/entities"
	ctxenums "template/api-go/internal/channel/enums"
	ctxerrors "template/api-go/internal/channel/errors"
	ctxevents "template/api-go/internal/channel/events"
	sharederrors "template/api-go/internal/shared/errors"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func newTestRemote(t *testing.T) *entities.Remote {
	t.Helper()
	r, err := entities.NewRemote(entities.NewRemoteParams{
		ChannelID:  uuid.New(),
		RemoteID:   "5511999887766@s.whatsapp.net",
		RemoteType: ctxenums.RemoteTypeUser,
		OwnerID:    "owner-1",
	})
	require.NoError(t, err)
	// Drain the created event so tests start with a clean slate.
	r.PullDomainEvents()
	return r
}

func assertErrorCode(t *testing.T, err error, code sharederrors.ErrorCode) {
	t.Helper()
	var appErr *sharederrors.AppError
	require.ErrorAs(t, err, &appErr)
	assert.Equal(t, code, appErr.Code)
}

// ---------------------------------------------------------------------------
// NewRemote
// ---------------------------------------------------------------------------

func TestRemote_NewRemote_RaisesRemoteCreatedEvent(t *testing.T) {
	r, err := entities.NewRemote(entities.NewRemoteParams{
		ChannelID:  uuid.New(),
		RemoteID:   "5511999887766@s.whatsapp.net",
		RemoteType: ctxenums.RemoteTypeUser,
		OwnerID:    "owner-1",
	})

	require.NoError(t, err)
	require.NotNil(t, r)

	evts := r.PullDomainEvents()
	require.Len(t, evts, 1)
	assert.Equal(t, ctxevents.RemoteCreatedEventName, evts[0].GetEventName())
}

func TestRemote_NewRemote_ReturnsErrorWhenRemoteIDEmpty(t *testing.T) {
	_, err := entities.NewRemote(entities.NewRemoteParams{
		ChannelID:  uuid.New(),
		RemoteID:   "",
		RemoteType: ctxenums.RemoteTypeUser,
		OwnerID:    "owner-1",
	})

	require.Error(t, err)
	assertErrorCode(t, err, ctxerrors.CodeRemoteInvalidParams)
}

func TestRemote_NewRemote_ReturnsErrorWhenChannelIDZero(t *testing.T) {
	_, err := entities.NewRemote(entities.NewRemoteParams{
		ChannelID:  uuid.UUID{},
		RemoteID:   "5511@s.whatsapp.net",
		RemoteType: ctxenums.RemoteTypeUser,
		OwnerID:    "owner-1",
	})

	require.Error(t, err)
	assertErrorCode(t, err, ctxerrors.CodeRemoteInvalidParams)
}

// ---------------------------------------------------------------------------
// Pin
// ---------------------------------------------------------------------------

func TestRemote_Pin_SetsStateAndRaisesEvent(t *testing.T) {
	r := newTestRemote(t)
	at := time.Now().UTC()

	err := r.Pin(at)

	require.NoError(t, err)
	assert.NotNil(t, r.PinnedAt())

	evts := r.PullDomainEvents()
	require.Len(t, evts, 1)
	assert.Equal(t, ctxevents.RemotePinnedEventName, evts[0].GetEventName())
}

func TestRemote_Pin_ReturnsErrorIfAlreadyPinned(t *testing.T) {
	r := newTestRemote(t)
	at := time.Now().UTC()
	require.NoError(t, r.Pin(at))
	r.PullDomainEvents()

	err := r.Pin(at)

	require.Error(t, err)
	assertErrorCode(t, err, ctxerrors.CodeRemoteAlreadyPinned)
}

func TestRemote_Pin_ReturnsErrorIfDeleted(t *testing.T) {
	r := newTestRemote(t)
	require.NoError(t, r.MarkDeleted(time.Now().UTC()))
	r.PullDomainEvents()

	err := r.Pin(time.Now().UTC())

	require.Error(t, err)
	assertErrorCode(t, err, ctxerrors.CodeRemoteDeleted)
}

// ---------------------------------------------------------------------------
// Unpin
// ---------------------------------------------------------------------------

func TestRemote_Unpin_ClearsPinAndRaisesEvent(t *testing.T) {
	r := newTestRemote(t)
	require.NoError(t, r.Pin(time.Now().UTC()))
	r.PullDomainEvents()

	err := r.Unpin()

	require.NoError(t, err)
	assert.Nil(t, r.PinnedAt())

	evts := r.PullDomainEvents()
	require.Len(t, evts, 1)
	assert.Equal(t, ctxevents.RemoteUnpinnedEventName, evts[0].GetEventName())
}

func TestRemote_Unpin_ReturnsErrorIfNotPinned(t *testing.T) {
	r := newTestRemote(t)

	err := r.Unpin()

	require.Error(t, err)
	assertErrorCode(t, err, ctxerrors.CodeRemoteNotPinned)
}

// ---------------------------------------------------------------------------
// Archive
// ---------------------------------------------------------------------------

func TestRemote_Archive_SetsArchivedAndRaisesEvent(t *testing.T) {
	r := newTestRemote(t)

	err := r.Archive()

	require.NoError(t, err)
	assert.True(t, r.Archived())

	evts := r.PullDomainEvents()
	require.Len(t, evts, 1)
	assert.Equal(t, ctxevents.RemoteArchivedEventName, evts[0].GetEventName())
}

func TestRemote_Archive_ReturnsErrorIfAlreadyArchived(t *testing.T) {
	r := newTestRemote(t)
	require.NoError(t, r.Archive())
	r.PullDomainEvents()

	err := r.Archive()

	require.Error(t, err)
	assertErrorCode(t, err, ctxerrors.CodeRemoteAlreadyArchived)
}

func TestRemote_Archive_ReturnsErrorIfDeleted(t *testing.T) {
	r := newTestRemote(t)
	require.NoError(t, r.MarkDeleted(time.Now().UTC()))
	r.PullDomainEvents()

	err := r.Archive()

	require.Error(t, err)
	assertErrorCode(t, err, ctxerrors.CodeRemoteDeleted)
}

// ---------------------------------------------------------------------------
// Unarchive
// ---------------------------------------------------------------------------

func TestRemote_Unarchive_ClearsArchivedAndRaisesEvent(t *testing.T) {
	r := newTestRemote(t)
	require.NoError(t, r.Archive())
	r.PullDomainEvents()

	err := r.Unarchive()

	require.NoError(t, err)
	assert.False(t, r.Archived())

	evts := r.PullDomainEvents()
	require.Len(t, evts, 1)
	assert.Equal(t, ctxevents.RemoteUnarchivedEventName, evts[0].GetEventName())
}

func TestRemote_Unarchive_ReturnsErrorIfNotArchived(t *testing.T) {
	r := newTestRemote(t)

	err := r.Unarchive()

	require.Error(t, err)
	assertErrorCode(t, err, ctxerrors.CodeRemoteNotArchived)
}

// ---------------------------------------------------------------------------
// Mute
// ---------------------------------------------------------------------------

func TestRemote_Mute_SetsMuteExpirationAndRaisesEvent(t *testing.T) {
	r := newTestRemote(t)
	until := time.Now().Add(24 * time.Hour).UTC()

	err := r.Mute(until)

	require.NoError(t, err)
	require.NotNil(t, r.MuteExpiration())
	assert.Equal(t, until, *r.MuteExpiration())

	evts := r.PullDomainEvents()
	require.Len(t, evts, 1)
	assert.Equal(t, ctxevents.RemoteMutedEventName, evts[0].GetEventName())
}

func TestRemote_Mute_ReturnsErrorIfDeleted(t *testing.T) {
	r := newTestRemote(t)
	require.NoError(t, r.MarkDeleted(time.Now().UTC()))
	r.PullDomainEvents()

	err := r.Mute(time.Now().Add(time.Hour).UTC())

	require.Error(t, err)
	assertErrorCode(t, err, ctxerrors.CodeRemoteDeleted)
}

// ---------------------------------------------------------------------------
// Unmute
// ---------------------------------------------------------------------------

func TestRemote_Unmute_ClearsMuteExpirationAndRaisesEvent(t *testing.T) {
	r := newTestRemote(t)
	require.NoError(t, r.Mute(time.Now().Add(time.Hour).UTC()))
	r.PullDomainEvents()

	err := r.Unmute()

	require.NoError(t, err)
	assert.Nil(t, r.MuteExpiration())

	evts := r.PullDomainEvents()
	require.Len(t, evts, 1)
	assert.Equal(t, ctxevents.RemoteUnmutedEventName, evts[0].GetEventName())
}

func TestRemote_Unmute_ReturnsErrorIfDeleted(t *testing.T) {
	r := newTestRemote(t)
	require.NoError(t, r.Mute(time.Now().Add(time.Hour).UTC()))
	require.NoError(t, r.MarkDeleted(time.Now().UTC()))
	r.PullDomainEvents()

	err := r.Unmute()

	require.Error(t, err)
	assertErrorCode(t, err, ctxerrors.CodeRemoteDeleted)
}

// ---------------------------------------------------------------------------
// MarkAsUnread
// ---------------------------------------------------------------------------

func TestRemote_MarkAsUnread_SetsMarkedAndRaisesEvent(t *testing.T) {
	r := newTestRemote(t)

	err := r.MarkAsUnread()

	require.NoError(t, err)
	assert.True(t, r.MarkedAsUnread())

	evts := r.PullDomainEvents()
	require.Len(t, evts, 1)
	assert.Equal(t, ctxevents.RemoteMarkedAsUnreadEventName, evts[0].GetEventName())
}

func TestRemote_MarkAsUnread_ReturnsErrorIfDeleted(t *testing.T) {
	r := newTestRemote(t)
	require.NoError(t, r.MarkDeleted(time.Now().UTC()))
	r.PullDomainEvents()

	err := r.MarkAsUnread()

	require.Error(t, err)
	assertErrorCode(t, err, ctxerrors.CodeRemoteDeleted)
}

// ---------------------------------------------------------------------------
// MarkChatSeen
// ---------------------------------------------------------------------------

func TestRemote_MarkChatSeen_ClearsUnreadMarkerAndRaisesEvent(t *testing.T) {
	r := newTestRemote(t)
	require.NoError(t, r.MarkAsUnread())
	r.PullDomainEvents()

	err := r.MarkChatSeen()

	require.NoError(t, err)
	assert.False(t, r.MarkedAsUnread())

	evts := r.PullDomainEvents()
	require.Len(t, evts, 1)
	assert.Equal(t, ctxevents.RemoteChatSeenEventName, evts[0].GetEventName())
}

func TestRemote_MarkChatSeen_ReturnsErrorIfDeleted(t *testing.T) {
	r := newTestRemote(t)
	require.NoError(t, r.MarkDeleted(time.Now().UTC()))
	r.PullDomainEvents()

	err := r.MarkChatSeen()

	require.Error(t, err)
	assertErrorCode(t, err, ctxerrors.CodeRemoteDeleted)
}

// ---------------------------------------------------------------------------
// MarkDeleted
// ---------------------------------------------------------------------------

func TestRemote_MarkDeleted_SetsDeletedAtAndRaisesEvent(t *testing.T) {
	r := newTestRemote(t)
	at := time.Now().UTC()

	err := r.MarkDeleted(at)

	require.NoError(t, err)
	require.NotNil(t, r.DeletedAt())
	assert.Equal(t, at, *r.DeletedAt())

	evts := r.PullDomainEvents()
	require.Len(t, evts, 1)
	assert.Equal(t, ctxevents.RemoteDeletedEventName, evts[0].GetEventName())
}

func TestRemote_MarkDeleted_ReturnsErrorIfAlreadyDeleted(t *testing.T) {
	r := newTestRemote(t)
	require.NoError(t, r.MarkDeleted(time.Now().UTC()))
	r.PullDomainEvents()

	err := r.MarkDeleted(time.Now().UTC())

	require.Error(t, err)
	assertErrorCode(t, err, ctxerrors.CodeRemoteAlreadyDeleted)
}

// ---------------------------------------------------------------------------
// ReconstructRemote
// ---------------------------------------------------------------------------

func TestRemote_ReconstructRemote_DoesNotRaiseEvents(t *testing.T) {
	pinnedAt := time.Now().UTC()
	r := entities.ReconstructRemote(entities.ReconstructRemoteParams{
		ID:             uuid.New(),
		ChannelID:      uuid.New(),
		RemoteID:       "5511@s.whatsapp.net",
		RemoteType:     ctxenums.RemoteTypeGroup,
		OwnerID:        "owner-1",
		PinnedAt:       &pinnedAt,
		Archived:       true,
		MarkedAsUnread: true,
		CreatedAt:      time.Now().UTC(),
		UpdatedAt:      time.Now().UTC(),
		Version:        3,
	})

	assert.NotNil(t, r)
	assert.Equal(t, "5511@s.whatsapp.net", r.RemoteID())
	assert.Equal(t, ctxenums.RemoteTypeGroup, r.RemoteType())
	assert.True(t, r.Archived())
	assert.True(t, r.MarkedAsUnread())
	assert.NotNil(t, r.PinnedAt())
	assert.Equal(t, 3, r.Version)

	// No events should be emitted on reconstruction.
	evts := r.PullDomainEvents()
	assert.Len(t, evts, 0)
}
