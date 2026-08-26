import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway. An outbound message left the gateway (the raw projection driver behind gateway.messages, distinct from the leaner BC4-facing outbound_delivered). Descends the origin channel.message_sent domain event, promoted to the wire per the full-port mandate. The content discriminated union (Platform,MessageType) is opaque on the wire — carried JSON-serialized in contentJson. platformData is dropped (per-platform opaque). ownerId travels on the envelope.")
model ChannelMessageSentEvent extends IntegrationEvent {
  name: "integration.channel_message.sent";
  channelId: string;
  messageId: string;
  internalMessageId: string;
  remoteId: string;
  senderId: string;
  isGroup: boolean;
  timestamp: int64;
  @encode("rfc3339", string)
  observedAt: utcDateTime;
  messageType: MessageType;
  contentJson: string;
  platform: ChannelKind;
}
