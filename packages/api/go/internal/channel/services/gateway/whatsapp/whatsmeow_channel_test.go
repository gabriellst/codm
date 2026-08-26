package whatsapp

import (
	stderrors "errors"
	"sync"
	"testing"

	"github.com/google/uuid"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/store"
	waevents "go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"

	ctxerrors "template/api-go/internal/channel/errors"
	coreerrors "template/core-go/errors"
)

// fakeEvictor records Remove calls — the test double for gateway.PoolEvictor.
type fakeEvictor struct {
	mu      sync.Mutex
	removed []uuid.UUID
}

func (f *fakeEvictor) Remove(channelID uuid.UUID) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.removed = append(f.removed, channelID)
}

func (f *fakeEvictor) calls() []uuid.UUID {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]uuid.UUID, len(f.removed))
	copy(out, f.removed)
	return out
}

// TestHandleEvent_LoggedOut_EvictsChannelFromPool is the RED/GREEN case for
// requirement 1 ("evicção após logout"): production showed the gateway
// answering every connect after a logout with 500 "invalid use of deleted
// device" because the pool kept serving the SAME WhatsmeowChannel — bound to a
// whatsmeow device store that whatsmeow itself had permanently deleted
// (store.Device.Delete, triggered by events.LoggedOut — see
// connectionevents.go in the whatsmeow module). The fix: handleEvent must ask
// its evictor to drop this channel's pool entry the moment LoggedOut fires, so
// the NEXT pool.Register for the same channelId builds a fresh channel/device
// instead of reusing the dead one.
func TestHandleEvent_LoggedOut_EvictsChannelFromPool(t *testing.T) {
	instanceID := uuid.New()
	evictor := &fakeEvictor{}
	ch := &WhatsmeowChannel{
		instanceID:      instanceID,
		ownerID:         "tenant",
		domainEventRepo: &fakeDomainEventRepo{},
		evictor:         evictor,
	}

	ch.handleEvent(&waevents.LoggedOut{Reason: waevents.ConnectFailureLoggedOut})

	calls := evictor.calls()
	if len(calls) != 1 {
		t.Fatalf("want exactly 1 evictor.Remove call, got %d", len(calls))
	}
	if calls[0] != instanceID {
		t.Fatalf("want evictor.Remove(%s), got Remove(%s)", instanceID, calls[0])
	}

	// The LoggedOut mapper still runs and persists the domain event — eviction
	// is an ADDITIONAL side effect, not a replacement for the existing one.
	if ch.domainEventRepo.(*fakeDomainEventRepo).count.Load() != 1 {
		t.Fatalf("want the channel.gateway_logged_out domain event still persisted")
	}
}

// TestHandleEvent_LoggedOut_NilEvictorIsSafe guards the nil-evictor path used
// by every OTHER test in this package that constructs WhatsmeowChannel{}
// directly without wiring one (e.g. bootstrap_test.go) — handleEvent must not
// panic just because nothing ever called SetEvictor.
func TestHandleEvent_LoggedOut_NilEvictorIsSafe(t *testing.T) {
	ch := &WhatsmeowChannel{
		instanceID:      uuid.New(),
		ownerID:         "tenant",
		domainEventRepo: &fakeDomainEventRepo{},
	}

	ch.handleEvent(&waevents.LoggedOut{Reason: waevents.ConnectFailureLoggedOut})
}

// TestHandleEvent_OtherEvents_DoNotEvict guards against an overly broad
// eviction trigger — only events.LoggedOut should evict; a plain disconnect
// (which auto-reconnects) must not tear down the pool entry.
func TestHandleEvent_OtherEvents_DoNotEvict(t *testing.T) {
	evictor := &fakeEvictor{}
	ch := &WhatsmeowChannel{
		instanceID:      uuid.New(),
		ownerID:         "tenant",
		domainEventRepo: &fakeDomainEventRepo{},
		evictor:         evictor,
	}

	ch.handleEvent(&waevents.Disconnected{})
	ch.handleEvent(&waevents.Connected{})

	if calls := evictor.calls(); len(calls) != 0 {
		t.Fatalf("want no evictor.Remove calls for Disconnected/Connected, got %d", len(calls))
	}
}

