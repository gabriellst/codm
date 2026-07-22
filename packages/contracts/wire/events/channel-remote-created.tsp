import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway. A Remote aggregate (contact / group / broadcast) was first observed on a channel. Descends the medscall integration.channel.remote_created. Carries identity + kind only; profile fields (name, avatar) arrive via remote_updated. The source RemoteType is harmonized onto ContactKind (USER->CONTACT). ownerId travels on the envelope.")
model ChannelRemoteCreatedEvent extends IntegrationEvent {
  name: "integration.channel.remote_created";
  channelId: string;
  remoteId: string;
  contactKind: ContactKind;
  platform: ChannelKind;
}
