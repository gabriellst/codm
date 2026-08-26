package whatsapp

import (
	"context"
	"database/sql"
	"testing"

	"go.mau.fi/whatsmeow/proto/waAdv"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	waLog "go.mau.fi/whatsmeow/util/log"

	_ "modernc.org/sqlite"
)

// newTestContainer opens a fresh in-memory sqlite-backed sqlstore.Container,
// upgraded to whatsmeow's current schema, and registers cleanup. Mirrors the
// production wiring in whatsmeow_store.go (same "sqlite" dialect, modernc
// driver) minus the shared-file/FK-pragma specifics that only matter for the
// production multi-pool-over-one-file setup.
func newTestContainer(t *testing.T) *sqlstore.Container {
	t.Helper()
	db, err := sql.Open("sqlite", "file::memory:?cache=shared&_pragma=foreign_keys(1)")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	container := sqlstore.NewWithDB(db, "sqlite", waLog.Noop)
	if err := container.Upgrade(context.Background()); err != nil {
		t.Fatalf("upgrade schema: %v", err)
	}
	return container
}

// putDevice persists a device row for the given JID. NewDevice() populates
// real key material (required — scanDevice rejects short keys) but leaves
// Account nil, which container.PutDevice dereferences unconditionally; the
// zero-value ADVSignedDeviceIdentity satisfies that without needing a real
// pairing handshake.
func putDevice(t *testing.T, container *sqlstore.Container, jid types.JID) *store.Device {
	t.Helper()
	dev := container.NewDevice()
	dev.ID = &jid
	// whatsmeow_device's adv_* columns are NOT NULL, and adv_account_sig /
	// adv_account_sig_key / adv_device_sig carry CHECK(length(...) = N)
	// constraints (64/32/64 bytes — see the whatsmeow schema's
	// 00-latest-schema.sql). A real pairing fills these with the signed device
	// identity; a test only needs bytes of the right length.
	dev.Account = &waAdv.ADVSignedDeviceIdentity{
		Details:             []byte{0},
		AccountSignatureKey: make([]byte, 32),
		AccountSignature:    make([]byte, 64),
		DeviceSignature:     make([]byte, 64),
	}
	if err := dev.Save(context.Background()); err != nil {
		t.Fatalf("save device %s: %v", jid, err)
	}
	return dev
}

func userJID(user string, device uint16) types.JID {
	return types.JID{User: user, Device: device, Server: types.DefaultUserServer}
}

// TestFindDeviceByUserJID_PrefersMostRecentDevice is the RED/GREEN case for
// requirement 2 ("scan legado não escolhe device stale"). Production had two
// device rows for the same phone number — :14 (stale, already unlinked
// server-side) and :15 (the still-valid, currently-linked device) — and the
// legacy scan picked :14, the FIRST row GetAllDevices happened to return, not
// the most recent one. That stale pick made whatsmeow accept a connection the
// server would immediately reject with events.LoggedOut.
//
// Rows are inserted in DESCENDING device-number order specifically so a
// "return the first match" implementation (the old bug) would pick the wrong
// (higher-inserted-first, lower device number) one and fail this test.
func TestFindDeviceByUserJID_PrefersMostRecentDevice(t *testing.T) {
	container := newTestContainer(t)
	factory := &WhatsmeowChannelFactory{container: container}

	const phone = "5511999999999"
	old := putDevice(t, container, userJID(phone, 14))
	recent := putDevice(t, container, userJID(phone, 15))
	_ = old

	got := factory.findDeviceByUserJID(phone + "@s.whatsapp.net")
	if got == nil {
		t.Fatal("want a matched device, got nil")
	}
	if got.ID.Device != 15 {
		t.Fatalf("want the most recent device (Device=15), got Device=%d (chose %s over %s)",
			got.ID.Device, got.ID.String(), recent.ID.String())
	}
}

// TestFindDeviceByUserJID_SingleMatch covers the common (non-ambiguous) case:
// exactly one device row for the phone number is returned as-is.
func TestFindDeviceByUserJID_SingleMatch(t *testing.T) {
	container := newTestContainer(t)
	factory := &WhatsmeowChannelFactory{container: container}

	const phone = "5511888888888"
	putDevice(t, container, userJID(phone, 1))

	got := factory.findDeviceByUserJID(phone + "@s.whatsapp.net")
	if got == nil {
		t.Fatal("want a matched device, got nil")
	}
	if got.ID.Device != 1 {
		t.Fatalf("want Device=1, got Device=%d", got.ID.Device)
	}
}

// TestFindDeviceByUserJID_NoMatch covers the "needs fresh pairing" path: no
// device row exists for the phone number at all.
func TestFindDeviceByUserJID_NoMatch(t *testing.T) {
	container := newTestContainer(t)
	factory := &WhatsmeowChannelFactory{container: container}

	putDevice(t, container, userJID("5511777777777", 1))

	got := factory.findDeviceByUserJID("5511000000000@s.whatsapp.net")
	if got != nil {
		t.Fatalf("want nil for a phone number with no device row, got %s", got.ID.String())
	}
}
