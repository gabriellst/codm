package enums

// Direction classifies a Message as sent (outbound) or received (inbound).
type Direction string

const (
	DirectionSent     Direction = "SENT"
	DirectionReceived Direction = "RECEIVED"
)
