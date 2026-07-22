package gateway

// ──────────────────────────────────────────────
// Message content types passed through the Channel port.
// ──────────────────────────────────────────────
// These structs represent the use case's intent when sending a message.
// The Channel implementation consumes them via type-switch and translates
// to platform-specific protocol + persistence formats.

// SendTextContent is the send payload for text messages.
type SendTextContent struct {
	Text            string
	QuotedMessageID string
	// Link preview fields (used by send_link use case, MessageType=TEXT)
	LinkPreview  bool
	Title        string
	Description  string
	ThumbnailURL string
}

// SendImageContent is the send payload for image messages.
type SendImageContent struct {
	MediaURL  string
	Caption   string
	Mentioned []string
}

// SendVideoContent is the send payload for video messages.
type SendVideoContent struct {
	MediaURL string
	Caption  string
}

// SendAudioContent is the send payload for audio messages.
type SendAudioContent struct {
	MediaURL string
}

// SendDocumentContent is the send payload for document messages.
type SendDocumentContent struct {
	MediaURL string
	FileName string
	Mimetype string
}

// SendStickerContent is the send payload for sticker messages.
type SendStickerContent struct {
	MediaURL string
}

// SendLocationContent is the send payload for location messages.
type SendLocationContent struct {
	Latitude  float64
	Longitude float64
	Name      string
	Address   string
}

// SendContactInfo holds a single contact entry for sending.
type SendContactInfo struct {
	FullName     string
	PhoneNumber  string
	Organization string
	Email        string
}

// SendContactContent is the send payload for contact messages.
type SendContactContent struct {
	Contacts []SendContactInfo
}

// SendPollOption holds a single poll option.
type SendPollOption struct {
	OptionName string
}

// SendPollContent is the send payload for poll messages.
type SendPollContent struct {
	Name            string
	Options         []SendPollOption
	SelectableCount int
}

// SendListRow holds a single list row.
type SendListRow struct {
	Title       string
	Description string
	RowID       string
}

// SendListSection holds a single list section.
type SendListSection struct {
	Title string
	Rows  []SendListRow
}

// SendListContent is the send payload for list messages.
type SendListContent struct {
	Title       string
	Description string
	ButtonText  string
	FooterText  string
	Sections    []SendListSection
}

// SendButtonItem holds a single button.
type SendButtonItem struct {
	ButtonID    string
	DisplayText string
}

// SendButtonContent is the send payload for button messages.
type SendButtonContent struct {
	Title       string
	Description string
	Footer      string
	Buttons     []SendButtonItem
}

// SendReactionKey identifies the message being reacted to.
type SendReactionKey struct {
	RemoteID string
	FromMe   bool
	ID       string
}

// SendReactionContent is the send payload for reaction messages.
type SendReactionContent struct {
	Key      SendReactionKey
	Reaction string
}

// SendStatusContent is the send payload for status/story messages.
type SendStatusContent struct {
	Type            string // text, image, video, audio
	Content         string // text content or media URL
	Caption         string
	BackgroundColor string
	Font            string
}

// SendForwardContent is the send payload for forwarded messages.
type SendForwardContent struct {
	RemoteID  string
	MessageID string
}

// SendMediaContent is a generic send payload for media messages (image/video/document).
type SendMediaContent struct {
	MediaURL string
	Caption  string
	FileName string
}

// InternalTextContent represents an internal (non-platform) text message.
type InternalTextContent struct {
	Text string `json:"text"`
}
