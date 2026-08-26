package enums

import "template/contracts-go/wire"

// ChannelStatus is the connection lifecycle of a Channel. Retargeted onto the
// frozen contracts wire binding (single source) — the Go domain no longer
// redeclares a divergent set. Value-set reconciled to the rich gateway model:
// CREATED -> CONNECTING -> CONNECTED -> DISCONNECTED, with DELETED as the
// soft-delete tombstone. Identifiers preserved for existing callers.
type ChannelStatus = wire.ChannelStatus

const (
	ChannelStatusCreated      = wire.ChannelStatusCREATED
	ChannelStatusConnecting   = wire.ChannelStatusCONNECTING
	ChannelStatusConnected    = wire.ChannelStatusCONNECTED
	ChannelStatusDisconnected = wire.ChannelStatusDISCONNECTED
	ChannelStatusDeleted      = wire.ChannelStatusDELETED
)
