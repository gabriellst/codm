import "./_base.tsp";

namespace TemplateContracts;

@doc("BC5 Issue Execution -> BC4 Thread & Routing. An agent stopped and needs the human; flips the thread to NEEDS_ATTENTION, lights the dock badge and the Home callout.")
model IssueStopRaisedEvent extends IntegrationEvent {
  name: "integration.issue.stop_raised";
  stopId: string;
  issueId: string;
  threadId: string;
  kind: StopKind;
}
