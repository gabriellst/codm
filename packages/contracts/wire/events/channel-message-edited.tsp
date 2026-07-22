import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway. A previously sent/received message's content was revised. Descends the medscall channel.message_edited domain event, promoted to the wire per the full-port mandate. The gateway.messages read model overlays the newest edit's content onto the original row and stamps edited_at. Content is opaque on the wire (contentJson). ownerId travels on the envelope.")
model ChannelMessageEditedEvent extends IntegrationEvent {
  name: "integration.channel_message.edited";
  channelId: string;
  messageId: string;
  remoteId: string;
  senderId: string;
  timestamp: int64;
  messageType: MessageType;
  contentJson: string;
  platform: ChannelKind;
}
