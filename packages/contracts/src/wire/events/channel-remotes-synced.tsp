import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway. One bootstrap contact-sync pass finished inserting remote rows. Descends the origin integration.channel.remotes_synced (the source's contacts_synced fact). Summary counts only — lets consumers invalidate the sidebar/remote list. ownerId travels on the envelope.")
model ChannelRemotesSyncedEvent extends IntegrationEvent {
  name: "integration.channel.remotes_synced";
  @format("uuid")
  channelId: string;
  @doc("Verbatim payload field (redeclares the envelope name on purpose; declared before the counts to preserve the marshaled key order): the wire payload carries the owner in addition to the envelope.")
  ownerId: string;
  total: int32;
  inserted: int32;
}
