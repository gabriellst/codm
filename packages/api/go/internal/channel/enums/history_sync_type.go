package enums

// HistorySyncType classifies the whatsmeow HistorySync event by its SyncType
// field. We only surface the two user-facing variants; whatsmeow's FULL,
// PUSH_NAME, NON_BLOCKING_DATA, and ON_DEMAND types are dropped at the mapper.
type HistorySyncType string

const (
	HistorySyncTypeInitial HistorySyncType = "initial" // whatsmeow INITIAL_BOOTSTRAP
	HistorySyncTypeRecent  HistorySyncType = "recent"  // whatsmeow RECENT
)
