package events_test

// Wire-identity proof for the flat-events migration (.specs/codedm — flat-events phase).
//
// THE INVARIANT: swapping an integration event's declaration source (hand-rolled
// envelope + hand-rolled payload struct, both in internal/channel/events →
// generated binding in template/contracts-go/wire) MUST NOT change its marshaled
// wire JSON — field names, casing, omitempty behavior, value sets and envelope
// shape all byte-identical.
//
// The goldens in testdata/wire_identity.golden.json were captured at the pre-swap
// HEAD (hand-rolled declarations). Each case constructs the event with fixed
// representative values and asserts json.Marshal output against the golden. The
// constructions are edited during the swap commits ONLY where a Go identifier
// changes (e.g. an enum-typed field becoming the wire `string`); the golden bytes
// are never re-captured for a swap — a failing case means the swap changed the wire.
//
// Regenerate (ONLY for legitimately new cases, never to absorb a swap diff):
//
//	go test ./internal/channel/events/ -run TestWireIdentity -update

import (
	"encoding/json"
	"flag"
	"os"
	"path/filepath"
	"sort"
	"testing"
	"time"

	channelevents "template/api-go/internal/channel/events"
	"template/contracts-go/wire"
	"template/core-go/types"

	"github.com/google/uuid"

	channelenums "template/api-go/internal/channel/enums"
)

var update = flag.Bool("update", false, "rewrite testdata/wire_identity.golden.json from the current declarations")

var (
	fixedOwner = "owner-1"
	fixedID    = uuid.MustParse("e0e0e0e0-e0e0-40e0-80e0-e0e0e0e0e0e0")
	channelID  = uuid.MustParse("0b0b0b0b-0b0b-40b0-80b0-0b0b0b0b0b0b")
	messageID  = uuid.MustParse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
	t0         = time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	t1         = t0.Add(time.Minute)
)

// envelope builds the deterministic nested integration envelope
// {id, ownerId, time, name, payload} that the gateway XADDs to Redis.
func envelope[T any](name string, payload T) types.IntegrationEvent[T] {
	return types.IntegrationEvent[T]{
		ID:      fixedID,
		OwnerID: fixedOwner,
		Time:    t0,
		Name:    name,
		Payload: payload,
	}
}

func lastSeenPtr(v int64) *int64 { return &v }
func strPtr(s string) *string    { return &s }

