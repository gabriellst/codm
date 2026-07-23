import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway. A remote was soft-deleted (contact removed / left permanently). Descends the medscall integration.channel.remote_deleted. The gateway.remotes read model stamps deleted_at without removing the row. ownerId travels on the envelope.")
model ChannelRemoteDeletedEvent extends IntegrationEvent {
  name: "integration.channel.remote_deleted";
  @format("uuid")
  channelId: string;
  remoteId: string;
  @doc("Verbatim gateway wire key `at` (flat-events sanctioned amendment: the harmonized `deletedAt` rename would change the marshaled wire key; the wire-identity invariant wins).")
  @encode("rfc3339", string)
  at: utcDateTime;
  @doc("Verbatim payload field (redeclares the envelope name on purpose): the wire payload carries the owner in addition to the envelope.")
  ownerId: string;
}
