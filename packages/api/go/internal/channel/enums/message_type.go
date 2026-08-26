package enums

import "template/contracts-go/wire"

// MessageType is retargeted onto the frozen contracts wire binding
// (packages/contracts/generated/go/wire). Classification §C.1: exact value-set
// match, so this is a name/import-only swap — the Go-idiomatic constant
// identifiers the service already references are preserved; only their
// definitions now resolve to the generated enum. Runtime values are byte-identical.
type MessageType = wire.MessageType

// Values: TEXT IMAGE VIDEO AUDIO DOCUMENT STICKER LOCATION CONTACT POLL LIST BUTTON REACTION STATUS
const (
	MessageTypeText     = wire.MessageTypeTEXT
	MessageTypeImage    = wire.MessageTypeIMAGE
	MessageTypeVideo    = wire.MessageTypeVIDEO
	MessageTypeAudio    = wire.MessageTypeAUDIO
	MessageTypeDocument = wire.MessageTypeDOCUMENT
	MessageTypeSticker  = wire.MessageTypeSTICKER
	MessageTypeLocation = wire.MessageTypeLOCATION
	MessageTypeContact  = wire.MessageTypeCONTACT
	MessageTypePoll     = wire.MessageTypePOLL
	MessageTypeList     = wire.MessageTypeLIST
	MessageTypeButton   = wire.MessageTypeBUTTON
	MessageTypeReaction = wire.MessageTypeREACTION
	MessageTypeStatus   = wire.MessageTypeSTATUS
)
