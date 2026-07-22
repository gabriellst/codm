package whatsapp

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waCompanionReg"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"

	chanevents "template/api-go/internal/channel/events"
	"template/api-go/internal/channel/services/gateway"
	"template/contracts-go/wire"
	"template/core-go/repositories"
)

// WhatsmeowChannel wraps a whatsmeow.Client to implement gateway.Channel.
// It is the single realized adapter and the reference shape for a second
// platform (Instagram/Telegram) — see gateway.go's "Adding a New Platform".
type WhatsmeowChannel struct {
	channelID       uuid.UUID
	ownerID         string
	ownerRemoteID   string
	client          *whatsmeow.Client
	device          *store.Device
	container       *sqlstore.Container
	domainEventRepo repositories.DomainEventRepository

	status     gateway.ConnectionStatus
	mu         sync.RWMutex
	stopCtx    context.Context
	stopCancel context.CancelFunc
}

func init() {
	store.DeviceProps.PlatformType = waCompanionReg.DeviceProps_CHROME.Enum()
	store.DeviceProps.Os = proto.String("CodeDM")
}

// NewWhatsmeowChannel wraps the given whatsmeow device.
func NewWhatsmeowChannel(
	channelID uuid.UUID,
	ownerID string,
	ownerRemoteID string,
	container *sqlstore.Container,
	device *store.Device,
	repo repositories.DomainEventRepository,
) *WhatsmeowChannel {
	client := whatsmeow.NewClient(device, waLog.Stdout("whatsmeow", "INFO", true))
	client.EnableAutoReconnect = true
	client.AutoTrustIdentity = true

	stopCtx, stopCancel := context.WithCancel(context.Background())

	ch := &WhatsmeowChannel{
		channelID:       channelID,
		ownerID:         ownerID,
		ownerRemoteID:   ownerRemoteID,
		client:          client,
		device:          device,
		container:       container,
		domainEventRepo: repo,
		status:          gateway.ConnectionStatusDisconnected,
		stopCtx:         stopCtx,
		stopCancel:      stopCancel,
	}

	client.AddEventHandler(ch.handleEvent)
	return ch
}

// compile-time port check.
var _ gateway.Channel = (*WhatsmeowChannel)(nil)

// purgeStaleDevices deletes whatsmeow device records whose phone matches
// ownerRemoteID (ignoring device suffix). Called before a fresh QR pairing to
// avoid FK violations from incomplete prior attempts.
func (c *WhatsmeowChannel) purgeStaleDevices(ctx context.Context) {
	if c.ownerRemoteID == "" || c.container == nil {
		return
	}
	normalized := StripDeviceSuffix(c.ownerRemoteID)
	devices, err := c.container.GetAllDevices(ctx)
	if err != nil {
		slog.Warn("purge stale devices: list failed", "channelId", c.channelID, "error", err)
		return
	}
	for _, d := range devices {
		if d.ID == nil {
			continue
		}
		if StripDeviceSuffix(d.ID.String()) == normalized {
			if err := d.Delete(ctx); err != nil {
				slog.Warn("purge stale devices: delete failed", "channelId", c.channelID, "jid", d.ID.String(), "error", err)
			}
		}
	}
}

func (c *WhatsmeowChannel) Connect(ctx context.Context) error {
	c.mu.Lock()
	c.status = gateway.ConnectionStatusConnecting
	// Renew the stop context so goroutines started this cycle get a fresh one.
	c.stopCtx, c.stopCancel = context.WithCancel(context.Background())
	c.mu.Unlock()

	if c.client.Store.ID == nil {
		c.purgeStaleDevices(ctx)
		return c.client.Connect()
	}

	if err := c.client.Connect(); err != nil {
		if strings.Contains(err.Error(), "websocket is already connected") {
			return nil
		}
		c.mu.Lock()
		c.status = gateway.ConnectionStatusDisconnected
		c.mu.Unlock()
		return fmt.Errorf("failed to connect: %w", err)
	}
	return nil
}

func (c *WhatsmeowChannel) Disconnect() error {
	c.stopCancel()
	c.client.Disconnect()
	c.mu.Lock()
	c.status = gateway.ConnectionStatusDisconnected
	c.mu.Unlock()
	return nil
}

func (c *WhatsmeowChannel) Status() gateway.ConnectionStatus {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.status
}

func (c *WhatsmeowChannel) GetQRChannel(ctx context.Context) (<-chan gateway.QRCodeData, error) {
	if c.client.Store.ID != nil {
		return nil, fmt.Errorf("already logged in")
	}

	c.purgeStaleDevices(ctx)
	c.client.Disconnect()

	qrCtx, qrCancel := context.WithTimeout(context.Background(), 3*time.Minute)

	qrChan, err := c.client.GetQRChannel(qrCtx)
	if err != nil {
		qrCancel()
		return nil, fmt.Errorf("failed to get QR channel: %w", err)
	}

	out := make(chan gateway.QRCodeData, 10)

	if err := c.client.Connect(); err != nil {
		qrCancel()
		return nil, fmt.Errorf("failed to connect for QR: %w", err)
	}

	go func() {
		defer qrCancel()
		defer close(out)
		for evt := range qrChan {
			switch evt.Event {
			case whatsmeow.QRChannelEventCode:
				out <- gateway.QRCodeData{Code: evt.Code}
				c.emitQRUpdated(evt.Code, evt.Timeout)
			case "success":
				slog.Info("QR login success", "channelId", c.channelID)
				return
			case "timeout":
				slog.Warn("QR timeout", "channelId", c.channelID)
				return
			default:
				slog.Warn("QR channel event", "channelId", c.channelID, "event", evt.Event, "error", evt.Error)
				return
			}
		}
	}()

	return out, nil
}