// cases returns every published integration event constructed with fixed
// representative values, keyed by a stable case id.
func cases() map[string]any {
	return map[string]any{
		// ── message cluster ──────────────────────────────────────────────
		"channel_message.received": envelope(wire.ChannelMessageReceivedEventName,
			channelevents.ChannelMessageReceivedPayload{
				ChannelID:         channelID,
				MessageID:         "wamid-1",
				InternalMessageID: messageID,
				RemoteID:          "5511999999999@s.whatsapp.net",
				SenderID:          "5511999999999@s.whatsapp.net",
				FromMe:            false,
				Author:            channelenums.MessageAuthorHuman,
				IsGroup:           false,
				Timestamp:         1751371200,
				OccurredAt:        t0,
				ObservedAt:        t1,
				MessageType:       channelenums.MessageTypeText,
				Content:           json.RawMessage(`{"text":"hello"}`),
				Platform:          string(channelenums.PlatformWhatsApp),
				PlatformData:      json.RawMessage(`{"waMessageId":"wamid-1"}`),
				OwnerID:           fixedOwner,
			}),
		"channel_message.delivered": envelope(wire.ChannelMessageDeliveredEventName,
			channelevents.ChannelMessageDeliveredPayload{
				ChannelID:  channelID,
				RemoteID:   "5511999999999@s.whatsapp.net",
				SenderID:   "5511888888888@s.whatsapp.net",
				MessageIDs: []string{"wamid-1", "wamid-2"},
				Timestamp:  1751371200,
				Platform:   string(channelenums.PlatformWhatsApp),
				OwnerID:    fixedOwner,
			}),
		"channel_message.delivered/empty-ids": envelope(wire.ChannelMessageDeliveredEventName,
			channelevents.ChannelMessageDeliveredPayload{
				ChannelID: channelID,
				RemoteID:  "5511999999999@s.whatsapp.net",
				SenderID:  "5511888888888@s.whatsapp.net",
				Timestamp: 1751371200,
				Platform:  string(channelenums.PlatformWhatsApp),
				OwnerID:   fixedOwner,
			}),
		"channel_message.seen": envelope(wire.ChannelMessageSeenEventName,
			channelevents.ChannelMessageSeenPayload{
				ChannelID:  channelID,
				RemoteID:   "5511999999999@s.whatsapp.net",
				SenderID:   "5511888888888@s.whatsapp.net",
				MessageIDs: []string{"wamid-1"},
				Timestamp:  1751371200,
				Self:       true,
				Platform:   string(channelenums.PlatformWhatsApp),
				OwnerID:    fixedOwner,
			}),

		// ── presence cluster ─────────────────────────────────────────────
		"channel.presence_updated": envelope(wire.ChannelPresenceUpdatedEventName,
			channelevents.ChannelPresenceUpdatedPayload{
				ChannelID:   channelID,
				RemoteID:    "5511999999999@s.whatsapp.net",
				Unavailable: false,
				LastSeen:    lastSeenPtr(1751371200),
				ObservedAt:  t1,
				OwnerID:     fixedOwner,
			}),
		"channel.presence_updated/no-lastseen": envelope(wire.ChannelPresenceUpdatedEventName,
			channelevents.ChannelPresenceUpdatedPayload{
				ChannelID:   channelID,
				RemoteID:    "5511999999999@s.whatsapp.net",
				Unavailable: true,
				ObservedAt:  t1,
				OwnerID:     fixedOwner,
			}),
		"channel.chat_presence_updated": envelope(wire.ChannelChatPresenceUpdatedEventName,
			channelevents.ChannelChatPresenceUpdatedPayload{
				ChannelID:  channelID,
				ChatID:     "5511999999999@s.whatsapp.net",
				SenderID:   "5511888888888@s.whatsapp.net",
				State:      channelenums.ChatPresenceTypeComposing,
				ObservedAt: t1,
				OwnerID:    fixedOwner,
			}),

		// ── remotes cluster ──────────────────────────────────────────────
		"channel.remote_created": envelope(channelevents.ChannelRemoteCreatedEventName,
			channelevents.ChannelRemoteCreatedPayload{
				ChannelID:  channelID,
				RemoteID:   "5511999999999@s.whatsapp.net",
				RemoteType: channelenums.RemoteTypeUser,
				OwnerID:    fixedOwner,
				Platform:   channelenums.PlatformWhatsApp,
			}),
		"channel.remote_updated": envelope(channelevents.ChannelRemoteUpdatedEventName,
			channelevents.ChannelRemoteUpdatedPayload{
				ChannelID:   channelID,
				RemoteID:    "123456789@g.us",
				Type:        channelenums.RemoteTypeGroup,
				Name:        "Group Subject",
				Description: strPtr("group description"),
				ObservedAt:  t1,
				OwnerID:     fixedOwner,
			}),
		"channel.remote_updated/no-description": envelope(channelevents.ChannelRemoteUpdatedEventName,
			channelevents.ChannelRemoteUpdatedPayload{
				ChannelID:  channelID,
				RemoteID:   "5511999999999@s.whatsapp.net",
				Type:       channelenums.RemoteTypeUser,
				Name:       "Alice",
				ObservedAt: t1,
				OwnerID:    fixedOwner,
			}),
		"channel.remote_deleted": envelope(wire.ChannelRemoteDeletedEventName,
			channelevents.ChannelRemoteDeletedPayload{
				ChannelID: channelID,
				RemoteID:  "5511999999999@s.whatsapp.net",
				At:        t1,
				OwnerID:   fixedOwner,
			}),
		"channel.remotes_synced": envelope(wire.ChannelRemotesSyncedEventName,
			channelevents.ChannelRemotesSyncedPayload{
				ChannelID: channelID,
				OwnerID:   fixedOwner,
				Total:     10,
				Inserted:  5,
			}),
		"channel.messages_synced": envelope(wire.ChannelMessagesSyncedEventName,
			channelevents.ChannelMessagesSyncedPayload{
				ChannelID: channelID,
				OwnerID:   fixedOwner,
				Total:     100,
				Inserted:  42,
			}),
		"channel.membership_added": envelope(wire.ChannelMembershipAddedEventName,
			channelevents.ChannelMembershipAddedPayload{
				ChannelID: channelID,
				GroupID:   "123456789@g.us",
				MemberID:  "5511999999999@s.whatsapp.net",
				IsAdmin:   true,
				JoinedAt:  t1,
				OwnerID:   fixedOwner,
			}),
		"channel.membership_removed": envelope(wire.ChannelMembershipRemovedEventName,
			channelevents.ChannelMembershipRemovedPayload{
				ChannelID: channelID,
				GroupID:   "123456789@g.us",
				MemberID:  "5511999999999@s.whatsapp.net",
				RemovedAt: t1,
				OwnerID:   fixedOwner,
			}),

		// ── sync cluster ─────────────────────────────────────────────────
		"channel.sync_started": envelope(wire.ChannelSyncStartedEventName,
			channelevents.ChannelSyncStartedPayload{
				ChannelID: channelID,
				OwnerID:   fixedOwner,
				StartedAt: t1,
			}),
		"channel.sync_progress": envelope(wire.ChannelSyncProgressEventName,
			channelevents.ChannelSyncProgressPayload{
				ChannelID:       channelID,
				OwnerID:         fixedOwner,
				HistorySyncType: channelenums.HistorySyncTypeInitial,
				Percent:         42,
			}),
		"channel.sync_completed": envelope(wire.ChannelSyncCompletedEventName,
			channelevents.ChannelSyncCompletedPayload{
				ChannelID:   channelID,
				OwnerID:     fixedOwner,
				CompletedAt: t1,
			}),

		// ── connection trio (platformData deliberately nil — the mapper never
		//    sets it; the wire therefore carries NO platformData key) ──────
		"channel.connected": envelope(wire.ChannelConnectedEventName,
			channelevents.GatewayConnectedPayload{
				ChannelID: channelID,
				Platform:  string(channelenums.PlatformWhatsApp),
				OwnerID:   fixedOwner,
			}),
		"channel.disconnected": envelope(wire.ChannelDisconnectedEventName,
			channelevents.GatewayDisconnectedPayload{
				ChannelID: channelID,
				Platform:  string(channelenums.PlatformWhatsApp),
				OwnerID:   fixedOwner,
			}),
		"channel.logged_out": envelope(wire.ChannelLoggedOutEventName,
			channelevents.ChannelLoggedOutPayload{
				ChannelID: channelID,
				Reason:    "device_removed",
				Platform:  string(channelenums.PlatformWhatsApp),
				OwnerID:   fixedOwner,
			}),

		// ── special platform event ───────────────────────────────────────
		"channel_special_platform_event.received": envelope(wire.ChannelSpecialPlatformEventReceivedEventName,
			channelevents.ChannelSpecialPlatformEventPayload{
				ChannelID: channelID,
				EventName: "*events.QR",
				EventType: channelevents.PlatformEventQRCodeUpdated,
				Platform:  string(channelenums.PlatformWhatsApp),
				Payload:   json.RawMessage(`{"code":"2@abcdef"}`),
				OwnerID:   fixedOwner,
			}),
	}
}

