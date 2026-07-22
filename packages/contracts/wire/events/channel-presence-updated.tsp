import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway. A contact's overall availability changed (online/offline, lastSeen advanced). Descends the medscall integration.channel.presence_updated (whatsmeow *events.Presence). Carries the raw unavailable boolean + optional lastSeen unix timestamp; the PresenceType enum is the harmonized named-state companion. ownerId travels on the envelope.")
model ChannelPresenceUpdatedEvent extends IntegrationEvent {
  name: "integration.channel.presence_updated";
  channelId: string;
  remoteId: string;
  unavailable: boolean;
  lastSeen?: int64;
  @encode("rfc3339", string)
  observedAt: utcDateTime;
}
