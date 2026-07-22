// CONTEXT-ORIGIN: medscall/software/monorepo/packages/channel@ff66dbb1ee0fcd6212e5bf68879fa1d5a0a9cd1b (2026-07-20)
// Source path: packages/channel/internal/channel/enums/message_type.go
// Harvested verbatim for the enum skill exemplar set — do not edit; re-harvest instead.
package enums

type MessageType string

// Values: TEXT IMAGE VIDEO AUDIO DOCUMENT STICKER LOCATION CONTACT POLL LIST BUTTON REACTION STATUS
const (
	MessageTypeText     MessageType = "TEXT"
	MessageTypeImage    MessageType = "IMAGE"
	MessageTypeVideo    MessageType = "VIDEO"
	MessageTypeAudio    MessageType = "AUDIO"
	MessageTypeDocument MessageType = "DOCUMENT"
	MessageTypeSticker  MessageType = "STICKER"
	MessageTypeLocation MessageType = "LOCATION"
	MessageTypeContact  MessageType = "CONTACT"
	MessageTypePoll     MessageType = "POLL"
	MessageTypeList     MessageType = "LIST"
	MessageTypeButton   MessageType = "BUTTON"
	MessageTypeReaction MessageType = "REACTION"
	MessageTypeStatus   MessageType = "STATUS"
)
