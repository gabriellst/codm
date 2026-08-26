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

  @doc("What the agent DECLARED it did, in its own words, via the transitionIssueStatus tool. Persisted on the issue so the console can show why it closed — before the orchestrator pivot this was destructured and discarded in DeclareIssueComplete's COMPLETED branch. Empty when the completion was INFERRED from a clean exit rather than declared.")
  summary?: string;
}
