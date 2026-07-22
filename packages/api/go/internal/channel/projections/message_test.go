package projections_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"template/api-go/internal/channel/projections"
)

func TestMessage_ApplyDelivered_SetsDeliveredAt(t *testing.T) {
	m := &projections.Message{}
	at := time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC)

	m.ApplyDelivered(at)

	require.NotNil(t, m.DeliveredAt)
	assert.Equal(t, at, *m.DeliveredAt)
}

func TestMessage_ApplyDelivered_ForwardOnly(t *testing.T) {
	t1 := time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC)
	t2 := time.Date(2026, 1, 1, 9, 0, 0, 0, time.UTC) // earlier — out-of-order receipt

	m := &projections.Message{}
	m.ApplyDelivered(t1)
	m.ApplyDelivered(t2) // must not roll back

	assert.Equal(t, t1, *m.DeliveredAt, "DeliveredAt must not go backward")
}

func TestMessage_ApplyDelivered_Idempotent_SameTimestamp(t *testing.T) {
	at := time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC)
	m := &projections.Message{}

	m.ApplyDelivered(at)
	m.ApplyDelivered(at) // same timestamp — no change

	assert.Equal(t, at, *m.DeliveredAt)
}

func TestMessage_ApplySeen_SetSeenAt(t *testing.T) {
	m := &projections.Message{}
	at := time.Date(2026, 1, 1, 10, 30, 0, 0, time.UTC)

	m.ApplySeen(at)

	require.NotNil(t, m.SeenAt)
	assert.Equal(t, at, *m.SeenAt)
}

func TestMessage_ApplySeen_ForwardOnly(t *testing.T) {
	t1 := time.Date(2026, 1, 1, 10, 30, 0, 0, time.UTC)
	t2 := time.Date(2026, 1, 1, 9, 30, 0, 0, time.UTC) // earlier

	m := &projections.Message{}
	m.ApplySeen(t1)
	m.ApplySeen(t2) // out-of-order — must not roll back

	assert.Equal(t, t1, *m.SeenAt, "SeenAt must not go backward")
}

func TestMessage_ApplySeen_AdvancesFromEarlier(t *testing.T) {
	t1 := time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC)
	t2 := time.Date(2026, 1, 1, 11, 0, 0, 0, time.UTC) // later

	m := &projections.Message{}
	m.ApplySeen(t1)
	m.ApplySeen(t2)

	assert.Equal(t, t2, *m.SeenAt)
}

func TestMessage_ApplyEdited_ReplacesContentAndSetsEditedAt(t *testing.T) {
	original := json.RawMessage(`{"text":"hello"}`)
	updated := json.RawMessage(`{"text":"hello world"}`)
	at := time.Date(2026, 1, 1, 11, 0, 0, 0, time.UTC)

	m := &projections.Message{Content: original}
	m.ApplyEdited(updated, at)

	assert.JSONEq(t, `{"text":"hello world"}`, string(m.Content))
	require.NotNil(t, m.EditedAt)
	assert.Equal(t, at, *m.EditedAt)
}

func TestMessage_ApplySoftDelete_SetsDeletedAt(t *testing.T) {
	m := &projections.Message{}
	at := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)

	m.ApplySoftDelete(at)

	require.NotNil(t, m.DeletedAt)
	assert.Equal(t, at, *m.DeletedAt)
}

func TestMessage_ApplySoftDelete_DoesNotClearContent(t *testing.T) {
	content := json.RawMessage(`{"text":"important"}`)
	m := &projections.Message{Content: content}
	at := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)

	m.ApplySoftDelete(at)

	assert.JSONEq(t, `{"text":"important"}`, string(m.Content), "content preserved on soft delete")
}
