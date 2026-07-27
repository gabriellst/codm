package whatsapp

import (
	"context"
	"database/sql"
	"log/slog"

	"github.com/google/uuid"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"

	messagerepo "template/api-go/internal/channel/repositories/message"
	remoterepo "template/api-go/internal/channel/repositories/remote"
	"template/api-go/internal/channel/services/gateway"
	repositories "template/core-go/repositories"
)

// WhatsmeowChannelFactory creates WhatsmeowChannel instances using a shared sqlstore container.
// compile-time interface check.
var _ gateway.ChannelFactory = (*WhatsmeowChannelFactory)(nil)

type WhatsmeowChannelFactory struct {
	container       *sqlstore.Container
	db              *sql.DB
	domainEventRepo repositories.DomainEventRepository
	remoteProjRepo  remoterepo.RemoteProjectionRepository
	messageProjRepo messagerepo.MessageProjectionRepository
}

// NewWhatsmeowChannelFactory creates a new factory backed by the WhatsmeowStore.
// It reuses that store's handle (the FK-on pool on the shared SQLite file) for
// the MAC-cleanup statements that need direct SQL — no second connection to open,
// and no separate database to drift from the container's own tables.
func NewWhatsmeowChannelFactory(
	store *WhatsmeowStore,
	repo repositories.DomainEventRepository,
	remoteRepo remoterepo.RemoteProjectionRepository,
	messageRepo messagerepo.MessageProjectionRepository,
) (*WhatsmeowChannelFactory, error) {
	return &WhatsmeowChannelFactory{
		container:       store.Container,
		db:              store.DB,
		domainEventRepo: repo,
		remoteProjRepo:  remoteRepo,
		messageProjRepo: messageRepo,
	}, nil
}

// Create creates a new Channel for the given integrationID.
// If OwnerRemoteID is provided in config, it loads the existing device for reconnection.
// Otherwise, a new device is created for fresh pairing via QR code.
func (f *WhatsmeowChannelFactory) Create(integrationID uuid.UUID, config gateway.ChannelConfig) (gateway.Channel, error) {
	if config.OwnerRemoteID != "" {
		return f.CreateWithJID(integrationID, config.OwnerRemoteID, config)
	}

	device := f.container.NewDevice()

	ch := NewWhatsmeowChannel(integrationID, config.OwnerID, config.OwnerRemoteID, f.container, f.db, device, f.domainEventRepo, f.remoteProjRepo, f.messageProjRepo)

	slog.Info("created whatsmeow channel", "channelId", integrationID)
	return ch, nil
}

// CreateWithJID creates a Channel for an existing session identified by its JID string.
// This is used when reconnecting a channel that was previously paired.
//
// jidStr should be the full AD-JID (with device suffix) for an exact device lookup.
// For legacy records where only the normalized JID (without device suffix) was stored,
// it falls back to scanning all devices and matching by user portion of the JID.
func (f *WhatsmeowChannelFactory) CreateWithJID(integrationID uuid.UUID, jidStr string, config gateway.ChannelConfig) (gateway.Channel, error) {
	jid, err := types.ParseJID(jidStr)
	if err != nil {
		return nil, err
	}

	device, err := f.container.GetDevice(context.Background(), jid)
	if err != nil {
		return nil, err
	}

	if device == nil {
		// Exact lookup failed — likely a legacy record where OwnerJID was stored without
		// the device suffix (e.g. "5584...@s.whatsapp.net" instead of "5584...:96@s.whatsapp.net").
		// Fall back to scanning all devices and matching by the user (phone) portion.
		device = f.findDeviceByUserJID(jidStr)
		if device != nil {
			slog.Info("found device by user JID scan (legacy record)",
				"channelId", integrationID,
				"storedJID", jidStr,
				"deviceJID", device.ID.String(),
			)
		}
	}

	if device == nil {
		// Device not found in store at all — channel will need re-pairing via QR code.
		slog.Warn("device not found for JID, creating new device",
			"channelId", integrationID,
			"jid", jidStr,
		)
		device = f.container.NewDevice()
	}

	ch := NewWhatsmeowChannel(integrationID, config.OwnerID, config.OwnerRemoteID, f.container, f.db, device, f.domainEventRepo, f.remoteProjRepo, f.messageProjRepo)

	slog.Info("created whatsmeow channel from existing JID",
		"channelId", integrationID,
		"jid", jidStr,
	)
	return ch, nil
}

// Close is a no-op on the db: the factory BORROWS the WhatsmeowStore's handle
// rather than owning one, and that store closes its own pool from its fx OnStop
// hook. Closing here would yank the pool out from under the sqlstore container
// while whatsmeow is still shutting its sessions down.
func (f *WhatsmeowChannelFactory) Close() error { return nil }

// findDeviceByUserJID scans all devices in the store and returns the first one whose
// phone number (user part of the JID) matches the given JID string, ignoring the device suffix.
// This is a fallback for legacy records that stored a normalized JID without device suffix.
func (f *WhatsmeowChannelFactory) findDeviceByUserJID(jidStr string) *store.Device {
	normalizedTarget := StripDeviceSuffix(jidStr)
	devices, err := f.container.GetAllDevices(context.Background())
	if err != nil {
		slog.Warn("failed to scan devices for JID fallback", "error", err)
		return nil
	}
	for _, d := range devices {
		if d.ID != nil && StripDeviceSuffix(d.ID.String()) == normalizedTarget {
			return d
		}
	}
	return nil
}
