package whatsapp

import (
	"context"
	"database/sql"
	"log/slog"

	"github.com/google/uuid"
	_ "github.com/jackc/pgx/v5/stdlib"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"

	messagerepo "template/api-go/internal/channel/repositories/message"
	remoterepo "template/api-go/internal/channel/repositories/remote"
	"template/api-go/internal/channel/services/gateway"
	"template/api-go/internal/shared/config"
	repositories "template/api-go/internal/shared/repositories"
)

// WhatsmeowChannelFactory creates WhatsmeowChannel instances using a shared sqlstore container.
type WhatsmeowChannelFactory struct {
	container       *sqlstore.Container
	db              *sql.DB
	domainEventRepo repositories.DomainEventRepository
	remoteProjRepo  remoterepo.RemoteProjectionRepository
	messageProjRepo messagerepo.MessageProjectionRepository
}

// NewWhatsmeowChannelFactory creates a new factory backed by the given sqlstore container.
// Opens a dedicated *sql.DB to the whatsmeow database for MAC cleanup operations that
// require direct SQL (not available through the whatsmeow store interface).
func NewWhatsmeowChannelFactory(
	container *sqlstore.Container,
	repo repositories.DomainEventRepository,
	remoteRepo remoterepo.RemoteProjectionRepository,
	messageRepo messagerepo.MessageProjectionRepository,
	cfg *config.Config,
) (*WhatsmeowChannelFactory, error) {
	db, err := sql.Open("pgx", cfg.WhatsmeowDatabaseURL)
	if err != nil {
		return nil, err
	}
	return &WhatsmeowChannelFactory{
		container:       container,
		db:              db,
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
// This is used when reconnecting an instance that was previously paired.
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
		// Device not found in store at all — instance will need re-pairing via QR code.
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

// Close releases the underlying *sql.DB opened by NewWhatsmeowChannelFactory.
// It is safe to call Close multiple times or on a nil db field.
func (f *WhatsmeowChannelFactory) Close() error {
	if f.db != nil {
		return f.db.Close()
	}
	return nil
}

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
