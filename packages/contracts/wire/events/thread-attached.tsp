import "./_base.tsp";

namespace TemplateContracts;

@doc("BC4 Thread & Routing -> BC5 Issue Execution. A conversation was bound to a workspace + providers; warms up workspace indexing. The ContactRef VO is flattened to scalar contact* fields.")
model ThreadAttachedEvent extends IntegrationEvent {
  name: "integration.thread.attached";
  threadId: string;
  channelId: string;
  contactExternalId: string;
  contactDisplayName: string;
  contactKind: ContactKind;
  workspaceId: string;
  providers: ProviderKind[];
}
