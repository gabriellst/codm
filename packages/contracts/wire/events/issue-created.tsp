import "./_base.tsp";

namespace TemplateContracts;

@doc("BC5 Agent Runtime -> console/SSE. An issue was FORKED from a conversation: the operator asked for it in words and the orchestrator declared it through the `issue/create` tool. Distinct from `issue.opened`, which the worker raises when its first turn spawns — this one is the birth, that one is the start of work. `originEntryId` is the transcript entry whose message asked, and it is the anchor the composed answer quotes when the work finishes; it travels here so a consumer can render the thread of it without joining.")
model IssueCreatedEvent extends IntegrationEvent {
  name: "integration.issue.created";
  issueId: string;
  threadId: string;
  key: string;
  title: string;
  goal: string;
  originEntryId: string;
}
