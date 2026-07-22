package enums

import "template/contracts-go/wire"

// PresenceType is retargeted onto the frozen contracts wire binding
// (classification §C.1: exact value-set match) — a name/import-only swap.
type PresenceType = wire.PresenceType

// Values: AVAILABLE UNAVAILABLE COMPOSING RECORDING PAUSED
const (
	PresenceTypeAvailable   = wire.PresenceTypeAVAILABLE
	PresenceTypeUnavailable = wire.PresenceTypeUNAVAILABLE
	PresenceTypeComposing   = wire.PresenceTypeCOMPOSING
	PresenceTypeRecording   = wire.PresenceTypeRECORDING
	PresenceTypePaused      = wire.PresenceTypePAUSED
)
