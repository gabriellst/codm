package mapper

import (
	"testing"

	"github.com/google/uuid"
	"go.mau.fi/whatsmeow/appstate"
	waHistorySync "go.mau.fi/whatsmeow/proto/waHistorySync"
	waSyncAction "go.mau.fi/whatsmeow/proto/waSyncAction"
	"go.mau.fi/whatsmeow/store"
	waMeowTypes "go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	"google.golang.org/protobuf/proto"

	channelenums "template/api-go/internal/channel/enums"
	ctxevents "template/api-go/internal/channel/events"
	remoteevents "template/api-go/internal/channel/events"
	"template/core-go/types"
)

func TestMapHistorySync_InitialBootstrap(t *testing.T) {
	instanceID := uuid.New()
	evt := &events.HistorySync{Data: &waHistorySync.HistorySync{
		SyncType: waHistorySync.HistorySync_INITIAL_BOOTSTRAP.Enum(),
		Progress: proto.Uint32(42),
	}}
	got := MapEvent(instanceID, "tenant", nil, nil, evt)
	if len(got) != 1 {
		t.Fatalf("expected 1 event, got %d", len(got))
	}
	if got[0].GetEventName() != ctxevents.GatewayHistorySyncEventName {
		t.Fatalf("expected %s, got %s", ctxevents.GatewayHistorySyncEventName, got[0].GetEventName())
	}
	typed, err := types.UnmarshalDomainEvent[ctxevents.ChannelGatewayHistorySyncPayload](got[0])
	if err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	if typed.Payload.HistorySyncType != channelenums.HistorySyncTypeInitial {
		t.Fatalf("want initial, got %q", typed.Payload.HistorySyncType)
	}
	if typed.Payload.Percent != 42 {
		t.Fatalf("want percent=42, got %d", typed.Payload.Percent)
	}
}

func TestMapHistorySync_DropsUnhandledTypes(t *testing.T) {
	instanceID := uuid.New()
	for _, st := range []waHistorySync.HistorySync_HistorySyncType{
		waHistorySync.HistorySync_FULL,
		waHistorySync.HistorySync_PUSH_NAME,
		waHistorySync.HistorySync_NON_BLOCKING_DATA,
		waHistorySync.HistorySync_ON_DEMAND,
	} {
		evt := &events.HistorySync{Data: &waHistorySync.HistorySync{SyncType: st.Enum()}}
		got := MapEvent(instanceID, "tenant", nil, nil, evt)
		if len(got) != 0 {
			t.Fatalf("SyncType=%s: expected no events, got %d", st.String(), len(got))
		}
	}
}

// Tests for remote_synced, membership_synced, message_received_synced, and
// message_sent_synced emissions have been removed (T9). Those event types have
// been deleted. The wave-4 T15 bootstrap rewrite will add new tests for
// remote_created / remote_updated / membership_added / membership_removed.

func TestMapHistorySync_PushnamesNoLongerEmitRemoteSynced(t *testing.T) {
	// After T9, pushnames processing is removed. INITIAL_BOOTSTRAP with pushnames
	// produces only 1 gateway event — no remote_synced.
	instanceID := uuid.New()
	evt := &events.HistorySync{Data: &waHistorySync.HistorySync{
		SyncType: waHistorySync.HistorySync_INITIAL_BOOTSTRAP.Enum(),
		Pushnames: []*waHistorySync.Pushname{
			{ID: proto.String("5511111111111@s.whatsapp.net"), Pushname: proto.String("Carla")},
		},
	}}
	got := MapEvent(instanceID, "tenant", nil, nil, evt)
	// Only the gateway event; remote_synced emission removed in T9.
	if len(got) != 1 {
		t.Fatalf("expected 1 event (gateway only), got %d", len(got))
	}
	if got[0].GetEventName() != ctxevents.GatewayHistorySyncEventName {
		t.Fatalf("expected %s, got %s", ctxevents.GatewayHistorySyncEventName, got[0].GetEventName())
	}
}

