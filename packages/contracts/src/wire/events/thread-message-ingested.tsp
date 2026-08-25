import "./_base.tsp";

namespace TemplateContracts;

@doc("BC4 Thread & Routing -> consumers. An inbound message was appended to a thread's transcript. Closes the threadId gap `integration.channel_message.received` cannot: that fact is addressed by (channelId, remoteId) — a WhatsApp JID — not by threadId, so a browser console could not scope a live update to one thread without a server-side join. Published by the bridge that already owns thread.* facts (PublishThreadIntegrationEvents), from the domain event IngestChannelMessage raises with threadId already resolved — no lookup.")
model ThreadMessageIngestedEvent extends IntegrationEvent {
  name: "integration.thread.message_ingested";
  threadId: string;
}
