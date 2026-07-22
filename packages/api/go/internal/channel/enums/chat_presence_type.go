package enums

import "template/contracts-go/wire"

// ChatPresenceType is retargeted onto the frozen contracts wire binding
// (classification §C.1: exact value-set match) — a name/import-only swap.
type ChatPresenceType = wire.ChatPresenceType

// Values: composing recording paused
const (
	ChatPresenceTypeComposing = wire.ChatPresenceTypecomposing
	ChatPresenceTypeRecording = wire.ChatPresenceTyperecording
	ChatPresenceTypePaused    = wire.ChatPresenceTypepaused
)
