package enums

import "template/contracts-go/wire"

// Platform is the messaging platform a Channel bridges. Retargeted onto the
// frozen contracts wire binding (single source) — the Go domain no longer
// redeclares a divergent set. Value-set reconciled to the rich gateway model:
// WHATSAPP (the realized bridge) | INTERNAL (the daemon's in-process channel,
// used by the message projector). Identifiers preserved for existing callers.
type Platform = wire.ChannelKind

const (
	PlatformWhatsApp = wire.ChannelKindWHATSAPP
	PlatformInternal = wire.ChannelKindINTERNAL
)
