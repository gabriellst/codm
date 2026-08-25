package mock

import (
	"context"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	enums "template/api-go/internal/channel/enums"
	ctxevents "template/api-go/internal/channel/events"
	"template/api-go/internal/channel/services/gateway"
	"template/core-go/types"
)

// fakeDomainEventRepo is a minimal in-memory repositories.DomainEventRepository
// double — enough to assert WHICH events the mock persisted, without pulling
// in a real outbox/PGlite harness (that's testenv, a later task in this plan).
type fakeDomainEventRepo struct {
	mu     sync.Mutex
	events []types.DomainEventI
}

func (r *fakeDomainEventRepo) Save(ctx context.Context, event types.DomainEventI) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.events = append(r.events, event)
	return nil
}

func (r *fakeDomainEventRepo) SaveAll(ctx context.Context, events []types.DomainEventI) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.events = append(r.events, events...)
	return nil
}

func (r *fakeDomainEventRepo) all() []types.DomainEventI {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]types.DomainEventI, len(r.events))
	copy(out, r.events)
	return out
}

func (r *fakeDomainEventRepo) names() []string {
	events := r.all()
	names := make([]string, len(events))
	for i, e := range events {
		names[i] = e.GetEventName()
	}
	return names
}

func containsName(names []string, want string) bool {
	for _, n := range names {
		if n == want {
			return true
		}
	}
	return false
}

func TestGetQRChannel_EmitsFramesInScenarioOrder(t *testing.T) {
	repo := &fakeDomainEventRepo{}
	scenario := Scenario{QRFrames: []string{"frame-1", "frame-2", "frame-3"}}
	factory := NewMockChannelFactory(scenario, repo)

	ch, err := factory.Create(uuid.New(), gateway.ChannelConfig{OwnerID: "owner-1"})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	qrChan, err := ch.GetQRChannel(context.Background())
	if err != nil {
		t.Fatalf("GetQRChannel: %v", err)
	}

	var got []string
	for frame := range qrChan {
		got = append(got, frame.Code)
	}

	want := []string{"frame-1", "frame-2", "frame-3"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("frames = %v, want %v", got, want)
	}
}

func TestConnect_AutoPairsAfterDelay_ReachesRealConnectedMapper(t *testing.T) {
	repo := &fakeDomainEventRepo{}
	scenario := Scenario{AutoPairAfter: 20 * time.Millisecond}
	factory := NewMockChannelFactory(scenario, repo)

	ch, err := factory.Create(uuid.New(), gateway.ChannelConfig{OwnerID: "owner-1"})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := ch.Connect(context.Background()); err != nil {
		t.Fatalf("Connect: %v", err)
	}

	if got := ch.Status(); got != gateway.ConnectionStatusConnecting {
		t.Fatalf("status right after Connect = %s, want CONNECTING", got)
	}

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) && ch.Status() != gateway.ConnectionStatusConnected {
		time.Sleep(5 * time.Millisecond)
	}

	if got := ch.Status(); got != gateway.ConnectionStatusConnected {
		t.Fatalf("status after AutoPairAfter = %s, want CONNECTED", got)
	}

	// The event must have come from the REAL mapper (mapper.MapEvent's
	// *events.Connected case), not a hand-rolled stand-in — asserting on the
	// exact wire event name the mapper/connected.go constructor stamps proves
	// that path ran.
	if names := repo.names(); !containsName(names, ctxevents.GatewayConnectedEventName) {
		t.Fatalf("expected %q in domain event repo, got %v", ctxevents.GatewayConnectedEventName, names)
	}
}

func TestSendMessage_DeterministicID(t *testing.T) {
	repo := &fakeDomainEventRepo{}
	factory := NewMockChannelFactory(Scenario{}, repo)

	ch, err := factory.Create(uuid.New(), gateway.ChannelConfig{OwnerID: "owner-1"})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	params := gateway.SendMessageParams{
		To:          "5511999999999@s.whatsapp.net",
		MessageType: enums.MessageTypeText,
		Content:     gateway.SendTextContent{Text: "hi"},
	}

	r1, err := ch.SendMessage(context.Background(), params)
	if err != nil {
		t.Fatalf("SendMessage (1st): %v", err)
	}
	r2, err := ch.SendMessage(context.Background(), params)
	if err != nil {
		t.Fatalf("SendMessage (2nd): %v", err)
	}

	if r1.MessageID == "" {
		t.Fatal("MessageID must not be empty")
	}
	if r1.MessageID != r2.MessageID {
		t.Fatalf("MessageID not deterministic: %s != %s", r1.MessageID, r2.MessageID)
	}

	other, err := ch.SendMessage(context.Background(), gateway.SendMessageParams{
		To:          "5511888888888@s.whatsapp.net",
		MessageType: enums.MessageTypeText,
		Content:     gateway.SendTextContent{Text: "hi"},
	})
	if err != nil {
		t.Fatalf("SendMessage (different To): %v", err)
	}
	if other.MessageID == r1.MessageID {
		t.Fatalf("different input produced the same MessageID: %s", other.MessageID)
	}
}

func TestStreamContactSnapshot_ServesScenarioContacts(t *testing.T) {
	repo := &fakeDomainEventRepo{}
	contacts := []gateway.ContactSnapshot{
		{RemoteID: "5511999999999@s.whatsapp.net", RemoteType: "USER", Name: "Alice"},
		{
			RemoteID:   "120363145252584936@g.us",
			RemoteType: "GROUP",
			Name:       "Team",
			Members:    []gateway.MemberSnapshot{{RemoteID: "5511888888888@s.whatsapp.net", IsAdmin: true}},
		},
	}
	factory := NewMockChannelFactory(Scenario{Contacts: contacts}, repo)

	ch, err := factory.Create(uuid.New(), gateway.ChannelConfig{OwnerID: "owner-1"})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	var got []gateway.ContactSnapshot
	for snapshot := range ch.StreamContactSnapshot(context.Background()) {
		got = append(got, snapshot)
	}

	if !reflect.DeepEqual(got, contacts) {
		t.Fatalf("contacts = %+v, want %+v", got, contacts)
	}
}

func TestConnect_EmitsScenarioInboundMessagesAfterPairing(t *testing.T) {
	repo := &fakeDomainEventRepo{}
	scenario := Scenario{
		InboundMessages: []InboundSeed{
			{RemoteID: "5511999999999@s.whatsapp.net", Text: "oi"},
			{RemoteID: "5511888888888@s.whatsapp.net", Text: "tudo bem?"},
		},
	}
	factory := NewMockChannelFactory(scenario, repo)

	ch, err := factory.Create(uuid.New(), gateway.ChannelConfig{OwnerID: "owner-1"})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := ch.Connect(context.Background()); err != nil {
		t.Fatalf("Connect: %v", err)
	}

	deadline := time.Now().Add(2 * time.Second)
	count := func() int {
		n := 0
		for _, name := range repo.names() {
			if name == ctxevents.MessageReceivedEventName {
				n++
			}
		}
		return n
	}
	for time.Now().Before(deadline) && count() < len(scenario.InboundMessages) {
		time.Sleep(5 * time.Millisecond)
	}

	if got := count(); got != len(scenario.InboundMessages) {
		t.Fatalf("channel.message_received events = %d, want %d", got, len(scenario.InboundMessages))
	}
}
