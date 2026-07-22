package handlers

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"

	chanevents "template/api-go/internal/channel/events"
	"template/contracts-go/wire"
)

// These tests round-trip each read-model egress output through the generated
// wire decoder (decodePublished, defined in egress_test.go), proving the bridge
// emits a byte-for-byte valid FROZEN contract event.

func TestMessageSentEgress_PublishesFrozenContract(t *testing.T) {
	ext := &fakeExt{}
	h := NewMessageSentEgress(ext)

	channelID := uuid.New()
	internalID := uuid.New()
	ev := chanevents.NewMessageSentEvent(channelID, "owner-1", chanevents.MessageSentPayload{
		ChannelID:         channelID,
		MessageID:         "WA-OUT-1",
		InternalMessageID: internalID,
		RemoteID:          "558399@s.whatsapp.net",
		SenderID:          "558300@s.whatsapp.net",
		IsGroup:           false,
		Timestamp:         1_700_000_000,
		ObservedAt:        time.Unix(1_700_000_001, 0).UTC(),
		MessageType:       wire.MessageTypeTEXT,
		Content:           json.RawMessage(`{"type":"TEXT","text":"hi"}`),
		Platform:          wire.ChannelKindWHATSAPP,
		OwnerID:           "owner-1",
	})

	if err := h.Handle(context.Background(), ev); err != nil {
		t.Fatalf("handle: %v", err)
	}
	decoded := decodePublished(t, ext.published[0])
	sent, ok := decoded.(wire.ChannelMessageSentEvent)
	if !ok {
		t.Fatalf("decoded type = %T, want ChannelMessageSentEvent", decoded)
	}
	if sent.MessageID != "WA-OUT-1" || sent.InternalMessageID != internalID.String() {
		t.Errorf("unexpected ids: %+v", sent)
	}
	if sent.ContentJson != `{"type":"TEXT","text":"hi"}` {
		t.Errorf("contentJson = %q", sent.ContentJson)
	}
	if sent.MessageType != wire.MessageTypeTEXT || sent.Platform != wire.ChannelKindWHATSAPP {
		t.Errorf("unexpected enums: %+v", sent)
	}
	if sent.Timestamp != 1_700_000_000 {
		t.Errorf("timestamp = %d", sent.Timestamp)
	}
}

func TestRemoteCreatedEgress_PublishesFrozenContract(t *testing.T) {
	ext := &fakeExt{}
	h := NewRemoteCreatedEgress(ext)

	channelID := uuid.New()
	ev := chanevents.NewRemoteCreatedEvent(channelID, "owner-1", chanevents.RemoteCreatedPayload{
		ChannelID:   channelID,
		RemoteID:    "12036@g.us",
		ContactKind: wire.ContactKindGROUP,
		Platform:    wire.ChannelKindWHATSAPP,
		OwnerID:     "owner-1",
	})

	if err := h.Handle(context.Background(), ev); err != nil {
		t.Fatalf("handle: %v", err)
	}
	decoded := decodePublished(t, ext.published[0])
	rc, ok := decoded.(wire.ChannelRemoteCreatedEvent)
	if !ok {
		t.Fatalf("decoded type = %T, want ChannelRemoteCreatedEvent", decoded)
	}
	if rc.RemoteID != "12036@g.us" || rc.ContactKind != wire.ContactKindGROUP {
		t.Errorf("unexpected fields: %+v", rc)
	}
}

func TestMembershipAddedEgress_PublishesFrozenContract(t *testing.T) {
	ext := &fakeExt{}
	h := NewMembershipAddedEgress(ext)

	channelID := uuid.New()
	joinedAt := time.Unix(1_700_000_000, 0).UTC()
	ev := chanevents.NewMembershipAddedEvent(channelID, "owner-1", chanevents.MembershipAddedPayload{
		ChannelID: channelID,
		GroupID:   "12036@g.us",
		MemberID:  "558399@s.whatsapp.net",
		IsAdmin:   true,
		JoinedAt:  joinedAt,
		OwnerID:   "owner-1",
	})

	if err := h.Handle(context.Background(), ev); err != nil {
		t.Fatalf("handle: %v", err)
	}
	decoded := decodePublished(t, ext.published[0])
	m, ok := decoded.(wire.ChannelMembershipAddedEvent)
	if !ok {
		t.Fatalf("decoded type = %T, want ChannelMembershipAddedEvent", decoded)
	}
	if m.GroupID != "12036@g.us" || m.MemberID != "558399@s.whatsapp.net" || !m.IsAdmin {
		t.Errorf("unexpected fields: %+v", m)
	}
}

