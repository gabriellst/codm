package enums

import "template/contracts-go/wire"

// HistorySyncType classifies the whatsmeow HistorySync event by its SyncType
// field. We only surface the two user-facing variants; whatsmeow's FULL,
// PUSH_NAME, NON_BLOCKING_DATA, and ON_DEMAND types are dropped at the mapper.
// Retargeted onto the frozen contracts wire binding (classification §C.1: exact
// value-set match) — a name/import-only swap.
type HistorySyncType = wire.HistorySyncType

const (
	HistorySyncTypeInitial = wire.HistorySyncTypeinitial // whatsmeow INITIAL_BOOTSTRAP
	HistorySyncTypeRecent  = wire.HistorySyncTyperecent  // whatsmeow RECENT
)
