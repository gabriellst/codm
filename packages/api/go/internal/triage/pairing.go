package triage

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"sync"
	"time"

	"github.com/google/uuid"
	qrcode "github.com/skip2/go-qrcode"

	"template/api-go/internal/channel/enums"
	"template/api-go/internal/channel/services/gateway"
	"template/api-go/internal/channel/services/pool"
	"template/api-go/internal/channel/usecases"
	"template/contracts-go/wire"
	"template/core-go/services/mediator"
	"template/core-go/types"
)

// Pairing owns the single WhatsApp channel of this deployment: it resolves
// (or creates) it for TRIAGE_OWNER_ID, drives headless QR / pairing-code
// rounds while unpaired, renders each rotating QR to <data>/qr.png and keeps
// <data>/status.json fresh for the watchdog.
type Pairing struct {
	cfg     *Config
	pool    pool.ChannelPool
	resolve *usecases.GetOrCreateChannelHandler
	connect *usecases.ConnectChannelHandler

	mu         sync.RWMutex
	channelID  string
	state      string
	jid        string
	pairCode   string
	lastQRAt   time.Time
	pairing    bool
	roundsUsed int
	stopped    bool // POST /admin/stop-bridge: disconnected on purpose, never reconnect/pair
}

func NewPairing(cfg *Config, p pool.ChannelPool, r *usecases.GetOrCreateChannelHandler, c *usecases.ConnectChannelHandler) *Pairing {
	return &Pairing{cfg: cfg, pool: p, resolve: r, connect: c, state: "starting"}
}

func (p *Pairing) ChannelID() string {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.channelID
}

type Status struct {
	State      string `json:"state"` // starting | unpaired | pairing | connecting | connected | disconnected
	Connected  bool   `json:"connected"`
	ChannelID  string `json:"channelId,omitempty"`
	JID        string `json:"jid,omitempty"`
	QRPath     string `json:"qrPath,omitempty"`
	LastQRAt   string `json:"lastQrAt,omitempty"`
	PairCode   string `json:"pairCode,omitempty"`
	RoundsLeft int    `json:"pairRoundsLeft"`
	PID        int    `json:"pid"`
	UpdatedAt  string `json:"updatedAt"`
}

func (p *Pairing) Snapshot() Status {
	p.mu.RLock()
	defer p.mu.RUnlock()
	s := Status{
		State: p.state, Connected: p.state == "connected", ChannelID: p.channelID, JID: p.jid,
		PairCode: p.pairCode, RoundsLeft: p.cfg.PairRounds - p.roundsUsed,
		PID: os.Getpid(), UpdatedAt: time.Now().Format(time.RFC3339),
	}
	if p.state == "pairing" && !p.lastQRAt.IsZero() {
		s.QRPath = p.cfg.Path("qr.png")
		s.LastQRAt = p.lastQRAt.Format(time.RFC3339)
	}
	return s
}

func (p *Pairing) Run(ctx context.Context) {
	if !sleep(ctx, 6*time.Second) { // let the boot reconnect of a stored session go first
		return
	}
	for p.ChannelID() == "" {
		out, err := p.resolve.Execute(ctx, usecases.GetOrCreateChannelInput{Platform: enums.PlatformWhatsApp, OwnerID: p.cfg.OwnerID})
		if err == nil {
			p.mu.Lock()
			p.channelID = out.ID
			p.mu.Unlock()
			slog.Info("triage: channel resolved", "channelId", out.ID, "created", out.Created)
			break
		}
		slog.Error("triage: resolve channel failed", "error", err)
		if !sleep(ctx, 10*time.Second) {
			return
		}
	}

	go p.statusLoop(ctx)

	for {
		st := p.refresh()
		p.mu.RLock()
		canPair := p.cfg.AutoPair && p.roundsUsed < p.cfg.PairRounds && !p.stopped
		p.mu.RUnlock()
		if (st == "unpaired" || st == "disconnected") && canPair {
			p.round(ctx)
		}
		if !sleep(ctx, 10*time.Second) {
			return
		}
	}
}

// refresh recomputes state from the live pool channel.
func (p *Pairing) refresh() string {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.pairing {
		return p.state
	}
	if p.stopped {
		p.state = "stopped"
		return p.state
	}
	id, err := uuid.Parse(p.channelID)
	if err != nil {
		return p.state
	}
	ch, ok := p.pool.Get(id)
	switch {
	case !ok:
		p.state = "unpaired"
	case ch.Status() == gateway.ConnectionStatusConnected:
		p.state = "connected"
		p.jid = ch.GetOwnerRemoteID()
	case ch.Status() == gateway.ConnectionStatusConnecting:
		p.state = "connecting"
	case ch.GetDeviceID() == "":
		p.state = "unpaired"
	default:
		p.state = "disconnected"
	}
	return p.state
}

