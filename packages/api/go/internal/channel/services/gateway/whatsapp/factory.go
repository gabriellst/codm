package whatsapp

import (
	"context"
	"log/slog"

	"github.com/google/uuid"
	_ "github.com/jackc/pgx/v5/stdlib"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	waTypes "go.mau.fi/whatsmeow/types"

	"template/api-go/internal/channel/services/gateway"
	"template/core-go/repositories"
)

// WhatsmeowChannelFactory builds WhatsmeowChannel instances from a shared
// sqlstore container. Implements gateway.ChannelFactory for wire.ChannelKindWHATSAPP.
type WhatsmeowChannelFactory struct {
	container       *sqlstore.Container
	domainEventRepo repositories.DomainEventRepository
}

func NewWhatsmeowChannelFactory(
	container *sqlstore.Container,
	repo repositories.DomainEventRepository,
) *WhatsmeowChannelFactory {
	return &WhatsmeowChannelFactory{container: container, domainEventRepo: repo}
}

// compile-time factory check.
var _ gateway.ChannelFactory = (*WhatsmeowChannelFactory)(nil)

// Create builds a channel. A non-empty config.OwnerRemoteID reconnects an
// existing device; empty creates a fresh device for QR pairing.
func (f *WhatsmeowChannelFactory) Create(channelID uuid.UUID, config gateway.ChannelConfig) (gateway.Channel, error) {
	var device *store.Device

	if config.OwnerRemoteID != "" {
		if d := f.loadDevice(config.OwnerRemoteID); d != nil {
			device = d
		}
	}
	if device == nil {
		device = f.container.NewDevice()
	}

	ch := NewWhatsmeowChannel(channelID, config.OwnerID, config.OwnerRemoteID, f.container, device, f.domainEventRepo)
	slog.Info("created whatsmeow channel", "channelId", channelID)
	return ch, nil
}

// loadDevice resolves a stored device by JID, falling back to a user-portion
// scan for legacy records stored without the device suffix.
func (f *WhatsmeowChannelFactory) loadDevice(jidStr string) *store.Device {
	jid, err := waTypes.ParseJID(jidStr)
	if err == nil {
		if d, derr := f.container.GetDevice(context.Background(), jid); derr == nil && d != nil {
			return d
		}
	}
	// Fallback: scan by user (phone) portion, ignoring device suffix.
	normalized := StripDeviceSuffix(jidStr)
	devices, err := f.container.GetAllDevices(context.Background())
	if err != nil {
		slog.Warn("factory: device scan failed", "error", err)
		return nil
	}
	for _, d := range devices {
		if d.ID != nil && StripDeviceSuffix(d.ID.String()) == normalized {
			return d
		}
	}
	return nil
}