func TestMapHistorySync_ConversationsNoLongerEmitSyncedEvents(t *testing.T) {
	// After T9, conversations/participants/messages processing is removed from
	// mapHistorySync. INITIAL_BOOTSTRAP with conversations+participants produces
	// only 1 gateway event.
	instanceID := uuid.New()
	conv := &waHistorySync.Conversation{
		ID:   proto.String("1234-5678@g.us"),
		Name: proto.String("Family"),
		Participant: []*waHistorySync.GroupParticipant{
			{UserJID: proto.String("5511@s.whatsapp.net"), Rank: waHistorySync.GroupParticipant_REGULAR.Enum()},
		},
	}
	evt := &events.HistorySync{Data: &waHistorySync.HistorySync{
		SyncType:      waHistorySync.HistorySync_INITIAL_BOOTSTRAP.Enum(),
		Conversations: []*waHistorySync.Conversation{conv},
	}}
	got := MapEvent(instanceID, "tenant", nil, nil, evt)
	// Only the gateway event; remote_synced + membership_synced removed in T9.
	if len(got) != 1 {
		t.Fatalf("expected 1 event (gateway only), got %d", len(got))
	}
	if got[0].GetEventName() != ctxevents.GatewayHistorySyncEventName {
		t.Fatalf("expected gateway_history_sync at index 0, got %s", got[0].GetEventName())
	}
}

func TestMapHistorySync_SkipsBroadcastChats(t *testing.T) {
	instanceID := uuid.New()
	conv := &waHistorySync.Conversation{
		ID: proto.String("status@broadcast"),
	}
	evt := &events.HistorySync{Data: &waHistorySync.HistorySync{
		SyncType:      waHistorySync.HistorySync_INITIAL_BOOTSTRAP.Enum(),
		Conversations: []*waHistorySync.Conversation{conv},
	}}
	got := MapEvent(instanceID, "tenant", nil, nil, evt)
	// Only the gateway event; broadcast JIDs are skipped.
	if len(got) != 1 {
		t.Fatalf("expected 1 event (gateway only), got %d", len(got))
	}
}

func TestMapAppStateSyncComplete_RegularEmitsEvent(t *testing.T) {
	instanceID := uuid.New()
	evt := &events.AppStateSyncComplete{Name: appstate.WAPatchRegular}
	got := MapEvent(instanceID, "tenant", nil, nil, evt)
	if len(got) != 1 {
		t.Fatalf("expected 1 event, got %d", len(got))
	}
	if got[0].GetEventName() != ctxevents.GatewaySyncCompleteEventName {
		t.Fatalf("expected %s, got %s", ctxevents.GatewaySyncCompleteEventName, got[0].GetEventName())
	}
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelGatewaySyncCompletePayload](got[0])
	if err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if e.Payload.ChannelID != instanceID {
		t.Fatalf("want channelId=%s, got %s", instanceID, e.Payload.ChannelID)
	}
}

func TestMapPushName_EmitsRemoteUpdated(t *testing.T) {
	instanceID := uuid.New()
	jid, err := waMeowTypes.ParseJID("5511999999999@s.whatsapp.net")
	if err != nil {
		t.Fatalf("ParseJID: %v", err)
	}
	evt := &events.PushName{JID: jid, NewPushName: "Alice"}
	got := MapEvent(instanceID, "tenant", nil, nil, evt)
	if len(got) != 1 {
		t.Fatalf("want 1 event, got %d", len(got))
	}
	if got[0].GetEventName() != "channel.remote_updated" {
		t.Fatalf("want remote_updated, got %s", got[0].GetEventName())
	}
	e, err := types.UnmarshalDomainEvent[remoteevents.ChannelRemoteUpdatedPayload](got[0])
	if err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if e.Payload.Name != "Alice" || e.Payload.Type != channelenums.RemoteTypeUser {
		t.Fatalf("payload mismatch: %+v", e.Payload)
	}
}

