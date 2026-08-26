import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway. One HistorySync batch finished inserting message rows. Descends the origin integration.channel.messages_synced. Summary counts only (no per-message data) — lets consumers invalidate the thread/message views. ownerId travels on the envelope.")
model ChannelMessagesSyncedEvent extends IntegrationEvent {
  name: "integration.channel.messages_synced";
  @format("uuid")
  channelId: string;
  @doc("Verbatim payload field (redeclares the envelope name on purpose; declared before the counts to preserve the marshaled key order): the wire payload carries the owner in addition to the envelope.")
  ownerId: string;
  total: int32;
  inserted: int32;
}
