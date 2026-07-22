package gateway

import (
	"context"
	"encoding/json"
	channelenums "template/api-go/internal/channel/enums"
	msgenums "template/api-go/internal/channel/enums"

	"github.com/google/uuid"
)

// ConnectionStatus represents the current connection state of a channel.
type ConnectionStatus string

const (
	ConnectionStatusConnected    ConnectionStatus = "CONNECTED"
	ConnectionStatusDisconnected ConnectionStatus = "DISCONNECTED"
	ConnectionStatusConnecting   ConnectionStatus = "CONNECTING"
)

// QRCodeData holds data for a QR code event.
type QRCodeData struct {
	Code string
}

// SendMessageParams contains the parameters for sending a message.
// Content must be a typed send struct from this package (e.g., SendTextContent).
type SendMessageParams struct {
	To          string
	MessageType msgenums.MessageType
	Content     any
}

// SendMessageResult holds the result of a sent message.
type SendMessageResult struct {
	MessageID      string
	Timestamp      int64
	PersistContent json.RawMessage // Platform-typed content for entity persistence
}

// ContactValidation holds the result of checking if a contact identifier is on the platform.
type ContactValidation struct {
	Identifier   string
	IsOnPlatform bool
	PlatformID   string
}

// ChannelConfig holds configuration for creating a channel.
type ChannelConfig struct {
	ProxyURL      string
	OwnerRemoteID string
	OwnerID       string
}

// GroupInfo holds metadata about a group on the platform.
type GroupInfo struct {
	ID           string
	OwnerJID     string
	Name         string
	Description  string
	Participants []ParticipantInfo
}

// ParticipantInfo holds metadata about a participant in a group.
// Name is resolved from the local whatsmeow contact store (populated from
// HistorySync + incoming messages). It can be empty if we've never seen a
// pushName for that participant — caller should treat empty as "unknown".
type ParticipantInfo struct {
	ID           string
	Name         string
	IsAdmin      bool
	IsSuperAdmin bool
}

// IndividualContactInfo holds metadata about an individual WhatsApp contact.
type IndividualContactInfo struct {
	JID          string
	FirstName    string
	FullName     string
	PushName     string
	BusinessName string
}

// DisplayName returns the best available name for display purposes.
func (c *IndividualContactInfo) DisplayName() string {
	if c.PushName != "" {
		return c.PushName
	}
	if c.FullName != "" {
		return c.FullName
	}
	if c.BusinessName != "" {
		return c.BusinessName
	}
	return c.FirstName
}

// ContactSnapshot is a single contact or group read from the channel's
// internal store after sync is complete. All remote_ids are in PN form
// (@s.whatsapp.net) for users and group JID form (@g.us) for groups.
// AvatarURL is intentionally absent — Phase 2 (HydrateAvatars) fetches
// and persists profile pictures after the initial bulk upsert.
type ContactSnapshot struct {
	RemoteID   string
	RemoteType string // "USER" or "GROUP"
	Name       string
	Members    []MemberSnapshot // populated only for groups
}

// AvatarUpdate carries a resolved profile picture URL for one remote.
// AvatarURL is "" when the contact has no picture or the fetch failed.
type AvatarUpdate struct {
	RemoteID  string
	AvatarURL string
}

// MemberSnapshot is a single group participant from the contact snapshot.
type MemberSnapshot struct {
	RemoteID string
	IsAdmin  bool
}

// Channel is the protocol-agnostic interface for platform communication.
type Channel interface {
	Connect(ctx context.Context) error
	Disconnect() error
	Status() ConnectionStatus
	GetQRChannel(ctx context.Context) (<-chan QRCodeData, error)
	SendMessage(ctx context.Context, params SendMessageParams) (SendMessageResult, error)
	DeleteMessage(ctx context.Context, chatID string, messageID string) error
	EditMessage(ctx context.Context, chatID string, messageID string, newText string) error
	SetPresence(ctx context.Context, presence channelenums.PresenceType) error
	SendChatPresence(ctx context.Context, chatID string, presence msgenums.ChatPresenceType) error
	CheckIsOnPlatform(ctx context.Context, identifiers []string) ([]ContactValidation, error)
	GetProfilePicture(ctx context.Context, contactID string) (string, error)
	GetGroupInfo(ctx context.Context, groupJID string) (*GroupInfo, error)
	GetIndividualContactInfo(ctx context.Context, jid string) (*IndividualContactInfo, error)
	Logout(ctx context.Context) error
	GetOwnerRemoteID() string
	// GetDeviceID returns the raw AD-JID (with device suffix) for whatsmeow device lookup.
	// This differs from GetOwnerRemoteID which returns a normalized JID for display/routing.
	GetDeviceID() string
	GetChannelID() uuid.UUID
	// ResolvePhoneJID resolves a LID (@lid) to its phone number JID (@s.whatsapp.net).
	// Returns the original JID unchanged if it's already a phone JID or resolution fails.
	ResolvePhoneJID(ctx context.Context, jid string) string
	// IsGroupJID reports whether the given JID refers to a group conversation.
	// The check is platform-specific and encapsulated here.
	IsGroupJID(jid string) bool

	// StreamContactSnapshot reads all contacts and joined groups from the
	// channel's internal store and streams them as ContactSnapshot items.
	// The channel is closed when all items have been streamed.
	// Must be called after sync is complete (AppStateSyncComplete/WAPatchRegular),
	// at which point all PN↔LID mappings are resolved in the device store.
	// No avatar fetching is done here — use HydrateAvatars for that.
	StreamContactSnapshot(ctx context.Context) <-chan ContactSnapshot

	// HydrateAvatars fetches profile pictures for the given remote IDs and
	// streams AvatarUpdate items as they resolve. Rate-limited internally.
	// The channel is closed when all IDs have been processed or ctx is cancelled.
	HydrateAvatars(ctx context.Context, remoteIDs []string) <-chan AvatarUpdate

	// PinChat toggles the pinned flag for the given remote. The platform
	// propagates the change to every logged-in companion device (phone + other
	// web sessions) via AppState sync.
	PinChat(ctx context.Context, remoteID string, pin bool) error
	// MuteChat toggles the muted flag for the given remote. When muting, pass
	// the absolute mute expiration as UnixMilli (-1 or 0 means "mute forever").
	// When unmuting, muteEndUnixMilli is ignored.
	MuteChat(ctx context.Context, remoteID string, mute bool, muteEndUnixMilli int64) error
	// ArchiveChat toggles the archived flag for the given remote.
	ArchiveChat(ctx context.Context, remoteID string, archive bool) error
	// MarkChatRead toggles the chat read state. read=true closes the unread
	// watermark (emits channel.remote_chat_seen downstream via the echo
	// pipeline); read=false sets the chat back to unread.
	MarkChatRead(ctx context.Context, remoteID string, read bool) error
}

// ChannelFactory creates Channel instances.
type ChannelFactory interface {
	Create(integrationID uuid.UUID, config ChannelConfig) (Channel, error)
}
