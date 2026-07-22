package projections

import (
	"encoding/json"
	"testing"
	"time"
)

func TestMessage_ApplyDelivered_ForwardOnly(t *testing.T) {
	m := &Message{}
	t1 := time.Unix(1_700_000_000, 0).UTC()
	m.ApplyDelivered(t1)
	if m.DeliveredAt == nil || !m.DeliveredAt.Equal(t1) {
		t.Fatalf("deliveredAt = %v, want %v", m.DeliveredAt, t1)
	}

	// Earlier receipt is ignored (forward-only).
	m.ApplyDelivered(t1.Add(-time.Hour))
	if !m.DeliveredAt.Equal(t1) {
		t.Errorf("deliveredAt rolled back to %v, want %v", m.DeliveredAt, t1)
	}

	// Later receipt advances.
	t2 := t1.Add(time.Hour)
	m.ApplyDelivered(t2)
	if !m.DeliveredAt.Equal(t2) {
		t.Errorf("deliveredAt = %v, want %v", m.DeliveredAt, t2)
	}
}

func TestMessage_ApplySeen_ForwardOnly(t *testing.T) {
	m := &Message{}
	t1 := time.Unix(1_700_000_000, 0).UTC()
	m.ApplySeen(t1)
	m.ApplySeen(t1.Add(-time.Hour))
	if !m.SeenAt.Equal(t1) {
		t.Errorf("seenAt should not roll back; got %v", m.SeenAt)
	}
}

func TestMessage_ApplyEdited_OverlaysContent(t *testing.T) {
	m := &Message{Content: json.RawMessage(`{"type":"TEXT","text":"old"}`)}
	at := time.Unix(1_700_000_000, 0).UTC()
	newContent := json.RawMessage(`{"type":"TEXT","text":"new"}`)
	m.ApplyEdited(newContent, at)

	if string(m.Content) != `{"type":"TEXT","text":"new"}` {
		t.Errorf("content = %s", m.Content)
	}
	if m.EditedAt == nil || !m.EditedAt.Equal(at) {
		t.Errorf("editedAt = %v, want %v", m.EditedAt, at)
	}
}

func TestMessage_ApplySoftDelete_StampsWithoutRemoving(t *testing.T) {
	m := &Message{Content: json.RawMessage(`{"type":"TEXT","text":"x"}`)}
	at := time.Unix(1_700_000_000, 0).UTC()
	m.ApplySoftDelete(at)
	if m.DeletedAt == nil || !m.DeletedAt.Equal(at) {
		t.Errorf("deletedAt = %v, want %v", m.DeletedAt, at)
	}
	// Content is preserved for audit.
	if string(m.Content) != `{"type":"TEXT","text":"x"}` {
		t.Errorf("soft-delete must keep content; got %s", m.Content)
	}
}
