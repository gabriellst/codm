// Package gateway defines the platform-agnostic port every channel adapter
// implements, plus the factory that builds one. It is the ACL boundary between
// the domain and a concrete messaging platform (WhatsApp/whatsmeow today).
//
// Multi-platform seam: the port is intentionally transport-shaped (connect,
// pair, send text, receive) and carries no WhatsApp specifics. The frozen
// wire.ChannelKind enum is locked for three platforms (WHATSAPP, INSTAGRAM_DM,
// TELEGRAM) but only WHATSAPP is realized. Adding a New Platform:
//
//  1. add a ChannelFactory implementation under services/gateway/<platform>/
//  2. bind it in module.go keyed by wire.ChannelKind (a @union-style switch)
//  3. the rest of the context (registry, handlers, controllers) is unchanged.
package gateway

import (
	"context"

	"github.com/google/uuid"
)

// ConnectionStatus is the live connection state of a channel session.
type ConnectionStatus string

const (
	ConnectionStatusConnected    ConnectionStatus = "CONNECTED"
	ConnectionStatusDisconnected ConnectionStatus = "DISCONNECTED"
	ConnectionStatusConnecting   ConnectionStatus = "CONNECTING"
)

// QRCodeData carries one rotation of a pairing QR/token.
type QRCodeData struct {
	Code string
}

// SendResult is what a successful outbound send returns.
type SendResult struct {
	MessageID string
	Timestamp int64
}

// ChannelConfig holds the parameters to build a channel session.
// OwnerRemoteID, when non-empty, reconnects an already-paired device; empty
// means a fresh QR pairing.
type ChannelConfig struct {
	OwnerID       string
	OwnerRemoteID string
}

// Channel is the protocol-agnostic port for one platform session.
//
// Trimmed to the CodeDM gateway surface: pairing + connection lifecycle + text
// send/receive. Rich CRM operations from the source gateway (presence, groups,
// contacts, avatars, pin/mute/archive, media/poll/list/button sends,
// history-sync) are dropped — CodeDM routes text between an operator and a
// coding agent, nothing more.
type Channel interface {
	// Connect opens the session (reconnecting a paired device, or preparing a
	// fresh one for GetQRChannel).
	Connect(ctx context.Context) error
	// Disconnect tears the session down and cancels background goroutines.
	Disconnect() error
	// Status reports the current connection state.
	Status() ConnectionStatus
	// GetQRChannel returns a stream of rotating pairing codes. The stream closes
	// on successful login, timeout, or ctx cancellation. Only valid when the
	// session is not yet paired.
	GetQRChannel(ctx context.Context) (<-chan QRCodeData, error)
	// SendText delivers a plain-text message to the given external id (a phone
	// number / JID for WhatsApp). It is optimistic: a nil error means the
	// platform accepted the message.
	SendText(ctx context.Context, to string, text string) (SendResult, error)
	// Logout unpairs the device from the platform.
	Logout(ctx context.Context) error
	// GetOwnerRemoteID returns the logged-in account's canonical remote id, or ""
	// when not yet paired.
	GetOwnerRemoteID() string
	// GetDeviceID returns the raw device id used to reconnect this session.
	GetDeviceID() string
	// GetChannelID returns this channel's stable id.
	GetChannelID() uuid.UUID
	// IsGroupJID reports whether an external id refers to a group conversation.
	IsGroupJID(id string) bool
}

// ChannelFactory builds Channel instances for one platform.
type ChannelFactory interface {
	Create(channelID uuid.UUID, config ChannelConfig) (Channel, error)
}
