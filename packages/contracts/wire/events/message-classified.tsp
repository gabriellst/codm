import "./_base.tsp";

namespace TemplateContracts;

@doc("BC4 Thread & Routing -> BC5 Issue Execution. A single-stream inbound message was demultiplexed into an issue (or fell through to clarification). issueId is absent only when the method resolved to a clarification.")
model MessageClassifiedEvent extends IntegrationEvent {
  name: "integration.message.classified";
  threadId: string;
  entryId: string;
  method: ClassificationMethod;
  issueId?: string;
}
