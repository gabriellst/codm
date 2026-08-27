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

// SendImageContent is the send payload for image messages. Exactly one of
// MediaURL (http(s)/data:) or MediaPath (local file under the gateway's own
// media store) is expected to be set — callers validate that upstream.
type SendImageContent struct {
	MediaURL  string
	MediaPath string
	Caption   string
	Mentioned []string
}

// SendVideoContent is the send payload for video messages. See SendImageContent
// for the MediaURL/MediaPath contract.
type SendVideoContent struct {
	MediaURL  string
	MediaPath string
	Caption   string
}

// SendAudioContent is the send payload for audio messages. See SendImageContent
// for the MediaURL/MediaPath contract.
type SendAudioContent struct {
	MediaURL  string
	MediaPath string
}

// SendDocumentContent is the send payload for document messages. See
// SendImageContent for the MediaURL/MediaPath contract.
type SendDocumentContent struct {
	MediaURL  string
	MediaPath string
	FileName  string
	Mimetype  string
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
//
// WhatsApp addresses a reaction by the WHOLE message key — remote + fromMe + id
// + participant — and whatsmeow derives the last two from the `sender` JID it is
// handed (BuildMessageKey). So the key is only complete when it also says WHO
// authored the target message, which is what SenderID carries.
type SendReactionKey struct {
	RemoteID string
	FromMe   bool
	ID       string
	// SenderID is the JID of whoever AUTHORED the message being reacted to, and
	// it is what makes a reaction stick in a GROUP.
	//
	// In a group the chat JID is the group (@g.us) and the author is a
	// participant, so a key built from the chat alone points its `participant`
	// slot at the group itself — the reaction addresses no message and no client
	// ever renders it. In a DM the two coincide (chat JID == the contact), which
	// is exactly why the bug only ever showed up in groups.
	//
	// OPTIONAL, and deliberately so: `FromMe` messages need no participant (the
	// device's own JID answers it), and a caller that has no author still gets
	// the pre-existing chat-JID fallback rather than a validation error.
	SenderID string
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

// SendMediaContent is a generic send payload for media messages
// (image/video/document). See SendImageContent for the MediaURL/MediaPath
// contract.
type SendMediaContent struct {
	MediaURL  string
	MediaPath string
	Caption   string
	FileName  string
}

// InternalTextContent represents an internal (non-platform) text message.
type InternalTextContent struct {
	Text string `json:"text"`
}
