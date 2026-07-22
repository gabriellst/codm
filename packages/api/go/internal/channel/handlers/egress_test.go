package handlers

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"

	chanevents "template/api-go/internal/channel/events"
	"template/contracts-go/wire"
	"template/core-go/services/mediator"
	fwtypes "template/core-go/types"
)

// fakeExt captures published integration events so tests can assert the exact
// wire shape crossing the boundary.
type fakeExt struct{ published []fwtypes.IntegrationEventI }

func (f *fakeExt) Register(mediator.IntegrationEventHandler)                              {}
func (f *fakeExt) RegisterCallback(func(context.Context, fwtypes.IntegrationEventI))       {}
func (f *fakeExt) Publish(_ context.Context, e fwtypes.IntegrationEventI) error {
	f.published = append(f.published, e)
	return nil
}
func (f *fakeExt) Start(context.Context) error { return nil }
func (f *fakeExt) Stop(context.Context) error  { return nil }

// marshalPublished re-parses the captured event through the generated wire
// decoder — proving the egress output is byte-for-byte a frozen contract event.
func decodePublished(t *testing.T, e fwtypes.IntegrationEventI) wire.IntegrationEvent {
	t.Helper()
	raw, err := json.Marshal(e)
	if err != nil {
		t.Fatalf("marshal published event: %v", err)
	}
	got, err := wire.UnmarshalIntegrationEvent(raw)
	if err != nil {
		t.Fatalf("decode via wire.UnmarshalIntegrationEvent: %v (raw=%s)", err, raw)
	}
	return got
}

func TestMessageReceivedEgress_PublishesFrozenContract(t *testing.T) {
	ext := &fakeExt{}
	h := NewMessageReceivedEgress(ext)

	channelID := uuid.New()
	ev := chanevents.NewMessageReceivedEvent(channelID, "owner-1", chanevents.MessageReceivedPayload{
		ChannelID:   channelID,
		MessageID:   "MSG123",
		ContactID:   "558399@s.whatsapp.net",
		DisplayName: "Ada",
		SenderID:    "558399@s.whatsapp.net",
		IsGroup:     false,
		Text:        "fix the login bug",
		Kind:        wire.ChannelKindWHATSAPP,
		ReceivedAt:  time.Unix(1_700_000_000, 0).UTC(),
		OwnerID:     "owner-1",
	})

	if err := h.Handle(context.Background(), ev); err != nil {
		t.Fatalf("handle: %v", err)
	}
	if len(ext.published) != 1 {
		t.Fatalf("expected 1 published event, got %d", len(ext.published))
	}
	if ext.published[0].GetEventName() != wire.ChannelMessageReceivedEventName {
		t.Fatalf("published name = %q", ext.published[0].GetEventName())
	}

	decoded := decodePublished(t, ext.published[0])
	msg, ok := decoded.(wire.ChannelMessageReceivedEvent)
	if !ok {
		t.Fatalf("decoded type = %T, want ChannelMessageReceivedEvent", decoded)
	}
	if msg.ChannelID != channelID.String() {
		t.Errorf("channelId = %q, want %q", msg.ChannelID, channelID.String())
	}
	if msg.MessageID != "MSG123" || msg.Text != "fix the login bug" {
		t.Errorf("unexpected message fields: %+v", msg)
	}
	if msg.ContactKind != wire.ContactKindCONTACT {
		t.Errorf("contactKind = %q, want CONTACT", msg.ContactKind)
	}
	if msg.Platform != wire.ChannelKindWHATSAPP {
		t.Errorf("platform = %q, want WHATSAPP", msg.Platform)
	}
	if msg.QuotedEntryID != nil {
		t.Errorf("quotedEntryId = %v, want nil", msg.QuotedEntryID)
	}
}

func TestConnectedEgress_PublishesFrozenContract(t *testing.T) {
	ext := &fakeExt{}
	h := NewConnectedEgress(ext)

	channelID := uuid.New()
	ev := chanevents.NewConnectedEvent(channelID, "owner-1", chanevents.ConnectedPayload{
		ChannelID:     channelID,
		Kind:          wire.ChannelKindWHATSAPP,
		AccountDetail: "558399@s.whatsapp.net",
		PairedAt:      time.Unix(1_700_000_000, 0).UTC(),
		OwnerID:       "owner-1",
	})

	if err := h.Handle(context.Background(), ev); err != nil {
		t.Fatalf("handle: %v", err)
	}
	decoded := decodePublished(t, ext.published[0])
	conn, ok := decoded.(wire.ChannelConnectedEvent)
	if !ok {
		t.Fatalf("decoded type = %T, want ChannelConnectedEvent", decoded)
	}
	if conn.Kind != wire.ChannelKindWHATSAPP || conn.AccountDetail != "558399@s.whatsapp.net" {
		t.Errorf("unexpected connected fields: %+v", conn)
	}
}

func TestGroupContactKind(t *testing.T) {
	if contactKind(true) != wire.ContactKindGROUP {
		t.Error("contactKind(true) should be GROUP")
	}
	if contactKind(false) != wire.ContactKindCONTACT {
		t.Error("contactKind(false) should be CONTACT")
	}
}
