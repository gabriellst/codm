import "./_base.tsp";

namespace TemplateContracts;

@doc("BC4 Thread & Routing -> BC1 Channel Gateway (command-event). Orders the gateway to deliver an outbound message. In medscall this is an HTTP send call; modeled here as an integration event so it rides the same outbox/transport as the rest of the lock. The label fields carry the issue/thread a SYSTEM message belongs to. ownerId travels on the envelope.")
model ChannelDeliveryRequestedEvent extends IntegrationEvent {
  name: "integration.channel.delivery_requested";
  channelId: string;
  contactExternalId: string;
  contactDisplayName: string;
  contactKind: ContactKind;
  text: string;
  labelIssueKey?: string;
  labelThreadId?: string;
  author: MessageAuthor;
}