func (p *Pairing) round(ctx context.Context) {
	p.mu.Lock()
	p.roundsUsed++
	n := p.roundsUsed
	p.pairing = true
	p.state = "pairing"
	p.pairCode = ""
	p.mu.Unlock()
	defer func() {
		p.mu.Lock()
		p.pairing = false
		p.mu.Unlock()
		_ = os.Remove(p.cfg.Path("pair-code.txt"))
		if p.refresh() == "connected" {
			_ = os.Remove(p.cfg.Path("qr.png"))
			_ = os.Remove(p.cfg.Path("qr.txt"))
		}
	}()

	slog.Info("triage: starting pairing round", "round", n, "of", p.cfg.PairRounds)
	cctx, cancel := context.WithTimeout(ctx, 90*time.Second)
	out, err := p.connect.Execute(cctx, usecases.ConnectChannelInput{ID: p.ChannelID()})
	cancel()
	if err != nil {
		slog.Error("triage: connect failed", "error", err)
		return
	}
	if out.QRCode == "" {
		slog.Info("triage: connect returned no QR (session exists)", "state", out.State)
		return
	}
	p.writeQR(out.QRCode)

	if p.cfg.PairPhone != "" {
		if id, err := uuid.Parse(p.ChannelID()); err == nil {
			if ch, ok := p.pool.Get(id); ok {
				if pp, ok := ch.(interface {
					PairPhone(ctx context.Context, phone string) (string, error)
				}); ok {
					code, err := pp.PairPhone(ctx, p.cfg.PairPhone)
					if err != nil {
						slog.Error("triage: pairing code request failed", "error", err)
					} else {
						p.mu.Lock()
						p.pairCode = code
						p.mu.Unlock()
						_ = writeAtomic(p.cfg.Path("pair-code.txt"), []byte(code+"\n"))
						slog.Info("triage: PAIRING CODE ready (WhatsApp > Linked devices > Link with phone number)", "file", p.cfg.Path("pair-code.txt"))
					}
				}
			}
		}
	}

	// whatsmeow's QR window is 3 minutes; wait it out or until paired.
	deadline := time.Now().Add(3*time.Minute + 10*time.Second)
	for time.Now().Before(deadline) {
		if !sleep(ctx, 3*time.Second) {
			return
		}
		id, _ := uuid.Parse(p.ChannelID())
		if ch, ok := p.pool.Get(id); ok && ch.Status() == gateway.ConnectionStatusConnected {
			slog.Info("triage: PAIRED", "jid", ch.GetOwnerRemoteID())
			return
		}
	}
	slog.Warn("triage: pairing round ended without pairing", "round", n)
}

func (p *Pairing) writeQR(code string) {
	png, err := qrcode.Encode(code, qrcode.Medium, 512)
	if err != nil {
		slog.Error("triage: QR encode failed", "error", err)
		return
	}
	if err := writeAtomic(p.cfg.Path("qr.png"), png); err != nil {
		slog.Error("triage: QR write failed", "error", err)
		return
	}
	_ = writeAtomic(p.cfg.Path("qr.txt"), []byte(code+"\n"))
	p.mu.Lock()
	p.lastQRAt = time.Now()
	p.mu.Unlock()
	slog.Info("triage: QR updated (scan within ~20-60s)", "file", p.cfg.Path("qr.png"))
}

func (p *Pairing) statusLoop(ctx context.Context) {
	for {
		p.refresh()
		if b, err := json.MarshalIndent(p.Snapshot(), "", "  "); err == nil {
			_ = writeAtomic(p.cfg.Path("status.json"), append(b, '\n'))
		}
		if !sleep(ctx, 5*time.Second) {
			return
		}
	}
}

// QRHandler receives every QR rotation (integration lane) and re-renders qr.png.
type QRHandler struct{ p *Pairing }

func NewQRHandler(p *Pairing) *QRHandler { return &QRHandler{p: p} }

var _ mediator.IntegrationEventHandler = (*QRHandler)(nil)

func (h *QRHandler) EventName() string { return wire.ChannelSpecialPlatformEventReceivedEventName }

func (h *QRHandler) Handle(_ context.Context, event types.IntegrationEventI) error {
	e, err := types.UnmarshalIntegrationEvent[wire.ChannelSpecialPlatformEventReceivedPayload](event)
	if err != nil || e.Payload.EventType != wire.SpecialPlatformEventTypeqr_code_updated {
		return nil
	}
	var qr struct {
		Code string `json:"code"`
	}
	if json.Unmarshal(e.Payload.Payload, &qr) == nil && qr.Code != "" {
		h.p.writeQR(qr.Code)
	}
	return nil
}

func writeAtomic(path string, b []byte) error {
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func sleep(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}

// StopBridge disconnects the WhatsApp socket WITHOUT logging out (the device
// keys stay valid in codm.db) and keeps it down for the life of the process,
// so a rollback can snapshot a DB that no longer changes.
func (p *Pairing) StopBridge() error {
	p.mu.Lock()
	p.stopped = true
	p.state = "stopped"
	id := p.channelID
	p.mu.Unlock()
	uid, err := uuid.Parse(id)
	if err != nil {
		return nil
	}
	if ch, ok := p.pool.Get(uid); ok {
		return ch.Disconnect()
	}
	return nil
}