func TestMapPushName_EmptyNameSkipsEntirely(t *testing.T) {
	instanceID := uuid.New()
	jid, _ := waMeowTypes.ParseJID("5511999999999@s.whatsapp.net")
	evt := &events.PushName{JID: jid, NewPushName: ""}
	if got := MapEvent(instanceID, "tenant", nil, nil, evt); len(got) != 0 {
		t.Fatalf("want 0 events, got %d", len(got))
	}
}

func TestMapContact_FullNamePreferredOverFirst(t *testing.T) {
	instanceID := uuid.New()
	jid, _ := waMeowTypes.ParseJID("5511999999999@s.whatsapp.net")
	full := "Alice Example"
	first := "Al"
	evt := &events.Contact{
		JID:    jid,
		Action: &waSyncAction.ContactAction{FullName: &full, FirstName: &first},
	}
	got := MapEvent(instanceID, "tenant", nil, nil, evt)
	if len(got) != 1 {
		t.Fatalf("want 1, got %d", len(got))
	}
	e, _ := types.UnmarshalDomainEvent[remoteevents.ChannelRemoteUpdatedPayload](got[0])
	if e.Payload.Name != "Alice Example" {
		t.Fatalf("want FullName priority, got %q", e.Payload.Name)
	}
}

func TestMapContact_EmptyNameSkips(t *testing.T) {
	instanceID := uuid.New()
	jid, _ := waMeowTypes.ParseJID("5511999999999@s.whatsapp.net")
	evt := &events.Contact{JID: jid, Action: nil}
	if got := MapEvent(instanceID, "tenant", nil, nil, evt); len(got) != 0 {
		t.Fatalf("want 0 events, got %d", len(got))
	}
}

func TestMapGroupInfo_MembershipOnlyChange(t *testing.T) {
	instanceID := uuid.New()
	groupJID, _ := waMeowTypes.ParseJID("111-222@g.us")
	joiner, _ := waMeowTypes.ParseJID("5511@s.whatsapp.net")
	leaver, _ := waMeowTypes.ParseJID("5512@s.whatsapp.net")
	promoted, _ := waMeowTypes.ParseJID("5513@s.whatsapp.net")
	demoted, _ := waMeowTypes.ParseJID("5514@s.whatsapp.net")

	// Name=nil, Topic=nil → no remote_updated; granular membership events per JID.
	// Join → membership_added, Leave → membership_removed, Promote → membership_added (isAdmin=true),
	// Demote → membership_added (isAdmin=false).
	evt := &events.GroupInfo{
		JID:     groupJID,
		Join:    []waMeowTypes.JID{joiner},
		Leave:   []waMeowTypes.JID{leaver},
		Promote: []waMeowTypes.JID{promoted},
		Demote:  []waMeowTypes.JID{demoted},
	}
	got := MapEvent(instanceID, "tenant", nil, nil, evt)
	if len(got) != 4 {
		t.Fatalf("want 4 membership events, got %d", len(got))
	}

	// Events are emitted in order: Join, Leave, Promote, Demote.
	// [0] = membership_added (joiner)
	if got[0].GetEventName() != ctxevents.MembershipAddedEventName {
		t.Fatalf("[0] want %s, got %s", ctxevents.MembershipAddedEventName, got[0].GetEventName())
	}
	added0, err := types.UnmarshalDomainEvent[ctxevents.ChannelMembershipAddedPayload](got[0])
	if err != nil {
		t.Fatalf("unmarshal membership_added[0]: %v", err)
	}
	if added0.Payload.MemberID != "5511@s.whatsapp.net" {
		t.Errorf("joiner memberID mismatch: got %q", added0.Payload.MemberID)
	}
	if added0.Payload.IsAdmin {
		t.Error("joiner should not be admin")
	}

	// [1] = membership_removed (leaver)
	if got[1].GetEventName() != ctxevents.MembershipRemovedEventName {
		t.Fatalf("[1] want %s, got %s", ctxevents.MembershipRemovedEventName, got[1].GetEventName())
	}
	removed1, err := types.UnmarshalDomainEvent[ctxevents.ChannelMembershipRemovedPayload](got[1])
	if err != nil {
		t.Fatalf("unmarshal membership_removed[1]: %v", err)
	}
	if removed1.Payload.MemberID != "5512@s.whatsapp.net" {
		t.Errorf("leaver memberID mismatch: got %q", removed1.Payload.MemberID)
	}

	// [2] = membership_added (promoted, isAdmin=true)
	if got[2].GetEventName() != ctxevents.MembershipAddedEventName {
		t.Fatalf("[2] want %s, got %s", ctxevents.MembershipAddedEventName, got[2].GetEventName())
	}
	added2, err := types.UnmarshalDomainEvent[ctxevents.ChannelMembershipAddedPayload](got[2])
	if err != nil {
		t.Fatalf("unmarshal membership_added[2]: %v", err)
	}
	if added2.Payload.MemberID != "5513@s.whatsapp.net" {
		t.Errorf("promoted memberID mismatch: got %q", added2.Payload.MemberID)
	}
	if !added2.Payload.IsAdmin {
		t.Error("promoted member should have isAdmin=true")
	}

	// [3] = membership_added (demoted, isAdmin=false)
	if got[3].GetEventName() != ctxevents.MembershipAddedEventName {
		t.Fatalf("[3] want %s, got %s", ctxevents.MembershipAddedEventName, got[3].GetEventName())
	}
	added3, err := types.UnmarshalDomainEvent[ctxevents.ChannelMembershipAddedPayload](got[3])
	if err != nil {
		t.Fatalf("unmarshal membership_added[3]: %v", err)
	}
	if added3.Payload.MemberID != "5514@s.whatsapp.net" {
		t.Errorf("demoted memberID mismatch: got %q", added3.Payload.MemberID)
	}
	if added3.Payload.IsAdmin {
		t.Error("demoted member should have isAdmin=false")
	}
}

