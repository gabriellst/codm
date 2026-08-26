import "./_base.tsp";

namespace TemplateContracts;

@doc("BC6 Terminal -> BC4 Thread & Routing. An agent stopped and needs the human; flips the thread to NEEDS_ATTENTION, lights the dock badge and the Home callout. Renamed from integration.issue.stop_raised in B4: the Stop is a child of the THREAD aggregate, and a contract is named after its owner.")
model ThreadStopRaisedEvent extends IntegrationEvent {
  name: "integration.thread.stop_raised";
  stopId: string;

  @doc("OPTIONAL since B4 (aggregate-boundaries spec, decision 4). A thread-level stop — the orchestrator asking for approval before any issue exists — has none, and while this key was required that case was unreachable no matter what the aggregate allowed.")
  issueId?: string;

  threadId: string;
  kind: StopKind;

  @doc("The human-readable reason the agent gave. ADDITIVE field (GOAL-agent-abstraction Fase 6, §4.4 item (i)): without it the text of `RaiseStop(kind, detail)` and the question of `AskOperator(question)` die at the bridge and the Needs-you card is born empty. Empty string when the fact carries no text — required rather than optional so no producer can omit it silently.")
  detail: string;
}
