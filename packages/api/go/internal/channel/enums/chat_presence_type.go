package enums

type ChatPresenceType string

// Values: composing recording paused
const (
	ChatPresenceTypeComposing ChatPresenceType = "composing"
	ChatPresenceTypeRecording ChatPresenceType = "recording"
	ChatPresenceTypePaused    ChatPresenceType = "paused"
)
