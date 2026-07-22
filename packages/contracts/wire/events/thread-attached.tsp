import "./_base.tsp";

namespace TemplateContracts;

@doc("BC4 Thread & Routing -> BC5 Issue Execution. A conversation was bound to a workspace + providers; warms up workspace indexing. The ContactRef VO is flattened to scalar contact* fields.")
model ThreadAttachedEvent extends IntegrationEvent {
  name: "integration.thread.attached";
  threadId: string;
  // Thread-level channel binding (the channel the thread is bound to), NOT a flattened ContactRef member.
  // Intentionally bare `channelId` to mirror the top-level `channelId` on ChannelMessageReceivedEvent and
  // the `channel_id` column on the threads table; only the contact* fields are the flattened ContactRef VO.
  @doc("The channel this thread is bound to (thread-level binding, not part of the flattened ContactRef).")
  channelId: string;
  contactExternalId: string;
  contactDisplayName: string;
  contactKind: ContactKind;
  workspaceId: string;
  providers: ProviderKind[];
}
