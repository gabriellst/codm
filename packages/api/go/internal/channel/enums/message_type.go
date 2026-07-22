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