func TestMessageDeliveredEgress_PublishesFrozenContract(t *testing.T) {
	ext := &fakeExt{}
	h := NewMessageDeliveredEgress(ext)

	channelID := uuid.New()
	ev := chanevents.NewMessageDeliveredEvent(channelID, "owner-1", chanevents.MessageDeliveredPayload{
		ChannelID:  channelID,
		RemoteID:   "558399@s.whatsapp.net",
		SenderID:   "558399@s.whatsapp.net",
		MessageIDs: []string{"WA-1", "WA-2"},
		Timestamp:  1_700_000_000,
		Platform:   wire.ChannelKindWHATSAPP,
		OwnerID:    "owner-1",
	})

	if err := h.Handle(context.Background(), ev); err != nil {
		t.Fatalf("handle: %v", err)
	}
	decoded := decodePublished(t, ext.published[0])
	d, ok := decoded.(wire.ChannelMessageDeliveredEvent)
	if !ok {
		t.Fatalf("decoded type = %T, want ChannelMessageDeliveredEvent", decoded)
	}
	if len(d.MessageIds) != 2 || d.MessageIds[0] != "WA-1" {
		t.Errorf("messageIds = %v", d.MessageIds)
	}
}

func TestChatPresenceUpdatedEgress_PublishesFrozenContract(t *testing.T) {
	ext := &fakeExt{}
	h := NewChatPresenceUpdatedEgress(ext)

	channelID := uuid.New()
	ev := chanevents.NewChatPresenceUpdatedEvent(channelID, "owner-1", chanevents.ChatPresenceUpdatedPayload{
		ChannelID:  channelID,
		ChatID:     "558399@s.whatsapp.net",
		SenderID:   "558399@s.whatsapp.net",
		State:      wire.ChatPresenceTypecomposing,
		ObservedAt: time.Unix(1_700_000_000, 0).UTC(),
		OwnerID:    "owner-1",
	})

	if err := h.Handle(context.Background(), ev); err != nil {
		t.Fatalf("handle: %v", err)
	}
	decoded := decodePublished(t, ext.published[0])
	cp, ok := decoded.(wire.ChannelChatPresenceUpdatedEvent)
	if !ok {
		t.Fatalf("decoded type = %T, want ChannelChatPresenceUpdatedEvent", decoded)
	}
	if cp.ChatID != "558399@s.whatsapp.net" || cp.State != wire.ChatPresenceTypecomposing {
		t.Errorf("unexpected fields: %+v", cp)
	}
}

func TestContactsSyncedEgress_MapsToRemotesSynced(t *testing.T) {
	ext := &fakeExt{}
	h := NewContactsSyncedEgress(ext)

	channelID := uuid.New()
	ev := chanevents.NewContactsSyncedEvent(channelID, "owner-1", chanevents.ContactsSyncedPayload{
		ChannelID: channelID,
		Total:     120,
		Inserted:  118,
		OwnerID:   "owner-1",
	})

	if err := h.Handle(context.Background(), ev); err != nil {
		t.Fatalf("handle: %v", err)
	}
	if ext.published[0].GetEventName() != wire.ChannelRemotesSyncedEventName {
		t.Fatalf("contacts_synced should bridge to remotes_synced, got %q", ext.published[0].GetEventName())
	}
	decoded := decodePublished(t, ext.published[0])
	rs, ok := decoded.(wire.ChannelRemotesSyncedEvent)
	if !ok {
		t.Fatalf("decoded type = %T, want ChannelRemotesSyncedEvent", decoded)
	}
	if rs.Total != 120 || rs.Inserted != 118 {
		t.Errorf("unexpected counts: %+v", rs)
	}
}
