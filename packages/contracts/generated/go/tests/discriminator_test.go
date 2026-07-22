package tests

import (
	"testing"

	wire "template/contracts-go/wire"
)

func TestParseChannelMessageReceivedVariant(t *testing.T) {
	raw := []byte(`{
		"name": "integration.channel_message.received",
		"entityId": "ch_1",
		"ownerId": "tenant-1",
		"occurredAt": "2024-01-01T00:00:00Z",
		"channelId": "ch_1",
		"messageId": "wamid_1",
		"contactExternalId": "5511999990000",
		"contactDisplayName": "Ada",
		"contactKind": "CONTACT",
		"senderExternalId": "5511999990000",
		"isGroup": false,
		"text": "fix the coupon flow",
		"platform": "WHATSAPP",
		"receivedAt": "2024-01-01T00:00:00Z"
	}`)
	parsed, err := wire.ParseIntegrationEvent(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	event, ok := parsed.(wire.ChannelMessageReceivedEvent)
	if !ok {
		t.Fatalf("expected ChannelMessageReceivedEvent, got %T", parsed)
	}
	if event.Name != wire.ChannelMessageReceivedEventName {
		t.Fatalf("expected Name=%q, got %q", wire.ChannelMessageReceivedEventName, event.Name)
	}
	// ChannelKind + ContactKind are generated wire enums; confirm they unmarshal verbatim.
	if event.Platform != wire.ChannelKindWHATSAPP {
		t.Fatalf("expected Platform=%q, got %q", wire.ChannelKindWHATSAPP, event.Platform)
	}
	if event.ContactKind != wire.ContactKindCONTACT {
		t.Fatalf("expected ContactKind=%q, got %q", wire.ContactKindCONTACT, event.ContactKind)
	}
	// Absent optional (quotedEntryId) stays a nil pointer.
	if event.QuotedEntryID != nil {
		t.Fatalf("expected QuotedEntryID=nil, got %v", *event.QuotedEntryID)
	}
}

func TestParseThreadAttachedArrayOfEnum(t *testing.T) {
	raw := []byte(`{
		"name": "integration.thread.attached",
		"entityId": "th_1",
		"ownerId": "tenant-1",
		"occurredAt": "2024-01-01T00:00:00Z",
		"threadId": "th_1",
		"channelId": "ch_1",
		"contactExternalId": "5511999990000",
		"contactDisplayName": "Ada",
		"contactKind": "CONTACT",
		"workspaceId": "ws_1",
		"providers": ["CLAUDE_CODE", "CODEX"]
	}`)
	parsed, err := wire.ParseIntegrationEvent(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	event, ok := parsed.(wire.ThreadAttachedEvent)
	if !ok {
		t.Fatalf("expected ThreadAttachedEvent, got %T", parsed)
	}
	// []ProviderKind — the array-of-enum wire shape decodes verbatim.
	if len(event.Providers) != 2 || event.Providers[0] != wire.ProviderKindCLAUDE_CODE || event.Providers[1] != wire.ProviderKindCODEX {
		t.Fatalf("expected [CLAUDE_CODE CODEX], got %v", event.Providers)
	}
}

func TestParseSubscriptionChangedVariant(t *testing.T) {
	raw := []byte(`{
		"name": "integration.billing.subscription_changed",
		"entityId": "tenant-1",
		"ownerId": "tenant-1",
		"occurredAt": "2024-01-01T00:00:00Z"
	}`)
	parsed, err := wire.ParseIntegrationEvent(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	event, ok := parsed.(wire.SubscriptionChangedEvent)
	if !ok {
		t.Fatalf("expected SubscriptionChangedEvent, got %T", parsed)
	}
	if event.Name != wire.SubscriptionChangedEventName {
		t.Fatalf("expected Name=%q, got %q", wire.SubscriptionChangedEventName, event.Name)
	}
	if event.OwnerID != "tenant-1" {
		t.Fatalf("expected OwnerID=%q, got %q", "tenant-1", event.OwnerID)
	}
}

func TestRejectsUnknownName(t *testing.T) {
	raw := []byte(`{"name":"unknown","entityId":"x","ownerId":"t","occurredAt":"2024-01-01T00:00:00Z"}`)
	if _, err := wire.ParseIntegrationEvent(raw); err == nil {
		t.Fatalf("expected error for unknown name, got nil")
	}
}
