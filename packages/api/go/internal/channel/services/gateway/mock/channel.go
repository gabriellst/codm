// Package mock is a second implementation of the gateway.Channel port
// (services/gateway/gateway.go:124/:181) — deterministic and fully scripted
// by a Scenario declared at construction (spec D5/D6,
// .specs/2026-08-10-eixo-ambiente-go-design.md). It replaces the injection
// testseam (internal/channel/testseam, killed in a later task of this plan):
// instead of an HTTP surface that pokes domain events into the mediator
// directly, seeding gateway-owned state means scripting the channel, and
// every fact still travels through the SAME production pipelines the
// whatsmeow adapter uses.
//
// The port's ~25 methods split into two buckets:
//
//   - SCRIPTED (this file) — Connect/Disconnect/Logout/Status/GetQRChannel/
//     SendMessage/StreamContactSnapshot/IsGroupJID/identity
//     (GetOwnerRemoteID/GetChannelID/GetDeviceID). Real, assertable behavior.
//     Auto-pairing, connect/disconnect/logout, and the post-pair sync-complete
//     signal all go through mapper.MapEvent (services/gateway/whatsapp/mapper)
//     — the exact same exported function WhatsmeowChannel.handleEvent calls —
//     followed by the injected repositories.DomainEventRepository.Save/SaveAll,
//     so the outbox → handler → projector chain downstream (including
//     RemoteSnapshotProjector consuming StreamContactSnapshot below, T13) runs
//     completely untouched. See runPairingClock for the auto-pairing →
//     connected/sync-complete-mapper path.
//
//   - NO-OP (honest zero-value + nil) — every other port method. The policy
//     (spec D5) is to grow this set ONLY on concrete test demand, never
//     speculatively: a method moves from no-op to scripted the first time a
//     test needs it to do something real.
package mock

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"go.mau.fi/whatsmeow/appstate"
	waevents "go.mau.fi/whatsmeow/types/events"

	channelenums "template/api-go/internal/channel/enums"
	ctxevents "template/api-go/internal/channel/events"
	"template/api-go/internal/channel/services/gateway"
	mapperpkg "template/api-go/internal/channel/services/gateway/whatsapp/mapper"
	repositories "template/core-go/repositories"
)

// compile-time interface check.
var _ gateway.Channel = (*MockChannel)(nil)

// mockIDNamespace is a fixed UUID v5 namespace for deriving deterministic
// message ids (SendMessage results, inbound seed ids) — mirrors the pattern
// core-go/types.hashEventID uses for domain event ids.
var mockIDNamespace = uuid.MustParse("7f8b6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c2d")

// MockChannel is the scripted Channel. One instance per MockChannelFactory.Create
// call, playing the Scenario it was constructed with.
type MockChannel struct {
	instanceID      uuid.UUID
	ownerID         string
	scenario        Scenario
	domainEventRepo repositories.DomainEventRepository

	mu             sync.Mutex
	status         gateway.ConnectionStatus
	ownerRemoteID  string
	deviceID       string
	pairingStarted bool
	stopCtx        context.Context
	stopCancel     context.CancelFunc
}

// NewMockChannel constructs a MockChannel bound to the given scenario. config
// mirrors what ConnectChannelHandler passes to ChannelFactory.Create — see
// usecases/connect_channel.go:56-59.
func NewMockChannel(instanceID uuid.UUID, config gateway.ChannelConfig, scenario Scenario, domainEventRepo repositories.DomainEventRepository) *MockChannel {
	ownerRemoteID := config.OwnerRemoteID
	if ownerRemoteID == "" {
		// Fresh pairing (no stored session) — derive a deterministic identity
		// from the owner rather than leaving it empty, mirroring what a real
		// phone scan would eventually produce.
		ownerRemoteID = fmt.Sprintf("mock-%s@s.whatsapp.net", config.OwnerID)
	}
	deviceID := fmt.Sprintf("%s:1@s.whatsapp.net", strings.TrimSuffix(ownerRemoteID, "@s.whatsapp.net"))

	return &MockChannel{
		instanceID:      instanceID,
		ownerID:         config.OwnerID,
		scenario:        scenario,
		domainEventRepo: domainEventRepo,
		status:          gateway.ConnectionStatusDisconnected,
		ownerRemoteID:   ownerRemoteID,
		deviceID:        deviceID,
	}
}