func (c *WhatsmeowChannel) SendText(ctx context.Context, to string, text string) (gateway.SendResult, error) {
	jid, err := parseOrBuildJID(to)
	if err != nil {
		return gateway.SendResult{}, fmt.Errorf("%w: %v", ErrInvalidRemoteID, err)
	}

	msg := &waE2E.Message{Conversation: proto.String(text)}
	resp, err := c.client.SendMessage(ctx, jid, msg)
	if err != nil {
		return gateway.SendResult{}, fmt.Errorf("failed to send message: %w", err)
	}

	return gateway.SendResult{MessageID: resp.ID, Timestamp: resp.Timestamp.Unix()}, nil
}

func (c *WhatsmeowChannel) Logout(ctx context.Context) error {
	if err := c.client.Logout(ctx); err != nil {
		return err
	}
	c.mu.Lock()
	c.status = gateway.ConnectionStatusDisconnected
	c.mu.Unlock()
	return nil
}

// GetOwnerRemoteID returns the logged-in account's canonical PN remote id, or ""
// when not yet paired.
func (c *WhatsmeowChannel) GetOwnerRemoteID() string {
	if c.client.Store.ID == nil {
		return ""
	}
	pn := resolvePN(c.client.Store, c.client.Store.ID.ToNonAD())
	return StripDeviceSuffix(pn.String())
}

func (c *WhatsmeowChannel) GetDeviceID() string {
	if c.client.Store.ID == nil {
		return ""
	}
	return c.client.Store.ID.String()
}

func (c *WhatsmeowChannel) GetChannelID() uuid.UUID { return c.channelID }

func (c *WhatsmeowChannel) IsGroupJID(id string) bool {
	return strings.HasSuffix(id, "@g.us")
}

// handleEvent receives raw whatsmeow events, updates connection status, and
// persists the mapped domain events.
func (c *WhatsmeowChannel) handleEvent(evt any) {
	switch evt.(type) {
	case *events.Connected:
		c.mu.Lock()
		c.status = gateway.ConnectionStatusConnected
		c.mu.Unlock()
		c.emitConnected()
	case *events.Disconnected, *events.StreamReplaced:
		c.mu.Lock()
		c.status = gateway.ConnectionStatusDisconnected
		c.mu.Unlock()
	case *events.LoggedOut:
		c.mu.Lock()
		c.status = gateway.ConnectionStatusDisconnected
		c.mu.Unlock()
	}

	domainEvents := mapEvent(c.channelID, c.ownerID, c.device, evt)
	if len(domainEvents) == 0 {
		return
	}
	if err := c.domainEventRepo.SaveAll(context.Background(), domainEvents); err != nil {
		slog.Warn("channel: failed to persist domain events", "channelId", c.channelID, "count", len(domainEvents), "error", err)
	}
}

// emitConnected raises channel.connected when the session is paired.
func (c *WhatsmeowChannel) emitConnected() {
	remoteID := c.GetOwnerRemoteID()
	if remoteID == "" {
		return
	}
	evt := chanevents.NewConnectedEvent(c.channelID, c.ownerID, chanevents.ConnectedPayload{
		ChannelID:     c.channelID,
		Kind:          wire.ChannelKindWHATSAPP,
		AccountDetail: remoteID,
		PairedAt:      time.Now().UTC(),
		OwnerID:       c.ownerID,
	})
	if err := c.domainEventRepo.Save(context.Background(), evt); err != nil {
		slog.Warn("channel: failed to emit connected event", "channelId", c.channelID, "error", err)
	}
}

// emitQRUpdated raises channel.pairing_qr_updated for a rotation of the code.
func (c *WhatsmeowChannel) emitQRUpdated(code string, timeout time.Duration) {
	expiresAt := time.Now().UTC().Add(timeout)
	if timeout <= 0 {
		expiresAt = time.Now().UTC().Add(60 * time.Second)
	}
	evt := chanevents.NewPairingQRUpdatedEvent(c.channelID, c.ownerID, chanevents.PairingQRUpdatedPayload{
		ChannelID:   c.channelID,
		Kind:        wire.ChannelKindWHATSAPP,
		QRPayload:   code,
		QRExpiresAt: expiresAt,
		OwnerID:     c.ownerID,
	})
	if err := c.domainEventRepo.Save(context.Background(), evt); err != nil {
		slog.Warn("channel: failed to emit qr event", "channelId", c.channelID, "error", err)
	}
}
