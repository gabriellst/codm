package enums

type PresenceType string

// Values: AVAILABLE UNAVAILABLE COMPOSING RECORDING PAUSED
const (
	PresenceTypeAvailable   PresenceType = "AVAILABLE"
	PresenceTypeUnavailable PresenceType = "UNAVAILABLE"
	PresenceTypeComposing   PresenceType = "COMPOSING"
	PresenceTypeRecording   PresenceType = "RECORDING"
	PresenceTypePaused      PresenceType = "PAUSED"
)
