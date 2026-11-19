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

  @doc("Which CLI will work the issue — the THREAD's choice, resolved by the agent runtime at fork time. It rides the event because the issue context materialises the row from this fact alone and cannot read a thread: no `issue -> thread` edge is declared, and the row cannot be created without it.")
  provider: ProviderKind;

  @doc("Fase 4 — the priority the task was born with (the agent runtime owns it; the issue context keeps a read copy). Optional: facts from daemons before fase 4 do not carry it, and the Go side only carries it.")
  priority?: IssuePriority;

  @doc("Fase 4 — why the task has that priority (CLIENT_BUG is claimed first).")
  priorityReason?: PriorityReason;

  @doc("Fase 4 — what the task does; chooses the model it runs on.")
  workKind?: IssueWorkKind;

  @doc("Fase 4 — the model fixed for the task at birth; absent when it inherits the conversation's model.")
  `model`?: AgentModelId;
}
