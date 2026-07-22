import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway. One HistorySync batch finished inserting message rows. Descends the medscall integration.channel.messages_synced. Summary counts only (no per-message data) — lets consumers invalidate the thread/message views. ownerId travels on the envelope.")
model ChannelMessagesSyncedEvent extends IntegrationEvent {
  name: "integration.channel.messages_synced";
  channelId: string;
  total: int32;
  inserted: int32;
}
