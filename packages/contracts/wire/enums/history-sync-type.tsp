namespace TemplateContracts;

@doc("Classifies a whatsmeow HistorySync batch by its SyncType. Descends the medscall channel HistorySyncType — only the two user-facing variants are surfaced (FULL, PUSH_NAME, NON_BLOCKING_DATA, ON_DEMAND are dropped at the source mapper). Lowercase wire values preserved verbatim. Carried by the sync_progress wire event's `historySyncType` field.")
enum HistorySyncType {
  INITIAL: "initial",
  RECENT: "recent",
}