// ──────────────────────────────────────────────
// Scripted core
// ──────────────────────────────────────────────

// Connect starts the scenario clock (idempotent — a second call while already
// connecting/connected is a no-op). The actual pairing happens asynchronously
// after scenario.AutoPairAfter, in runPairingClock.
func (c *MockChannel) Connect(ctx context.Context) error {
	c.mu.Lock()
	if c.status == gateway.ConnectionStatusConnected {
		c.mu.Unlock()
		return nil
	}
	c.status = gateway.ConnectionStatusConnecting
	c.stopCtx, c.stopCancel = context.WithCancel(context.Background())
	stopCtx := c.stopCtx
	alreadyStarted := c.pairingStarted
	c.pairingStarted = true
	c.mu.Unlock()

	if !alreadyStarted {
		go c.runPairingClock(stopCtx)
	}
	return nil
}

// Disconnect cancels any pending auto-pair clock and marks the channel
// disconnected, emitting channel.gateway_disconnected through the real
// mapper (mapper.MapEvent(*events.Disconnected{}) — mirrors
// WhatsmeowChannel.handleEvent's *events.Disconnected case).
func (c *MockChannel) Disconnect() error {
	c.mu.Lock()
	if c.stopCancel != nil {
		c.stopCancel()
	}
	c.status = gateway.ConnectionStatusDisconnected
	c.pairingStarted = false
	c.mu.Unlock()

	c.emitViaMapper(context.Background(), &waevents.Disconnected{})
	return nil
}

// Logout mirrors Disconnect but maps through *events.LoggedOut (channel.gateway_logged_out)
// — ConnectFailureLoggedOut is the closest whatsmeow reason code to an
// explicit logout request.
func (c *MockChannel) Logout(ctx context.Context) error {
	c.mu.Lock()
	if c.stopCancel != nil {
		c.stopCancel()
	}
	c.status = gateway.ConnectionStatusDisconnected
	c.pairingStarted = false
	c.mu.Unlock()

	c.emitViaMapper(ctx, &waevents.LoggedOut{Reason: waevents.ConnectFailureLoggedOut})
	return nil
}

func (c *MockChannel) Status() gateway.ConnectionStatus {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.status
}

// GetQRChannel emits scenario.QRFrames, in order, then closes the returned
// channel. Mirrors WhatsmeowChannel.GetQRChannel in one respect that matters
// for callers: fetching the QR channel is itself what starts the connection
// attempt in production (client.Connect() runs inside GetQRChannel there);
// ConnectChannelHandler's fresh-pairing path calls GetQRChannel without ever
// calling Connect explicitly (usecases/connect_channel.go:73-81), so this
// starts the SAME scenario clock Connect starts, idempotently.
func (c *MockChannel) GetQRChannel(ctx context.Context) (<-chan gateway.QRCodeData, error) {
	c.mu.Lock()
	if c.status == gateway.ConnectionStatusConnected {
		c.mu.Unlock()
		return nil, fmt.Errorf("already logged in")
	}
	c.mu.Unlock()

	if err := c.Connect(ctx); err != nil {
		return nil, err
	}

	out := make(chan gateway.QRCodeData, len(c.scenario.QRFrames))
	for _, frame := range c.scenario.QRFrames {
		out <- gateway.QRCodeData{Code: frame}
	}
	close(out)
	return out, nil
}

// SendMessage returns a deterministic result — MessageID is a pure function
// of the channel + input params (never random, never a call-order counter),
// so the same params sent twice produce the same id both times.
func (c *MockChannel) SendMessage(ctx context.Context, params gateway.SendMessageParams) (gateway.SendMessageResult, error) {
	content, _ := json.Marshal(params.Content)
	id := c.deterministicID("send", params.To, string(params.MessageType), string(content))

	return gateway.SendMessageResult{
		MessageID:      id,
		Timestamp:      time.Now().Unix(),
		PersistContent: content,
	}, nil
}

// StreamContactSnapshot serves scenario.Contacts verbatim, in order, then
// closes the channel — no sync round-trip, since the scenario IS the
// post-sync store.
func (c *MockChannel) StreamContactSnapshot(ctx context.Context) <-chan gateway.ContactSnapshot {
	out := make(chan gateway.ContactSnapshot, len(c.scenario.Contacts))
	for _, contact := range c.scenario.Contacts {
		out <- contact
	}
	close(out)
	return out
}

