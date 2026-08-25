package mock

import (
	"time"

	"template/api-go/internal/channel/services/gateway"
)

// Scenario is the roteiro declarado no boot (spec D6 —
// .specs/2026-08-10-eixo-ambiente-go-design.md — determinism without a
// runtime control plane): everything MockChannel can ever produce is decided
// here, at construction, never by a command that arrives later. YAGNI is
// enforced deliberately — no endpoint, no method, mutates a Scenario after
// Create; if a concrete test needs runtime control, that's a testenv concern
// (core-go), never a channel-local exception (spec D6).
//
// Zero-value Scenario is a channel that connects and pairs immediately, with
// no QR frames, no contacts, and no inbound messages.
type Scenario struct {
	// QRFrames are served by GetQRChannel, in order, before pairing.
	QRFrames []string

	// AutoPairAfter is how long after Connect/GetQRChannel until the scenario
	// "scans" the QR — reaching the SAME entry point a real phone scan would:
	// mapper.MapEvent(instanceID, ownerID, nil, &events.Connected{}), the exact
	// call WhatsmeowChannel.handleEvent makes for a *events.Connected raw event
	// (services/gateway/whatsapp/whatsmeow_channel.go:747-803). 0 pairs
	// immediately (no wait).
	AutoPairAfter time.Duration

	// Contacts are served by StreamContactSnapshot, verbatim, in order.
	Contacts []ContactSeed

	// InboundMessages are emitted as channel.message_received events (via the
	// SAME ctxevents.NewMessageReceivedEvent constructor
	// mapper.mapMessage uses — services/gateway/whatsapp/mapper/message.go)
	// once, right after auto-pairing completes.
	InboundMessages []InboundSeed
}

// ContactSeed mirrors gateway.ContactSnapshot verbatim — the exact shape
// StreamContactSnapshot serves in production (services/gateway/gateway.go:103).
// A type alias, not a redeclared struct, so no field can ever drift from the
// port's real shape.
type ContactSeed = gateway.ContactSnapshot

// InboundSeed is the minimal input MockChannel needs to synthesize a
// channel.message_received event through the SAME payload shape and
// constructor the real mapper uses for a received message
// (mapper.mapMessage → ctxevents.NewMessageReceivedEvent, see
// services/gateway/whatsapp/mapper/message.go:64-89).
//
// It intentionally does NOT mirror whatsmeow's raw *events.Message /
// waE2E.Message proto shape — that proto-unwrapping (extractMessageContent,
// mapper/content.go) is wire-format translation specific to the WhatsApp
// adapter. Nothing downstream of the domain event (outbox → handler →
// projection — the "ingest real" spec D5 asks for) ever sees or depends on
// that proto; it only ever sees the payload InboundSeed builds here. Only
// text messages are scripted today — other MessageType variants grow on test
// demand, same policy as MockChannel's no-ops.
type InboundSeed struct {
	// RemoteID is the chat the message arrives from (contact or group JID).
	RemoteID string
	// SenderID is the message author. Defaults to RemoteID when empty — the
	// common case for 1:1 chats, where chat and sender coincide.
	SenderID string
	// Text is the message body.
	Text string
}
