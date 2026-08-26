package entities_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"template/api-go/internal/channel/entities"
	ctxenums "template/api-go/internal/channel/enums"
	ctxerrors "template/api-go/internal/channel/errors"
	ctxevents "template/api-go/internal/channel/events"
	sharederrors "template/core-go/errors"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func newTestMessage(t *testing.T, direction ctxenums.Direction) *entities.Message {
	t.Helper()
	return entities.ReconstructMessage(entities.ReconstructMessageParams{
		ID:                uuid.New(),
		ChannelID:         uuid.New(),
		RemoteID:          "5511999887766@s.whatsapp.net",
		PlatformMessageID: "ABCDEF123456",
		Direction:         direction,
		Content:           json.RawMessage(`{"text":"hello"}`),
		OwnerID:           "owner-1",
		OccurredAt:        time.Now().UTC(),
		SenderRemoteID:    "5511999887766@s.whatsapp.net",
		Platform:          ctxenums.PlatformWhatsApp,
		MessageType:       ctxenums.MessageTypeText,
		CreatedAt:         time.Now().UTC(),
		UpdatedAt:         time.Now().UTC(),
		Version:           1,
	})
}

func assertMessageErrorCode(t *testing.T, err error, code sharederrors.ErrorCode) {
	t.Helper()
	var appErr *sharederrors.AppError
	require.ErrorAs(t, err, &appErr)
	assert.Equal(t, code, appErr.Code)
}

// ---------------------------------------------------------------------------
// Edit
// ---------------------------------------------------------------------------

func TestMessage_Edit_UpdatesContentAndRaisesEvent(t *testing.T) {
	m := newTestMessage(t, ctxenums.DirectionSent)
	newContent := json.RawMessage(`{"text":"edited"}`)
	at := time.Now().UTC()

	err := m.Edit(newContent, at)

	require.NoError(t, err)
	assert.Equal(t, newContent, m.Content())
	require.NotNil(t, m.EditedAt())
	assert.Equal(t, at, *m.EditedAt())

	evts := m.PullDomainEvents()
	require.Len(t, evts, 1)
	assert.Equal(t, ctxevents.MessageEditedEventName, evts[0].GetEventName())
}

func TestMessage_Edit_ReturnsErrorIfDeleted(t *testing.T) {
	m := newTestMessage(t, ctxenums.DirectionSent)
	require.NoError(t, m.SoftDelete(time.Now().UTC()))
	m.PullDomainEvents()

	err := m.Edit(json.RawMessage(`{"text":"late edit"}`), time.Now().UTC())

	require.Error(t, err)
	assertMessageErrorCode(t, err, ctxerrors.CodeMessageDeleted)
}

// ---------------------------------------------------------------------------
// SoftDelete
// ---------------------------------------------------------------------------

func TestMessage_SoftDelete_SetsDeletedAtAndRaisesEvent(t *testing.T) {
	m := newTestMessage(t, ctxenums.DirectionReceived)
	at := time.Now().UTC()

	err := m.SoftDelete(at)

	require.NoError(t, err)
	require.NotNil(t, m.DeletedAt())
	assert.Equal(t, at, *m.DeletedAt())

	evts := m.PullDomainEvents()
	require.Len(t, evts, 1)
	assert.Equal(t, ctxevents.MessageDeletedEventName, evts[0].GetEventName())
}

func TestMessage_SoftDelete_ReturnsErrorIfAlreadyDeleted(t *testing.T) {
	m := newTestMessage(t, ctxenums.DirectionReceived)
	require.NoError(t, m.SoftDelete(time.Now().UTC()))
	m.PullDomainEvents()

	err := m.SoftDelete(time.Now().UTC())

	require.Error(t, err)
	assertMessageErrorCode(t, err, ctxerrors.CodeMessageAlreadyDeleted)
}

// ---------------------------------------------------------------------------
// ReconstructMessage
// ---------------------------------------------------------------------------

func TestMessage_ReconstructMessage_DoesNotRaiseEvents(t *testing.T) {
	editedAt := time.Now().UTC()
	m := entities.ReconstructMessage(entities.ReconstructMessageParams{
		ID:                uuid.New(),
		ChannelID:         uuid.New(),
		RemoteID:          "5511@s.whatsapp.net",
		PlatformMessageID: "MSG999",
		Direction:         ctxenums.DirectionReceived,
		Content:           json.RawMessage(`{"text":"restored"}`),
		OwnerID:           "owner-1",
		OccurredAt:        time.Now().UTC(),
		EditedAt:          &editedAt,
		SenderRemoteID:    "5511@s.whatsapp.net",
		Platform:          ctxenums.PlatformWhatsApp,
		MessageType:       ctxenums.MessageTypeText,
		CreatedAt:         time.Now().UTC(),
		UpdatedAt:         time.Now().UTC(),
		Version:           5,
	})

	assert.NotNil(t, m)
	assert.Equal(t, "MSG999", m.PlatformMessageID())
	assert.Equal(t, ctxenums.DirectionReceived, m.Direction())
	assert.Equal(t, 5, m.Version)
	assert.NotNil(t, m.EditedAt())
	assert.Nil(t, m.DeletedAt())

	// No events should be emitted on reconstruction.
	evts := m.PullDomainEvents()
	assert.Len(t, evts, 0)
}
