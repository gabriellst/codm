import "./_base.tsp";

namespace TemplateContracts;

@doc("BC5 Issue Execution -> BC4 Thread & Routing. An issue completed; starts the 24h auto-archive clock and updates status/metrics.")
model IssueCompletedEvent extends IntegrationEvent {
  name: "integration.issue.completed";
  issueId: string;
  threadId: string;
  key: string;
  @encode("rfc3339", string)
  completedAt: utcDateTime;
}
