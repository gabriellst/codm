import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway. A tombstone for a previously sent/received message. Descends the origin channel.message_deleted domain event, promoted to the wire per the full-port mandate. The gateway.messages read model stamps deleted_at and hides the row; the original sent/received fact stays in the event log for audit. ownerId travels on the envelope.")
model ChannelMessageDeletedEvent extends IntegrationEvent {
  name: "integration.channel_message.deleted";
  channelId: string;
  messageId: string;
  remoteId: string;
  platform: ChannelKind;
}
