package enums

import "template/contracts-go/wire"

// Direction classifies a Message as sent (outbound) or received (inbound).
// Retargeted onto the frozen contracts wire binding (classification §C.1: exact
// value-set match) — a name/import-only swap; identifiers preserved.
type Direction = wire.Direction

const (
	DirectionSent     = wire.DirectionSENT
	DirectionReceived = wire.DirectionRECEIVED
)
