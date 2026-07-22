import "./_base.tsp";

namespace TemplateContracts;

@doc("BC5 Issue Execution -> BC4 Thread & Routing. A stop was resolved by the operator. TAKE_OVER additionally pauses the thread (the consumer looks up issue -> thread). Payload kept exactly as the frozen draft: stopId, issueId, resolution.")
model IssueStopResolvedEvent extends IntegrationEvent {
  name: "integration.issue.stop_resolved";
  stopId: string;
  issueId: string;
  resolution: StopResolution;
}