// IsGroupJID replicates the real suffix heuristic verbatim
// (services/gateway/whatsapp/whatsmeow_channel.go:602-604) — this is
// platform convention (WhatsApp group JIDs end in "@g.us"), not something
// whatsmeow-internal state decides, so the mock can answer it for real.
func (c *MockChannel) IsGroupJID(jid string) bool {
	return strings.HasSuffix(jid, "@g.us")
}

func (c *MockChannel) GetChannelID() uuid.UUID { return c.instanceID }

func (c *MockChannel) GetOwnerRemoteID() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.ownerRemoteID
}

func (c *MockChannel) GetDeviceID() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.deviceID
}

// ──────────────────────────────────────────────
// Pairing clock — the auto-pairing → real connected-mapper path
// ──────────────────────────────────────────────

// runPairingClock waits scenario.AutoPairAfter (or proceeds immediately when
// it's 0), then delivers the SAME facts a real phone scan/sync eventually
// would, in the same order whatsmeow fires them:
//
//  1. *events.Connected{} — mapperpkg.MapEvent, the exact exported function
//     WhatsmeowChannel.handleEvent calls (whatsmeow_channel.go:787), maps
//     this (a trivial empty struct in whatsmeow; no whatsmeow client/session
//     is involved in constructing one, so this never touches the whatsapp
//     adapter or the port) to channel.gateway_connected
//     (mapper/connected.go:12-20).
//  2. *events.AppStateSyncComplete{Name: appstate.WAPatchRegular} — the SAME
//     event handleEvent's switch matches to trigger contact projection
//     (whatsmeow_channel.go's handleEvent, pre-T13: c.markSyncComplete();
//     T13: nothing extra needed there — MapEvent unconditionally maps this
//     case too). mapAppStateSyncComplete (mapper/app_state_sync.go:17-30)
//     turns it into channel.gateway.sync_complete, the trigger
//     RemoteSnapshotProjector (projections/projectors/remote_snapshot_projector.go)
//     subscribes to — which is what makes scenario.Contacts (served by this
//     mock's StreamContactSnapshot, below) actually land in gateway_remotes
//     for a scripted scenario, the same way a real sync does.
//
// Both are persisted through the injected DomainEventRepository — the same
// outbox write handleEvent performs — so OutboxDispatcher → mediator →
// handlers/projectors run untouched downstream.
func (c *MockChannel) runPairingClock(stopCtx context.Context) {
	if c.scenario.AutoPairAfter > 0 {
		timer := time.NewTimer(c.scenario.AutoPairAfter)
		defer timer.Stop()
		select {
		case <-timer.C:
		case <-stopCtx.Done():
			return
		}
	}

	select {
	case <-stopCtx.Done():
		return
	default:
	}

	c.mu.Lock()
	c.status = gateway.ConnectionStatusConnected
	c.mu.Unlock()

	ctx := context.Background()
	c.emitViaMapper(ctx, &waevents.Connected{})
	c.emitViaMapper(ctx, &waevents.AppStateSyncComplete{Name: appstate.WAPatchRegular})
	c.emitInboundMessages(ctx)
}

// emitViaMapper is the shared "handleEvent-equivalent" step: map a raw
// whatsmeow event through the real mapper and persist whatever it produces.
func (c *MockChannel) emitViaMapper(ctx context.Context, evt any) {
	domainEvents := mapperpkg.MapEvent(c.instanceID, c.ownerID, nil, evt)
	if len(domainEvents) == 0 {
		return
	}
	if err := c.domainEventRepo.SaveAll(ctx, domainEvents); err != nil {
		slog.Warn("mock channel: failed to persist mapped event",
			"channelId", c.instanceID, "error", err)
	}
}

