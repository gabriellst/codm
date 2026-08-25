import "./_base.tsp";

namespace TemplateContracts;

@doc("BC1 Channel Gateway. A typing/recording indicator inside a specific chat. Descends the origin integration.channel.chat_presence_updated (whatsmeow *events.ChatPresence). state names the transient indicator (composing | recording | paused). ownerId travels on the envelope.")
model ChannelChatPresenceUpdatedEvent extends IntegrationEvent {
  name: "integration.channel.chat_presence_updated";
  @format("uuid")
  channelId: string;
  chatId: string;
  senderId: string;
  state: ChatPresenceType;
  @encode("rfc3339", string)
  observedAt: utcDateTime;
  @doc("Verbatim payload field (redeclares the envelope name on purpose): the wire payload carries the owner in addition to the envelope.")
  ownerId: string;
}
