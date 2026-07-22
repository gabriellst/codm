package tests

import (
	"testing"

	wire "template/contracts-go/wire"
)

func TestParseOwnerMemberInvitedVariant(t *testing.T) {
	raw := []byte(`{
		"name": "integration.shared.owner.member_invited",
		"entityId": "o_1",
		"ownerId": "tenant-1",
		"occurredAt": "2024-01-01T00:00:00Z",
		"email": "invitee@example.com",
		"role": "MEMBER",
		"token": "tok_1",
		"expiresAt": "2024-01-08T00:00:00Z",
		"invitedByUserId": "u_1"
	}`)
	parsed, err := wire.ParseIntegrationEvent(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	event, ok := parsed.(wire.OwnerMemberInvitedEvent)
	if !ok {
		t.Fatalf("expected OwnerMemberInvitedEvent, got %T", parsed)
	}
	if event.Name != wire.OwnerMemberInvitedEventName {
		t.Fatalf("expected Name=%q, got %q", wire.OwnerMemberInvitedEventName, event.Name)
	}
	if event.OwnerID != "tenant-1" {
		t.Fatalf("expected OwnerID=%q, got %q", "tenant-1", event.OwnerID)
	}
	if event.Email != "invitee@example.com" {
		t.Fatalf("expected Email=%q, got %q", "invitee@example.com", event.Email)
	}
	// Role is the generated cross-cutting enum; confirm it unmarshals verbatim.
	if event.Role != wire.RoleMEMBER {
		t.Fatalf("expected Role=%q, got %q", wire.RoleMEMBER, event.Role)
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
