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
  @doc("Platform id of the message this one replies to. The gateway turns it into a real WhatsApp quote (waE2E.ContextInfo.StanzaID).")
  quotedMessageId?: string;
  @doc("The transcript entry this outbound message IS. Carried so the delivery leg can link the sent platform id back to it in the consumed ledger — without that link, a human quoting our own reply resolves to nothing and the reply-quote shortcut cannot route.")
  replyEntryId?: string;
}
