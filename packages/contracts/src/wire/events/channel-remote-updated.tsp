import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway. A remote's profile snapshot changed (user rename, group subject/description). Descends the origin integration.channel.remote_updated. Users carry displayName only; groups carry displayName (subject) + optional description. The source field `name` is renamed displayName to avoid colliding with the envelope's `name` discriminator. Membership changes ride the membership_added/removed events, not this one. The source RemoteType is harmonized onto ContactKind (USER->CONTACT). ownerId travels on the envelope.")
model ChannelRemoteUpdatedEvent extends IntegrationEvent {
  name: "integration.channel.remote_updated";
  channelId: string;
  remoteId: string;
  contactKind: ContactKind;
  displayName: string;
  description?: string;
  @encode("rfc3339", string)
  observedAt: utcDateTime;
}