// emitInboundMessages plays scenario.InboundMessages, once, right after
// auto-pairing completes — through the SAME event constructor
// mapper.mapMessage uses (ctxevents.NewMessageReceivedEvent), so the
// downstream ingest (outbox → message_received_handler → projection) runs
// exactly as it would for a real inbound message.
func (c *MockChannel) emitInboundMessages(ctx context.Context) {
	for i, seed := range c.scenario.InboundMessages {
		senderID := seed.SenderID
		if senderID == "" {
			senderID = seed.RemoteID
		}
		now := time.Now().UTC()
		content, _ := json.Marshal(map[string]string{"text": seed.Text})

		event := ctxevents.NewMessageReceivedEvent(c.instanceID, c.ownerID, ctxevents.ChannelMessageReceivedPayload{
			ChannelID:         c.instanceID,
			MessageID:         c.deterministicID("inbound", fmt.Sprintf("%d", i), seed.RemoteID, seed.Text),
			InternalMessageID: uuid.New(),
			RemoteID:          seed.RemoteID,
			SenderID:          senderID,
			FromMe:            false,
			Author:            channelenums.MessageAuthorHuman,
			IsGroup:           c.IsGroupJID(seed.RemoteID),
			Timestamp:         now.Unix(),
			OccurredAt:        now,
			ObservedAt:        now,
			MessageType:       channelenums.MessageTypeText,
			Content:           content,
			Platform:          string(channelenums.PlatformWhatsApp),
			OwnerID:           c.ownerID,
		})

		if err := c.domainEventRepo.Save(ctx, event); err != nil {
			slog.Warn("mock channel: failed to persist inbound message event",
				"channelId", c.instanceID, "remoteId", seed.RemoteID, "error", err)
		}
	}
}

// deterministicID derives a stable id from the channel identity plus the
// given parts — same parts always produce the same id, never a random or
// call-order-dependent value.
func (c *MockChannel) deterministicID(parts ...string) string {
	joined := c.instanceID.String() + "|" + strings.Join(parts, "|")
	return uuid.NewSHA1(mockIDNamespace, []byte(joined)).String()
}

// ──────────────────────────────────────────────
// No-ops — honest zero-value + nil, grows on test demand (see package doc)
// ──────────────────────────────────────────────

func (c *MockChannel) DeleteMessage(ctx context.Context, chatID string, messageID string) error {
	return nil
}

func (c *MockChannel) EditMessage(ctx context.Context, chatID string, messageID string, newText string) error {
	return nil
}

func (c *MockChannel) SetPresence(ctx context.Context, presence channelenums.PresenceType) error {
	return nil
}

func (c *MockChannel) SendChatPresence(ctx context.Context, chatID string, presence channelenums.ChatPresenceType) error {
	return nil
}

func (c *MockChannel) CheckIsOnPlatform(ctx context.Context, identifiers []string) ([]gateway.ContactValidation, error) {
	return nil, nil
}

func (c *MockChannel) GetProfilePicture(ctx context.Context, contactID string) (string, error) {
	return "", nil
}

func (c *MockChannel) GetGroupInfo(ctx context.Context, groupJID string) (*gateway.GroupInfo, error) {
	return nil, nil
}

func (c *MockChannel) GetIndividualContactInfo(ctx context.Context, jid string) (*gateway.IndividualContactInfo, error) {
	return nil, nil
}

// ResolvePhoneJID is the zero-value no-op: "" (not the input jid unchanged).
// This deliberately does NOT mirror the real adapter's degraded-fallback
// behavior (return jid unchanged) — an honest no-op admits it does nothing,
// rather than quietly imitating a passthrough. Promote to scripted (and
// decide the right derivation) the first time a test needs LID resolution.
func (c *MockChannel) ResolvePhoneJID(ctx context.Context, jid string) string {
	return ""
}

// HydrateAvatars returns a closed, empty channel rather than a nil one: a nil
// channel would hang any caller that ranges over it forever, which is not an
// "honest" no-op — it's a silent deadlock. An immediately-closed channel
// honestly reports "nothing to hydrate".
func (c *MockChannel) HydrateAvatars(ctx context.Context, remoteIDs []string) <-chan gateway.AvatarUpdate {
	out := make(chan gateway.AvatarUpdate)
	close(out)
	return out
}

func (c *MockChannel) PinChat(ctx context.Context, remoteID string, pin bool) error {
	return nil
}

func (c *MockChannel) MuteChat(ctx context.Context, remoteID string, mute bool, muteEndUnixMilli int64) error {
	return nil
}

func (c *MockChannel) ArchiveChat(ctx context.Context, remoteID string, archive bool) error {
	return nil
}

func (c *MockChannel) MarkChatRead(ctx context.Context, remoteID string, read bool) error {
	return nil
}