func TestMapGroupInfo_AttributeChange_EmitsRemoteUpdated(t *testing.T) {
	instanceID := uuid.New()
	groupJID, _ := waMeowTypes.ParseJID("111-222@g.us")

	evt := &events.GroupInfo{
		JID:  groupJID,
		Name: &waMeowTypes.GroupName{Name: "New Name"},
	}
	got := MapEvent(instanceID, "tenant", nil, nil, evt)
	// Name changed but no membership deltas → exactly 1 remote_updated (type=group).
	if len(got) != 1 {
		t.Fatalf("want 1 remote_updated, got %d", len(got))
	}
	if got[0].GetEventName() != "channel.remote_updated" {
		t.Fatalf("want remote_updated, got %s", got[0].GetEventName())
	}
	p, err := types.UnmarshalDomainEvent[remoteevents.ChannelRemoteUpdatedPayload](got[0])
	if err != nil {
		t.Fatalf("unmarshal remote_updated: %v", err)
	}
	if p.Payload.Name != "New Name" {
		t.Fatalf("name mismatch: %v", p.Payload.Name)
	}
	if p.Payload.Type != channelenums.RemoteTypeGroup {
		t.Fatalf("type mismatch: want group, got %v", p.Payload.Type)
	}
	if p.Payload.Description != nil {
		t.Fatalf("description should be nil when not set, got %v", p.Payload.Description)
	}
}

func TestMapGroupInfo_NoChanges_ReturnsNil(t *testing.T) {
	instanceID := uuid.New()
	groupJID, _ := waMeowTypes.ParseJID("111-222@g.us")
	// No Name, Topic, Join, Leave, Promote, Demote → should return nil.
	evt := &events.GroupInfo{JID: groupJID}
	got := MapEvent(instanceID, "tenant", nil, nil, evt)
	if len(got) != 0 {
		t.Fatalf("want 0 events for no-op GroupInfo, got %d", len(got))
	}
}

