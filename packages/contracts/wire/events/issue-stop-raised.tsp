import "./_base.tsp";

namespace TemplateContracts;

@doc("BC5 Issue Execution -> BC4 Thread & Routing. An agent stopped and needs the human; flips the thread to NEEDS_ATTENTION, lights the dock badge and the Home callout.")
model IssueStopRaisedEvent extends IntegrationEvent {
  name: "integration.issue.stop_raised";
  stopId: string;
  issueId: string;
  threadId: string;
  kind: StopKind;

  @doc("The human-readable reason the agent gave. ADDITIVE field (GOAL-agent-abstraction Fase 6, §4.4 item (i)): without it the text of `RaiseStop(kind, detail)` and the question of `AskOperator(question)` die at the bridge and the Needs-you card is born empty. Empty string when the fact carries no text — required rather than optional so no producer can omit it silently.")
  detail: string;
}
