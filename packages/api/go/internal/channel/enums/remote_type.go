package enums

import "template/contracts-go/wire"

// RemoteType classifies a channel.remote_created / remote_updated entity.
// Retargeted onto the frozen contracts wire binding (single source) — the Go
// domain no longer redeclares a divergent set. Value-set reconciled to the rich
// gateway RemoteType: USER | GROUP | BROADCAST (the wire enum is ContactKind,
// which absorbed this set). Identifiers preserved for existing callers.
type RemoteType = wire.ContactKind

const (
	RemoteTypeUser      = wire.ContactKindUSER
	RemoteTypeGroup     = wire.ContactKindGROUP
	RemoteTypeBroadcast = wire.ContactKindBROADCAST
)