func TestMapJoinedGroup_EmitsRemoteUpdatedAndSelfJoin(t *testing.T) {
	instanceID := uuid.New()
	groupJID, _ := waMeowTypes.ParseJID("999-888@g.us")
	selfJID, _ := waMeowTypes.ParseJID("5599@s.whatsapp.net")

	evt := &events.JoinedGroup{
		GroupInfo: waMeowTypes.GroupInfo{
			JID:       groupJID,
			GroupName: waMeowTypes.GroupName{Name: "My Group"},
		},
	}

	// Pass a device so the self-join branch fires.
	device := &store.Device{ID: &selfJID}
	got := MapEvent(instanceID, "tenant", device, nil, evt)

	// 1 remote_updated (type=group) + 1 membership_updated (self-join).
	if len(got) != 2 {
		t.Fatalf("want 2 events, got %d", len(got))
	}
	if got[0].GetEventName() != "channel.remote_updated" {
		t.Fatalf("want remote_updated at [0], got %s", got[0].GetEventName())
	}
	grp, err := types.UnmarshalDomainEvent[remoteevents.ChannelRemoteUpdatedPayload](got[0])
	if err != nil {
		t.Fatalf("unmarshal remote_updated: %v", err)
	}
	if grp.Payload.Name != "My Group" {
		t.Fatalf("name mismatch: %v", grp.Payload.Name)
	}
	if grp.Payload.Type != channelenums.RemoteTypeGroup {
		t.Fatalf("type mismatch: want group, got %v", grp.Payload.Type)
	}
	if got[1].GetEventName() != ctxevents.MembershipAddedEventName {
		t.Fatalf("want membership_added at [1], got %s", got[1].GetEventName())
	}
	mem, err := types.UnmarshalDomainEvent[ctxevents.ChannelMembershipAddedPayload](got[1])
	if err != nil {
		t.Fatalf("unmarshal membership_added: %v", err)
	}
	if mem.Payload.MemberID == "" {
		t.Fatal("want non-empty memberID for self-join")
	}
	if mem.Payload.IsAdmin {
		t.Error("self-join should not be admin")
	}
}

func TestMapJoinedGroup_NoDevice_SkipsSelfJoin(t *testing.T) {
	instanceID := uuid.New()
	groupJID, _ := waMeowTypes.ParseJID("999-888@g.us")
	evt := &events.JoinedGroup{
		GroupInfo: waMeowTypes.GroupInfo{
			JID:       groupJID,
			GroupName: waMeowTypes.GroupName{Name: "My Group"},
		},
	}
	got := MapEvent(instanceID, "tenant", nil, nil, evt)
	// Only 1 remote_updated (type=group) when device is nil.
	if len(got) != 1 {
		t.Fatalf("want 1 remote_updated, got %d", len(got))
	}
	if got[0].GetEventName() != "channel.remote_updated" {
		t.Fatalf("want remote_updated, got %s", got[0].GetEventName())
	}
}

func TestMapPicture_EmitsGatewayPictureChanged(t *testing.T) {
	instanceID := uuid.New()
	jid, err := waMeowTypes.ParseJID("5511999999999@s.whatsapp.net")
	if err != nil {
		t.Fatalf("ParseJID: %v", err)
	}
	evt := &events.Picture{JID: jid}
	got := MapEvent(instanceID, "tenant", nil, nil, evt)
	if len(got) != 1 {
		t.Fatalf("want 1 event, got %d", len(got))
	}
	if got[0].GetEventName() != ctxevents.GatewayPictureChangedEventName {
		t.Fatalf("want %s, got %s", ctxevents.GatewayPictureChangedEventName, got[0].GetEventName())
	}
	e, _ := types.UnmarshalDomainEvent[ctxevents.GatewayPictureChangedPayload](got[0])
	if e.Payload.RemoteID == "" {
		t.Fatalf("remoteId should be populated")
	}
}

func TestMapPicture_EmptyJIDReturnsNil(t *testing.T) {
	instanceID := uuid.New()
	evt := &events.Picture{}
	if got := MapEvent(instanceID, "tenant", nil, nil, evt); len(got) != 0 {
		t.Fatalf("want 0 events, got %d", len(got))
	}
}