// wireNameConsts asserts that the generated wire binding's *EventName consts carry
// the exact same wire discriminator values the hand-rolled envelopes declare —
// swap commits change the publishers' const SOURCE, so value equality is load-bearing.
func TestWireIdentityNameConsts(t *testing.T) {
	pairs := map[string][2]string{
		"remote_created": {channelevents.ChannelRemoteCreatedEventName, wire.ChannelRemoteCreatedEventName},
		"remote_updated": {channelevents.ChannelRemoteUpdatedEventName, wire.ChannelRemoteUpdatedEventName},
	}
	for id, pair := range pairs {
		if pair[0] != pair[1] {
			t.Errorf("%s: hand-rolled const %q != wire binding const %q", id, pair[0], pair[1])
		}
	}
}

func TestWireIdentity(t *testing.T) {
	goldenPath := filepath.Join("testdata", "wire_identity.golden.json")

	// Goldens are stored as JSON STRINGS (not raw objects) so the compact
	// marshal output is preserved byte-for-byte through the golden file.
	actual := map[string]string{}
	ids := make([]string, 0, len(cases()))
	for id, evt := range cases() {
		data, err := json.Marshal(evt)
		if err != nil {
			t.Fatalf("%s: marshal: %v", id, err)
		}
		actual[id] = string(data)
		ids = append(ids, id)
	}
	sort.Strings(ids)

	if *update {
		out, err := json.MarshalIndent(actual, "", "\t")
		if err != nil {
			t.Fatal(err)
		}
		if err := os.MkdirAll("testdata", 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(goldenPath, append(out, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
		t.Logf("wrote %s (%d cases)", goldenPath, len(actual))
		return
	}

	raw, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatalf("read golden (run with -update to capture at pre-swap HEAD first): %v", err)
	}
	var golden map[string]string
	if err := json.Unmarshal(raw, &golden); err != nil {
		t.Fatalf("parse golden: %v", err)
	}

	for _, id := range ids {
		want, ok := golden[id]
		if !ok {
			t.Errorf("%s: missing golden entry (new case? capture with -update BEFORE swapping)", id)
			continue
		}
		if want != actual[id] {
			t.Errorf("%s: wire JSON drifted from pre-swap golden\n  want: %s\n  got:  %s", id, want, actual[id])
		}
	}
	for id := range golden {
		if _, ok := actual[id]; !ok {
			t.Errorf("%s: golden entry has no constructed case — a swapped event lost its wire-identity proof", id)
		}
	}
}