// deletedDeviceChannel builds a WhatsmeowChannel wrapping a *whatsmeow.Client
// whose device store is ALREADY in the permanently-deleted state
// (store.Device.Delete sets both ID=nil and Deleted=true together — see
// store.go). unlockedConnect short-circuits on Store.Deleted before any
// network I/O (client.go: "if cli.Store.Deleted { return store.ErrDeviceDeleted }"),
// so Connect()/GetQRChannel() are fully exercisable offline against this
// fixture — no real WhatsApp connection needed to reproduce the bug.
func deletedDeviceChannel() *WhatsmeowChannel {
	device := &store.Device{Deleted: true}
	client := whatsmeow.NewClient(device, waLog.Noop)
	return &WhatsmeowChannel{
		instanceID: uuid.New(),
		client:     client,
		device:     device,
		// ownerRemoteID left empty so purgeStaleDevices (called by Connect on the
		// ID==nil path) is a no-op and doesn't need a real container.
	}
}

// TestConnect_DeviceDeleted_ReturnsNamedErrorNotRaw is the safety-net half of
// requirement 1: even if a caller reaches Connect() on a channel whose device
// was already permanently deleted (the narrow race the LoggedOut eviction
// can't close — see deviceInvalidatedError's docblock), the raw
// store.ErrDeviceDeleted ("invalid use of deleted device") must never escape
// to the HTTP layer as a generic 500. This is the ID==nil branch of Connect —
// the exact branch the production incident's two failing POST /connect calls
// went through (device.Delete sets Store.ID=nil, so every retry after logout
// lands here, not in the ID!=nil branch).
func TestConnect_DeviceDeleted_ReturnsNamedErrorNotRaw(t *testing.T) {
	ch := deletedDeviceChannel()

	err := ch.Connect(t.Context())
	if err == nil {
		t.Fatal("want an error connecting a permanently-deleted device, got nil")
	}
	if stderrors.Is(err, store.ErrDeviceDeleted) {
		t.Fatalf("raw store.ErrDeviceDeleted escaped Connect() — want it wrapped as a named AppError: %v", err)
	}

	var appErr *coreerrors.AppError
	if !stderrors.As(err, &appErr) {
		t.Fatalf("want a *coreerrors.AppError, got %T: %v", err, err)
	}
	if appErr.Code != ctxerrors.CodeChannelDeviceInvalidated {
		t.Fatalf("want code %s, got %s", ctxerrors.CodeChannelDeviceInvalidated, appErr.Code)
	}
}

// TestGetQRChannel_DeviceDeleted_ReturnsNamedErrorNotRaw covers the OTHER
// call site that surfaced the raw error in production: ConnectChannelHandler
// tries GetQRChannel() first and only falls back to Connect() when that
// errors (usecases/connect_channel.go) — so GetQRChannel's own internal
// client.Connect() call needs the identical safety net.
func TestGetQRChannel_DeviceDeleted_ReturnsNamedErrorNotRaw(t *testing.T) {
	ch := deletedDeviceChannel()

	_, err := ch.GetQRChannel(t.Context())
	if err == nil {
		t.Fatal("want an error getting a QR channel for a permanently-deleted device, got nil")
	}
	if stderrors.Is(err, store.ErrDeviceDeleted) {
		t.Fatalf("raw store.ErrDeviceDeleted escaped GetQRChannel() — want it wrapped as a named AppError: %v", err)
	}

	var appErr *coreerrors.AppError
	if !stderrors.As(err, &appErr) {
		t.Fatalf("want a *coreerrors.AppError, got %T: %v", err, err)
	}
	if appErr.Code != ctxerrors.CodeChannelDeviceInvalidated {
		t.Fatalf("want code %s, got %s", ctxerrors.CodeChannelDeviceInvalidated, appErr.Code)
	}
}
