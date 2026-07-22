package whatsapp

import "encoding/json"

// MarshalContent marshals any typed content struct to json.RawMessage.
func MarshalContent(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

// ──────────────────────────────────────────────
// WhatsApp content types
// ──────────────────────────────────────────────

// WhatsAppTextContent represents a WhatsApp text message.
type WhatsAppTextContent struct {
	Text                string               `json:"text"`
	ExtendedTextMessage *ExtendedTextData    `json:"extendedTextMessage,omitempty"`
	ContextInfo         *WhatsAppContextInfo `json:"contextInfo,omitempty"`
	Forward             bool                 `json:"forward,omitempty"`
	RemoteID            string               `json:"remoteId,omitempty"`
	MessageID           string               `json:"messageId,omitempty"`
}

// WhatsAppContextInfo carries the quoted-message metadata attached to a
// received message. The read model enriches QuotedSenderName from
// remote_configs.custom_name → remotes.name so the frontend never has to
// resolve participant JIDs to display names.
type WhatsAppContextInfo struct {
	StanzaID             string          `json:"stanzaId,omitempty"`
	Participant          string          `json:"participant,omitempty"`
	QuotedMessageType    string          `json:"quotedMessageType,omitempty"`
	QuotedMessageContent json.RawMessage `json:"quotedMessageContent,omitempty"`
	QuotedSenderName     string          `json:"quotedSenderName,omitempty"`
}

// ExtendedTextData is the nested data for extended text messages.
type ExtendedTextData struct {
	Text        string `json:"text,omitempty"`
	MatchedText string `json:"matchedText,omitempty"`
	Title       string `json:"title,omitempty"`
}

// WhatsAppImageContent represents a WhatsApp image message.
type WhatsAppImageContent struct {
	ImageMessage ImageMessageData `json:"imageMessage"`
}

// ImageMessageData is the nested data for image messages.
type ImageMessageData struct {
	URL           string `json:"url,omitempty"`
	Caption       string `json:"caption,omitempty"`
	Mimetype      string `json:"mimetype,omitempty"`
	JPEGThumbnail []byte `json:"jpegThumbnail,omitempty"`
	FileLength    uint64 `json:"fileLength,omitempty"`
	Height        uint32 `json:"height,omitempty"`
	Width         uint32 `json:"width,omitempty"`
}

// WhatsAppVideoContent represents a WhatsApp video message.
type WhatsAppVideoContent struct {
	VideoMessage VideoMessageData `json:"videoMessage"`
}

// VideoMessageData is the nested data for video messages.
type VideoMessageData struct {
	URL           string `json:"url,omitempty"`
	Caption       string `json:"caption,omitempty"`
	Mimetype      string `json:"mimetype,omitempty"`
	JPEGThumbnail []byte `json:"jpegThumbnail,omitempty"`
	Seconds       uint32 `json:"seconds,omitempty"`
	FileLength    uint64 `json:"fileLength,omitempty"`
}

// WhatsAppAudioContent represents a WhatsApp audio message.
type WhatsAppAudioContent struct {
	AudioMessage AudioMessageData `json:"audioMessage"`
}

// AudioMessageData is the nested data for audio messages.
type AudioMessageData struct {
	URL        string `json:"url,omitempty"`
	Mimetype   string `json:"mimetype,omitempty"`
	PTT        bool   `json:"ptt,omitempty"`
	Seconds    uint32 `json:"seconds,omitempty"`
	FileLength uint64 `json:"fileLength,omitempty"`
}

// WhatsAppDocumentContent represents a WhatsApp document message.
type WhatsAppDocumentContent struct {
	DocumentMessage DocumentMessageData `json:"documentMessage"`
}

// DocumentMessageData is the nested data for document messages.
type DocumentMessageData struct {
	URL           string `json:"url,omitempty"`
	Caption       string `json:"caption,omitempty"`
	Mimetype      string `json:"mimetype,omitempty"`
	FileName      string `json:"fileName,omitempty"`
	JPEGThumbnail []byte `json:"jpegThumbnail,omitempty"`
	FileLength    uint64 `json:"fileLength,omitempty"`
}

// WhatsAppStickerContent represents a WhatsApp sticker message.
type WhatsAppStickerContent struct {
	StickerMessage StickerMessageData `json:"stickerMessage"`
}

// StickerMessageData is the nested data for sticker messages.
type StickerMessageData struct {
	URL          string `json:"url,omitempty"`
	Mimetype     string `json:"mimetype,omitempty"`
	IsAnimated   bool   `json:"isAnimated,omitempty"`
	PNGThumbnail []byte `json:"pngThumbnail,omitempty"`
	FileLength   uint64 `json:"fileLength,omitempty"`
}

// WhatsAppLocationContent represents a WhatsApp location message.
type WhatsAppLocationContent struct {
	LocationMessage LocationMessageData `json:"locationMessage"`
}

// LocationMessageData is the nested data for location messages.
type LocationMessageData struct {
	DegreesLatitude  float64 `json:"degreesLatitude,omitempty"`
	DegreesLongitude float64 `json:"degreesLongitude,omitempty"`
	Name             string  `json:"name,omitempty"`
	Address          string  `json:"address,omitempty"`
	JPEGThumbnail    []byte  `json:"jpegThumbnail,omitempty"`
}

// WhatsAppContactContent represents a WhatsApp contact message.
type WhatsAppContactContent struct {
	ContactMessage *ContactMessageData `json:"contactMessage,omitempty"`
	Contacts       []ContactData       `json:"contacts,omitempty"`
}

// ContactMessageData is the nested data for a single contact message.
type ContactMessageData struct {
	DisplayName string `json:"displayName,omitempty"`
	VCard       string `json:"vcard,omitempty"`
}

// ContactData represents a contact entry in a multi-contact message.
type ContactData struct {
	FullName     string `json:"fullName"`
	PhoneNumber  string `json:"phoneNumber"`
	Organization string `json:"organization,omitempty"`
	Email        string `json:"email,omitempty"`
}

// WhatsAppPollContent represents a WhatsApp poll creation message.
type WhatsAppPollContent struct {
	PollMessage PollMessageData `json:"pollMessage"`
}

// PollMessageData is the nested data for poll messages.
type PollMessageData struct {
	Question string   `json:"question"`
	Options  []string `json:"options"`
}

// WhatsAppReactionContent represents a WhatsApp reaction message.
type WhatsAppReactionContent struct {
	ReactionMessage ReactionMessageData `json:"reactionMessage"`
	Text            string              `json:"text,omitempty"`
}

// ReactionMessageData is the nested data for reaction messages.
type ReactionMessageData struct {
	Text string           `json:"text"`
	Key  *ReactionKeyData `json:"key,omitempty"`
}

// ReactionKeyData identifies the message being reacted to.
type ReactionKeyData struct {
	ID       string `json:"id,omitempty"`
	RemoteID string `json:"remoteId,omitempty"`
	FromMe   bool   `json:"fromMe,omitempty"`
}
